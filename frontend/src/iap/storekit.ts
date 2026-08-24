// Native StoreKit (iOS) wrapper around expo-iap.
//
// Exposes a tiny imperative surface the rest of the app can consume
// without dragging any hook into screens that don't actually present
// the paywall. Formerly built on react-native-iap; migrated to expo-iap
// because the RN-IAP native pod fights the current Nitro-Modules setup
// during EAS iOS builds.

import { Platform, Linking } from "react-native";
import * as ExpoIap from "expo-iap";
import {
  allKnownProductIds,
  productIdFor,
  riverIdForProductId,
  setLivePrice,
} from "./products";

const IS_IOS = Platform.OS === "ios";

let _initialized = false;
let _initInflight: Promise<void> | null = null;

// In-memory trace of every StoreKit call we made this session. Surfaced
// by the diagnostic Alert on the paywall when something silently fails.
const TRACE: string[] = [];
function trace(msg: string) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  TRACE.push(line);
  if (TRACE.length > 50) TRACE.shift();
  // Also dump to console for `react-native log-ios`.
  // eslint-disable-next-line no-console
  console.log("[storekit]", msg);
}
export function getStoreKitTrace(): string {
  return TRACE.length ? TRACE.join("\n") : "(no events)";
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

/** Connects to StoreKit and primes product prices. Safe to call many
 *  times — only the first call actually does work. */
export async function initStoreKit(): Promise<void> {
  if (!IS_IOS) return;
  if (_initialized) return;
  if (_initInflight) return _initInflight;
  _initInflight = (async () => {
    try {
      trace("initConnection: calling");
      await ExpoIap.initConnection();
      _initialized = true;
      trace("initConnection: OK");
      await primeProductPrices();
    } catch (e: any) {
      trace(`initConnection: FAILED ${e?.message || e}`);
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
    const products: any[] = await ExpoIap.fetchProducts({
      skus,
      type: "in-app",
    } as any);
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
    trace("requestPurchase: calling");
    // expo-iap uses `request.apple` / `request.google` keys under the
    // OpenIAP spec (not `request.ios` like the old RN-IAP shape).
    await ExpoIap.requestPurchase({
      request: {
        apple: { sku },
        google: { skus: [sku] },
      },
      type: "in-app",
    } as any);
    trace("requestPurchase: resolved");
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

/** Returns the list of river IDs the current Apple ID owns. */
export async function restoreRuns(): Promise<string[]> {
  if (!IS_IOS) return [];
  await initStoreKit();
  try {
    const purchases: any[] = await ExpoIap.getAvailablePurchases();
    const riverIds = new Set<string>();
    for (const p of purchases || []) {
      const pid = p?.productId || p?.id;
      const rid = riverIdForProduct(String(pid || ""));
      if (rid) riverIds.add(rid);
      // Best-effort: finish any lingering non-consumable transactions so
      // they don't keep getting redelivered to listeners.
      try {
        await ExpoIap.finishTransaction({ purchase: p, isConsumable: false } as any);
      } catch {
        /* ignore */
      }
    }
    return Array.from(riverIds);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[storekit] restoreRuns failed", e);
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
