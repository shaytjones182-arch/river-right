// IAP product catalog.
//
// Today: real App Store Connect product IDs (one per river run). The
// `displayPrice` is filled in from a live store fetch when available
// (see `storekit.ts → primeProductPrices`) and falls back to the
// hardcoded $5 placeholder otherwise so the UI never breaks offline /
// before the store has connected.
//
// To add a new river: insert an entry in RIVER_TO_PRODUCT_ID and create
// the matching non-consumable in App Store Connect.

export type RunProduct = {
  riverId: string;
  productId: string;
  /** Display price in USD. Will be replaced by `localizedPrice` from RNIap. */
  priceUSD: number;
  /** Pretty price string shown in UI. */
  displayPrice: string;
};

export const DEFAULT_RUN_PRICE_USD = 5;
export const DEFAULT_RUN_PRICE_DISPLAY = "$5.00";

// ─── River → App Store product ID map ──────────────────────────────────
// IDs MUST exactly match what's configured in App Store Connect.
const RIVER_TO_PRODUCT_ID: Record<string, string> = {
  "green-river-desolation": "com.riverrightwhitewater.deso_map",
};

// In-memory cache of live App Store prices (populated by storekit.ts after
// it fetches products at startup). Keyed by product ID, value is the
// localized price string returned by Apple (e.g. "$4.99", "₹399.00").
const LIVE_PRICE_BY_PRODUCT_ID: Record<string, string> = {};

export function setLivePrice(productId: string, localizedPrice: string) {
  if (productId && localizedPrice) LIVE_PRICE_BY_PRODUCT_ID[productId] = localizedPrice;
}

export function productIdFor(riverId: string): string {
  // Use the App Store product ID if we have one mapped; fall back to a
  // synthetic SKU for rivers that don't have a real product yet (so the
  // UI still shows a placeholder $5 button before App Store Connect setup).
  return RIVER_TO_PRODUCT_ID[riverId] || `com.riverright.run.${riverId}`;
}

/** All product IDs we should fetch from the App Store at startup. */
export function allKnownProductIds(): string[] {
  return Object.values(RIVER_TO_PRODUCT_ID);
}

export function productForRiver(
  riverId: string,
  overridePriceUSD?: number
): RunProduct {
  const price = overridePriceUSD ?? DEFAULT_RUN_PRICE_USD;
  const productId = productIdFor(riverId);
  const live = LIVE_PRICE_BY_PRODUCT_ID[productId];
  return {
    riverId,
    productId,
    priceUSD: price,
    // Prefer the live App Store price string when available so the user
    // sees the EXACT price Apple will charge (handles localization +
    // App Store discounts automatically).
    displayPrice: live || `$${price.toFixed(2)}`,
  };
}
