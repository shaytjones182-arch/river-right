// Native StoreKit (iOS) wrapper around react-native-iap.
//
// Exposes a tiny imperative surface the rest of the app can consume
// without dragging the heavy `useIAP` hook into screens that don't
// actually present the paywall.
//
//   • initStoreKit()        — call once at app start (idempotent)
//   • primeProductPrices()  — fetch live App Store prices into products.ts
//   • purchaseRun(riverId)  — kicks off the App Store purchase sheet
//   • restoreRuns()         — returns the list of riverIds the user owns
//
// On Android/Web the module is a no-op so callers never have to
// platform-branch. On iOS the actual library is loaded lazily (inside
// the function bodies) so the bundler doesn't try to evaluate native
// modules in Expo Go / web preview where they don't exist.

import { Platform } from "react-native";
import {
  allKnownProductIds,
  productIdFor,
  setLivePrice,
} from "./products";

const IS_IOS = Platform.OS === "ios";

let _initialized = false;
let _initInflight: Promise<void> | null = null;

function loadLib(): any | null {
  if (!IS_IOS) return null;
  try {
    // require() instead of import so platforms without the native module
    // never try to resolve it during bundling.
    return require("react-native-iap");
  } catch (e) {
    console.warn("[storekit] react-native-iap not available", e);
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
      await lib.initConnection();
      _initialized = true;
      await primeProductPrices();
    } catch (e) {
      console.warn("[storekit] initConnection failed", e);
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
    if (!skus.length) return;
    // react-native-iap v15 uses `requestProducts` / `fetchProducts`
    // depending on the API era; try both signatures gracefully.
    let products: any[] = [];
    if (typeof lib.fetchProducts === "function") {
      products = await lib.fetchProducts({ skus, type: "in-app" });
    } else if (typeof lib.requestProducts === "function") {
      products = await lib.requestProducts({ skus });
    } else if (typeof lib.getProducts === "function") {
      products = await lib.getProducts({ skus });
    } else {
      console.warn("[storekit] no fetchProducts API found on react-native-iap");
      return;
    }
    for (const p of products || []) {
      const id = p?.productId || p?.id;
      const price =
        p?.localizedPrice ||
        p?.displayPrice ||
        p?.priceString ||
        (typeof p?.price === "string" ? p.price : null);
      if (id && price) setLivePrice(id, price);
    }
  } catch (e) {
    console.warn("[storekit] primeProductPrices failed", e);
  }
}

/** Kicks off the App Store purchase sheet for a single river. Resolves
 *  ONLY after the purchase is finished + the transaction is finalized,
 *  or rejects on cancel / error. */
export async function purchaseRun(riverId: string): Promise<void> {
  if (!IS_IOS) throw new Error("In-app purchases are iOS-only.");
  const lib = loadLib();
  if (!lib) throw new Error("StoreKit not available.");
  await initStoreKit();
  const sku = productIdFor(riverId);
  // Newer (v15+) shape uses request: { sku } or request: { skus: [...] }.
  // Older versions just take a string. Try both.
  try {
    if (typeof lib.requestPurchase === "function") {
      try {
        await lib.requestPurchase({
          request: { ios: { sku }, sku },
          type: "in-app",
        });
      } catch (firstErr) {
        // Fall back to legacy positional API
        await lib.requestPurchase(sku);
      }
    } else {
      throw new Error("requestPurchase not exposed by react-native-iap.");
    }
  } catch (e: any) {
    // Surface a clean cancellation vs real error to the caller.
    const code = e?.code || e?.errorCode;
    if (
      code === "E_USER_CANCELLED" ||
      code === "userCancelled" ||
      /cancel/i.test(String(e?.message))
    ) {
      throw new Error("CANCELLED");
    }
    throw e;
  }
  // requestPurchase resolves before the transaction listener fires the
  // success callback. The currently-owned purchases query below is the
  // simplest way to confirm the buy actually completed (StoreKit2 has
  // a small delay between sheet close + listener fire).
  await new Promise((r) => setTimeout(r, 800));
  const owned = await restoreRuns();
  if (!owned.includes(riverId)) {
    throw new Error("Purchase didn't complete. Try Restore Purchases.");
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
