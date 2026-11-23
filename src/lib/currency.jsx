import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { formatForPackage, formatGhsAmount, hasUsdPrice } from "@/lib/money";

// Which currency a passenger views prices in. Management sets a dollar price on each service; a service without one shows cedis.
// Staff always see cedis, because shift reports, accounts and cash counts are in cedis.
const KEY = "aag-currency";
const CurrencyContext = createContext({ currency: "GHS", setCurrency: (/** @type {string} */ _c) => {}, packages: /** @type {any[]} */ ([]), allPackages: /** @type {any[]} */ ([]) });

function read() {
  try {
    return localStorage.getItem(KEY) === "USD" ? "USD" : "GHS";
  } catch {
    return "GHS";
  }
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(read);
  const [allPackages, setAllPackages] = useState([]);
  const setCurrency = useCallback((c) => {
    const next = c === "USD" ? "USD" : "GHS";
    setCurrencyState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // the choice lasts for this visit only
    }
  }, []);
  // The service list (anyone can read it) carries each service's dollar price.
  useEffect(() => {
    api.entities.ServicePackage.filter({}, { sort: "price" })
      .then((page) => setAllPackages(page.items || []))
      .catch(() => {});
  }, []);
  // `packages` are the services that can be booked now; `allPackages` also has the ones switched off, so an old booking is still understood.
  const packages = useMemo(() => allPackages.filter((p) => p.active), [allPackages]);
  const value = useMemo(() => ({ currency, setCurrency, packages, allPackages }), [currency, setCurrency, packages, allPackages]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** The service list: `packages` (on now) and `allPackages` (including switched off). Anyone can read it. */
export function useServiceList() {
  const { packages, allPackages } = useContext(CurrencyContext);
  return { packages, allPackages };
}

/**
 * `format(cedis)` always shows cedis. `formatFor(service)(cedis)` shows an amount on a booking for that service (a service, or its
 * code) in the chosen currency: in dollars it is the service's own dollar price. `usdAvailable` says at least one service has one.
 */
export function useMoney() {
  const { currency, setCurrency, packages } = useContext(CurrencyContext);
  const { user } = useAuth();
  const staff = Boolean(user) && !["passenger", "user", undefined, null, ""].includes(user.role);
  const usdAvailable = packages.some(hasUsdPrice);
  const effective = staff || !usdAvailable ? "GHS" : currency;
  const formatFor = useCallback((service) => {
    const pkg = typeof service === "string"
      ? packages.find((p) => p.code === service)
      : service && service.price_usd === undefined ? { ...service, ...(packages.find((p) => p.code === service.code) || {}), price: service.price } : service;
    return (/** @type {number} */ amountGhs) => formatForPackage(amountGhs, pkg, effective);
  }, [packages, effective]);
  return { currency: effective, chosen: currency, setCurrency, format: formatGhsAmount, formatFor, isUsd: effective === "USD", usdAvailable, canChoose: !staff && usdAvailable };
}

/** A small GHS | USD switch. It only appears once management has set a dollar price on a service. */
export function CurrencyToggle({ className = "" }) {
  const { chosen, setCurrency, canChoose } = useMoney();
  if (!canChoose) return null;
  return (
    <div role="group" aria-label="Show prices in" className={`inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-semibold ${className}`}>
      {["GHS", "USD"].map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={chosen === c}
          onClick={() => setCurrency(c)}
          className={`px-3 py-1.5 rounded-full transition-colors ${chosen === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {c === "GHS" ? "GH₵ GHS" : "$ USD"}
        </button>
      ))}
    </div>
  );
}
