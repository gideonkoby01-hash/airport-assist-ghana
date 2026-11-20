// Prices are kept and charged in cedis. A passenger can choose to view them in US dollars; the dollar figure is the cedi
// price divided by the exchange rate set in Admin Settings, rounded up to the next cent so it is never understated.

export const CURRENCIES = ["GHS", "USD"];

/** Cedis to dollars at `rate` cedis per dollar. Returns null when the rate is not usable. */
export function ghsToUsd(amountGhs, rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  const cents = (Number(amountGhs || 0) / r) * 100;
  return (Math.ceil(cents - 1e-9) + 0) / 100; // + 0 turns a negative zero into zero
}

export function formatGhsAmount(amount) {
  const n = Number(amount || 0);
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsdAmount(amount) {
  return `$${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A cedi amount shown in the chosen currency. Falls back to cedis when dollars cannot be worked out. */
export function formatMoney(amountGhs, currency, rate) {
  if (currency === "USD") {
    const usd = ghsToUsd(amountGhs, rate);
    if (usd !== null) return formatUsdAmount(usd);
  }
  return formatGhsAmount(amountGhs);
}
