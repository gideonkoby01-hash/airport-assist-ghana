// Prices are kept and charged in cedis. Management sets an actual dollar price for each service, and a passenger can choose
// to see prices in dollars. A dollar figure is never worked out from an exchange rate: it is the service's own dollar price.

export const CURRENCIES = ["GHS", "USD"];

export function formatGhsAmount(amount) {
  const n = Number(amount || 0);
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsdAmount(amount) {
  return `$${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** True when management has set a dollar price for the service. */
export function hasUsdPrice(pkg) {
  return Boolean(pkg) && Number(pkg.price_usd) > 0 && Number(pkg.price) > 0;
}

/**
 * A cedi amount on a booking for `pkg`, shown in the chosen currency. In dollars it is the service's dollar price, scaled the
 * way the cedi amount is scaled: 3 passengers is 3 times the dollar price, and a discount takes the same share off both.
 * A service with no dollar price is shown in cedis.
 */
export function formatForPackage(amountGhs, pkg, currency) {
  if (currency === "USD" && hasUsdPrice(pkg)) {
    const usd = Math.round(((Number(amountGhs || 0) * Number(pkg.price_usd)) / Number(pkg.price) + Number.EPSILON) * 100) / 100;
    return formatUsdAmount(usd + 0); // + 0 turns a negative zero into zero
  }
  return formatGhsAmount(amountGhs);
}
