// Native StoreKit (iOS) wrapper around expo-iap.
//
// Exposes a tiny imperative surface the rest of the app can consume
// without dragging any hook into screens that don't actually present
// the paywall. Formerly built on react-native-iap; migrated to expo-iap
// because the RN-IAP native pod fights the current Nitro-Modules setup
// during EAS iOS builds.

import { Platform, Linking, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoIap from "expo-iap";
import {
  allKnownProductIds,
  productIdFor,
  riverIdForProductId,
  setLivePrice,
} from "./products";
import { unlockRunLocally } from "./useUnlocks";

const IS_IOS = Platform.OS === "ios";

let _initialized = false;
let _initInflight: Promise<void> | null = null;

// ─── Trace log ──────────────────────────────────────────────────────────
// In-memory trace of every StoreKit call/event this session, PLUS the
// tail of the previous session (persisted to AsyncStorage). Critical for
// offer-code debugging: redemption happens in the App Store app, and if
// iOS kills us in the background we'd otherwise lose all evidence of
// whether the transaction listener ever fired.
const TRACE_PERSIST_KEY = "@riverright:storekit_trace_v1";
const TRACE: string[] = [];
let PREV_TRACE: string[] = [];
let _prevTraceLoaded = false;

async function loadPrevTrace() {
  if (_prevTraceLoaded) return;
  _prevTraceLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(TRACE_PERSIST_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) PREV_TRACE = arr.filter((x) => typeof x === "string");
  } catch {
    /* best-effort */
  }
}

function trace(msg: string) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  TRACE.push(line);
  if (TRACE.length > 60) TRACE.shift();
  // Persist fire-and-forget so the trace survives an app kill while the
  // user is off redeeming a code in the App Store.
  AsyncStorage.setItem(TRACE_PERSIST_KEY, JSON.stringify(TRACE)).catch(() => {});
  // Also dump to console for `react-native log-ios`.
  // eslint-disable-next-line no-console
  console.log("[storekit]", msg);
}
export function getStoreKitTrace(): string {
  const parts: string[] = [];
  if (PREV_TRACE.length) {
    parts.push("── previous session ──", ...PREV_TRACE.slice(-20));
  }
  parts.push("── this session ──", ...(TRACE.length ? TRACE : ["(no events)"]));
  return parts.join("\n");
}

/** Map riverId → App Store product ID for the reverse lookup we need
 *  when Apple hands us back a productId on restore / purchase. */
function riverIdForProduct(productId: string): string | null {
  // Delegates to the authoritative reverse map in products.ts so every
  // river added to RIVER_TO_PRODUCT_ID (MFS, Main Salmon, future runs)
  // unlocks automatically. Previously this was hardcoded to Desolation
  // only, which caused successful MFS purchases to be rejected with
  // "Purchase didn't complete" even though Apple had charged the user.
  return riverIdForProductId(productId);
}

// ─── StoreKit call serializer ───────────────────────────────────────────
// iOS StoreKit operations through expo-iap are NOT safe to run
// concurrently — overlapping native calls can lock the StoreKit queue and
// leave every promise unresolved forever (hyochan/expo-iap#130). Build 9
// hit exactly this: each foreground resync stacked another
// getAvailablePurchases on top of a still-pending one, and NONE of them
// ever came back — the trace showed the calls starting but never a
// result. All native calls now flow one-at-a-time through this queue,
// and each gets a hard timeout so a hung call is TRACED as evidence
// instead of hanging silently.
let _iapQueue: Promise<void> = Promise.resolve();
function iapCall<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs = 15000
): Promise<T> {
  const run = _iapQueue.then(async () => {
    trace(`${label}: calling`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `TIMEOUT after ${timeoutMs / 1000}s — native call never resolved`
                )
              ),
            timeoutMs
          );
        }),
      ]);
      trace(`${label}: resolved`);
      return result;
    } catch (e: any) {
      trace(`${label}: FAILED ${e?.message || e}`);
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
  // Keep the chain alive even when this call fails so the next queued
  // call still runs.
  _iapQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ─── Transaction listeners ──────────────────────────────────────────────
// THE critical piece for offer-code redemption: when a user redeems a
// code in the App Store app, StoreKit delivers the resulting transaction
// to us through purchaseUpdatedListener — there is no other callback.
// Every event is traced, and the unlock logic is wrapped in try/catch so
// a failure is LOGGED instead of silently swallowed.
let _listenersArmed = false;
function armTransactionListeners() {
  if (_listenersArmed || !IS_IOS) return;
  _listenersArmed = true;
  trace("listeners: arming purchaseUpdated + purchaseError");
  try {
    ExpoIap.purchaseUpdatedListener(async (purchase: any) => {
      _purchaseEventCount += 1;
      const pid = purchase?.productId || purchase?.id;
      trace(
        `purchaseUpdated: FIRED pid=${pid} txId=${
          purchase?.transactionId ?? purchase?.transactionIdentifier ?? "?"
        } state=${purchase?.purchaseState ?? purchase?.transactionState ?? "?"}`
      );
      try {
        const rid = riverIdForProduct(String(pid || ""));
        if (rid) {
          await unlockRunLocally(rid);
          trace(`purchaseUpdated: unlocked river=${rid}`);
        } else {
          trace(`purchaseUpdated: NO river mapped for pid=${pid} — NOT unlocking`);
        }
      } catch (e: any) {
        trace(`purchaseUpdated: UNLOCK ERROR ${e?.message || e}`);
      }
      try {
        await iapCall("finishTransaction(listener)", () =>
          ExpoIap.finishTransaction({ purchase, isConsumable: false } as any)
        );
      } catch {
        /* already traced by iapCall */
      }
    });
    ExpoIap.purchaseErrorListener((err: any) => {
      trace(`purchaseError: FIRED code=${err?.code} msg=${err?.message || err}`);
    });
    trace("listeners: armed OK");
  } catch (e: any) {
    trace(`listeners: FAILED to arm ${e?.message || e}`);
  }
}

// ─── Foreground re-sync ─────────────────────────────────────────────────
// Safety net for offer codes: when the user comes back from the App
// Store, ask Apple directly for the owned-products list and mirror it
// into the local unlock cache. Catches redemptions even if the
// transaction listener missed the event for any reason.
let _appStateHooked = false;
let _resyncInflight = false;
function armForegroundResync() {
  if (_appStateHooked || !IS_IOS) return;
  _appStateHooked = true;
  AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    if (_resyncInflight) {
      trace("appState: active — resync SKIPPED (previous still in flight)");
      return;
    }
    _resyncInflight = true;
    trace("appState: active — resyncing owned products from Apple");
    (async () => {
      try {
        const owned = await restoreRuns();
        trace(`resync: Apple says owned=[${owned.join(",") || "none"}]`);
        for (const id of owned) {
          await unlockRunLocally(id);
        }
      } catch (e: any) {
        trace(`resync: FAILED ${e?.message || e}`);
      } finally {
        _resyncInflight = false;
      }
    })();
  });
}

// ─── Passive startup drain probe ─────────────────────────────────────────
// iOS pushes any pending unfinished transactions straight to the
// purchaseUpdated listener within moments of the observer arming +
// connection opening — no query call needed. The previous ACTIVE drain
// called getAvailablePurchases, which goes through the same StoreKit
// query pipe that is hanging on this device, so it just burned 15s.
// (Build-11 evidence: every query times out even when run ALONE, while
// initConnection resolves instantly — so now we listen instead of ask.)
// This probe answers the key diagnostic question: does purchaseUpdated
// fire at all right after init?
let _purchaseEventCount = 0;
function armPassiveDrainProbe() {
  trace("drain: passive — listening for iOS-pushed pending transactions");
  const baseline = _purchaseEventCount;
  setTimeout(() => {
    const delivered = _purchaseEventCount - baseline;
    trace(
      `drain: ${delivered} purchaseUpdated event(s) within 3s of init` +
        (delivered === 0 ? " — iOS pushed NO pending transactions" : "")
    );
  }, 3000);
}

/** Connects to StoreKit and primes product prices. Safe to call many
 *  times — only the first call actually does work. */
export async function initStoreKit(): Promise<void> {
  if (!IS_IOS) return;
  if (_initialized) return;
  if (_initInflight) return _initInflight;
  _initInflight = (async () => {
    try {
      await loadPrevTrace();
      // Arm listeners BEFORE opening the connection so any transactions
      // StoreKit queued while we were dead (e.g. an offer code redeemed
      // just before an app kill) are delivered the moment we connect.
      armTransactionListeners();
      armForegroundResync();
      await iapCall("initConnection", () => ExpoIap.initConnection());
      _initialized = true;
      // Passive drain: iOS delivers pending transactions to the armed
      // listener on its own — we just log whether any arrive.
      armPassiveDrainProbe();
      await primeProductPrices();
    } catch (e: any) {
      trace(`initStoreKit: FAILED ${e?.message || e}`);
    } finally {
      _initInflight = null;
    }
  })();
  return _initInflight;
}

/** Fetches localized product info from the App Store and writes the
 *  live prices into products.ts so the rest of the UI picks them up. */
export async function primeProductPrices(): Promise<void> {
  if (!IS_IOS) return;
  try {
    const skus = allKnownProductIds();
    if (!skus.length) {
      trace("primeProductPrices: no SKUs configured");
      return;
    }
    trace(`fetchProducts: requesting [${skus.join(",")}]`);
    // expo-iap's canonical product-fetch. `type: "in-app"` (with dash)
    // is the modern arg per the OpenIAP spec — the legacy `"inapp"`
    // string is still accepted but deprecated.
    const products: any[] = (await iapCall("fetchProducts", () =>
      ExpoIap.fetchProducts({
        skus,
        type: "in-app",
      } as any)
    )) as any[];
    trace(`fetchProducts: returned ${products?.length || 0} products`);
    for (const p of products || []) {
      const id = p?.productId || p?.id;
      const price =
        p?.displayPrice ||
        p?.localizedPrice ||
        p?.priceString ||
        (typeof p?.price === "string" ? p.price : null);
      trace(`  product: id=${id} price=${price}`);
      if (id && price) setLivePrice(id, price);
    }
  } catch (e: any) {
    trace(`primeProductPrices: FAILED ${e?.message || e}`);
  }
}

/** Kicks off the App Store purchase sheet for a single river. Resolves
 *  ONLY after the purchase is finished + the transaction is finalized,
 *  or rejects on cancel / error. */
export async function purchaseRun(riverId: string): Promise<void> {
  if (!IS_IOS) throw new Error("In-app purchases are iOS-only.");
  await initStoreKit();
  const sku = productIdFor(riverId);
  trace(`purchaseRun: sku=${sku}`);
  // Verify Apple actually knows about this product BEFORE we open the
  // sheet — otherwise users see a vague "purchase failed" with no clue.
  // (Common causes when products list is empty: agreements not signed,
  // product not yet propagated, bundle ID mismatch, sandbox tester not
  // signed into Settings → App Store → Sandbox Account.)
  await primeProductPrices();
  try {
    // expo-iap uses `request.apple` / `request.google` keys under the
    // OpenIAP spec (not `request.ios` like the old RN-IAP shape).
    // Generous timeout — the promise stays pending while the user
    // interacts with Apple's payment sheet.
    await iapCall(
      "requestPurchase",
      () =>
        ExpoIap.requestPurchase({
          request: {
            apple: { sku },
            google: { skus: [sku] },
          },
          type: "in-app",
        } as any),
      120000
    );
  } catch (e: any) {
    const code = e?.code || e?.errorCode;
    trace(`requestPurchase: threw code=${code} msg=${e?.message || e}`);
    if (
      code === "E_USER_CANCELLED" ||
      code === "userCancelled" ||
      /cancel/i.test(String(e?.message))
    ) {
      throw new Error("CANCELLED");
    }
    throw e;
  }
  // StoreKit hands the completed transaction to purchaseUpdatedListener
  // asynchronously. Give the platform a beat, then verify via the
  // authoritative Apple-provided owned-products list.
  await new Promise((r) => setTimeout(r, 800));
  const owned = await restoreRuns();
  trace(`post-purchase owned: ${owned.join(",") || "(none)"}`);
  if (!owned.includes(riverId)) {
    throw new Error(
      "Purchase didn't complete. Tap Restore Purchases, or try again."
    );
  }
}

/** User-initiated restore: kicks Apple's `AppStore.sync()` FIRST — this
 *  forces the device's StoreKit daemon to resync transaction state with
 *  Apple's servers, and is the one in-app call that can un-wedge a stuck
 *  daemon (the likely culprit when every query hangs while
 *  initConnection succeeds). It may show an App Store sign-in prompt,
 *  which is why we only run it on an explicit Restore tap, per Apple's
 *  own guidance. Then reads the owned-products list as usual. */
export async function restoreRunsWithSync(): Promise<string[]> {
  if (!IS_IOS) return [];
  await initStoreKit();
  try {
    await iapCall("syncIOS(AppStore.sync)", () => (ExpoIap as any).syncIOS(), 30000);
  } catch {
    /* traced by iapCall — still attempt the read below */
  }
  return restoreRuns();
}

/** Returns the list of river IDs the current Apple ID owns. */
export async function restoreRuns(): Promise<string[]> {
  if (!IS_IOS) return [];
  await initStoreKit();
  try {
    const purchases: any[] = (await iapCall("getAvailablePurchases", () =>
      ExpoIap.getAvailablePurchases()
    )) as any[];
    trace(
      `getAvailablePurchases: ${purchases?.length || 0} items [${(purchases || [])
        .map((p: any) => p?.productId || p?.id)
        .join(",")}]`
    );
    const riverIds = new Set<string>();
    for (const p of purchases || []) {
      const pid = p?.productId || p?.id;
      const rid = riverIdForProduct(String(pid || ""));
      if (rid) riverIds.add(rid);
      // Best-effort: finish any lingering non-consumable transactions so
      // they don't keep getting redelivered to listeners.
      try {
        await iapCall("finishTransaction(restore)", () =>
          ExpoIap.finishTransaction({ purchase: p, isConsumable: false } as any)
        );
      } catch {
        /* already traced by iapCall */
      }
    }
    return Array.from(riverIds);
  } catch (e: any) {
    trace(`restoreRuns: FAILED ${e?.message || e}`);
    return [];
  }
}

/**
 * Present Apple's offer-code redemption UI.
 *
 * We deep-link into the App Store's own redemption sheet instead of using
 * StoreKit's `SKPaymentQueue.presentCodeRedemptionSheet()` API. The
 * in-app sheet is a fire-and-forget UIKit call that always returns
 * success from native, but iOS silently refuses to present it when the
 * host app is inside a modal-presented view controller (like our
 * paywall Modal) — with no way for JS to detect the failure. Users see
 * a brief spinner and nothing else. The App Store deep link is the
 * approach used by most production RN apps for this reason: 100%
 * reliable, and once the user completes redemption in the App Store,
 * StoreKit fires the same purchase-completed transaction listener that
 * a paid purchase would, so the unlock flow is identical.
 *
 * `ascAppId` MUST match `eas.json → submit.production.ios.ascAppId`.
 */
const ASC_APP_ID = "6772459732";

export async function presentOfferCodeRedemption(): Promise<boolean> {
  if (!IS_IOS) return false;
  // Ensure the transaction listener is armed BEFORE the user leaves
  // for the App Store, so an incoming redemption is caught the instant
  // they return.
  await initStoreKit();
  // NOTE: do NOT gate on Linking.canOpenURL() here. On iOS,
  // canOpenURL("itms-apps://...") always returns false unless the
  // scheme is declared in LSApplicationQueriesSchemes — which made
  // this function silently bail before ever opening the store. We
  // just attempt openURL directly, falling back to the equivalent
  // https universal link (which iOS routes to the App Store app).
  const itmsUrl = `itms-apps://apps.apple.com/redeem?ctx=offercodes&id=${ASC_APP_ID}`;
  const httpsUrl = `https://apps.apple.com/redeem?ctx=offercodes&id=${ASC_APP_ID}`;
  try {
    trace(`offerCode: opening ${itmsUrl}`);
    await Linking.openURL(itmsUrl);
    trace("offerCode: itms-apps openURL OK");
    return true;
  } catch (e: any) {
    trace(`offerCode: itms-apps failed (${e?.message || e}), trying https`);
  }
  try {
    await Linking.openURL(httpsUrl);
    trace("offerCode: https openURL OK");
    return true;
  } catch (e: any) {
    trace(`offerCode: https failed (${e?.message || e})`);
    return false;
  }
}
