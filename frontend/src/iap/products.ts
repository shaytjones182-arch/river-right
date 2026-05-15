// IAP product catalog.
//
// Today: hardcoded $5 price for every locked river.
// Production: replace `priceUSD`/`title` with values fetched from
// `RNIap.getProducts(productIds)` so the values come straight from
// App Store Connect (handles localization + tax automatically).
//
// `productIdFor(riverId)` returns the SKU to register with App Store Connect.

const SKU_PREFIX = "com.riverright.run.";

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

export function productIdFor(riverId: string): string {
  // Replace non-SKU-safe characters with hyphens.
  return SKU_PREFIX + riverId.replace(/[^a-z0-9-]/g, "-");
}

export function productForRiver(
  riverId: string,
  overridePriceUSD?: number
): RunProduct {
  const price = overridePriceUSD ?? DEFAULT_RUN_PRICE_USD;
  return {
    riverId,
    productId: productIdFor(riverId),
    priceUSD: price,
    displayPrice: `$${price.toFixed(2)}`,
  };
}
