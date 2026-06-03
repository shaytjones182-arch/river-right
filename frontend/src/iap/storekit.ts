// Native StoreKit (iOS) wrapper around react-native-iap.
//
// Exposes a tiny imperative surface the rest of the app can consume
// without dragging the heavy `useIAP` hook into screens that don't
// actually present the paywall.

import { Platform } from "react-native";
import {
  allKnownProductIds,
  productIdFor,
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

function loadLib(): any | null {
  if (!IS_IOS) {
    trace("loadLib: not iOS, skipping");
    return null;
  }
  try {
    // require() instead of import so platforms without the native module
    // never try to resolve it during bundling.
    const m = require("react-native-iap");
    const keys = Object.keys(m || {}).slice(0, 6).join(",");
    trace(`loadLib: OK, exports include [${keys}…]`);
    return m;
  } catch (e: any) {
    trace(`loadLib: FAILED ${e?.message || e}`);
    return null;
  }
}

/** Map riverId → App Store product ID for the reverse lookup we need
 *  when Apple hands us back a productId on restore / purchase. */
function riverIdForProduct(productId: string): string | null {
  // Iterate known mappings — for the foreseeable future this is a
  // single-digit number of products so a linear scan is fine.
  // We import lazily to avoid a circular reference at module-eval time.
  const knownIds = allKnownProductIds();
  if (!knownIds.includes(productId)) return null;
  // Inverse of RIVER_TO_PRODUCT_ID from products.ts. Hardcoded here
  // because exposing the full map would tempt callers to bypass
  // `productForRiver()`.
  if (productId === "com.riverrightwhitewater.deso_map")
    return "green-river-desolation";
  return null;
}

/** Connects to StoreKit and primes product prices. Safe to call many
 *  times — only the first call actually does work. */
export async function initStoreKit(): Promise<void> {
  if (!IS_IOS) return;
  if (_initialized) return;
  if (_initInflight) return _initInflight;
  const lib = loadLib();
  if (!lib) return;
  _initInflight = (async () => {
    try {
      trace("initConnection: calling");
      await lib.initConnection();
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
  const lib = loadLib();
  if (!lib) return;
  try {
    const skus = allKnownProductIds();
    if (!skus.length) {
      trace("primeProductPrices: no SKUs configured");
      return;
    }
    trace(`fetchProducts: requesting [${skus.join(",")}]`);
    let products: any[] = [];
    if (typeof lib.fetchProducts === "function") {
      products = await lib.fetchProducts({ skus, type: "in-app" });
    } else if (typeof lib.requestProducts === "function") {
      products = await lib.requestProducts({ skus });
    } else if (typeof lib.getProducts === "function") {
      products = await lib.getProducts({ skus });
    } else {
      trace("fetchProducts: NO API FOUND on react-native-iap");
      return;
    }
    trace(`fetchProducts: returned ${products?.length || 0} products`);
    for (const p of products || []) {
      const id = p?.productId || p?.id;
      const price =
        p?.localizedPrice ||
        p?.displayPrice ||
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
  const lib = loadLib();
  if (!lib) throw new Error("StoreKit not available (react-native-iap didn't load).");
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
    if (typeof lib.requestPurchase === "function") {
      trace("requestPurchase: calling (newer API)");
      try {
        await lib.requestPurchase({
          request: { ios: { sku }, sku },
          type: "in-app",
        });
      } catch (firstErr: any) {
        trace(`requestPurchase newer-API threw, falling back: ${firstErr?.message || firstErr}`);
        await lib.requestPurchase(sku);
      }
      trace("requestPurchase: resolved");
    } else {
      trace("requestPurchase: FUNCTION MISSING on lib");
      throw new Error("requestPurchase not exposed by react-native-iap.");
    }
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
  const lib = loadLib();
  if (!lib) return [];
  await initStoreKit();
  try {
    let purchases: any[] = [];
    if (typeof lib.getAvailablePurchases === "function") {
      purchases = await lib.getAvailablePurchases();
    } else if (typeof lib.getPurchaseHistory === "function") {
      purchases = await lib.getPurchaseHistory();
    }
    const riverIds = new Set<string>();
    for (const p of purchases || []) {
      const pid = p?.productId || p?.id;
      const rid = riverIdForProduct(String(pid || ""));
      if (rid) riverIds.add(rid);
      // Best-effort: finish any lingering non-consumable transactions so
      // they don't keep getting redelivered to listeners.
      try {
        if (typeof lib.finishTransaction === "function") {
          await lib.finishTransaction({ purchase: p, isConsumable: false });
        }
      } catch {
        /* ignore */
      }
    }
    return Array.from(riverIds);
  } catch (e) {
    console.warn("[storekit] restoreRuns failed", e);
    return [];
  }
}
