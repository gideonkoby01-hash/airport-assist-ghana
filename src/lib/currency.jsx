import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSettings } from "@/lib/SettingsContext";
import { useAuth } from "@/lib/AuthContext";
import { formatMoney } from "@/lib/money";

// Which currency a passenger views prices in. Staff always see cedis, because shift reports, accounts and cash counts are in cedis.
const KEY = "aag-currency";
const CurrencyContext = createContext({ currency: "GHS", setCurrency: (/** @type {string} */ _c) => {} });

function read() {
  try {
    return localStorage.getItem(KEY) === "USD" ? "USD" : "GHS";
  } catch {
    return "GHS";
  }
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(read);
  const setCurrency = useCallback((c) => {
    const next = c === "USD" ? "USD" : "GHS";
    setCurrencyState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // the choice lasts for this visit only
    }
  }, []);
  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** `format(cedis)` shows a price in the viewer's chosen currency (cedis for staff). `isUsd` says dollars are being shown. */
export function useMoney() {
  const { currency, setCurrency } = useContext(CurrencyContext);
  const { settings } = useSettings();
  const { user } = useAuth();
  const staff = Boolean(user) && !["passenger", "user", undefined, null, ""].includes(user.role);
  const effective = staff ? "GHS" : currency;
  const rate = Number(settings.usd_exchange_rate);
  const format = useCallback((amountGhs) => formatMoney(amountGhs, effective, rate), [effective, rate]);
  return { currency: effective, setCurrency, format, isUsd: effective === "USD", rate, canChoose: !staff };
}

/** A small GHS | USD switch. */
export function CurrencyToggle({ className = "" }) {
  const { currency, setCurrency, canChoose } = useMoney();
  if (!canChoose) return null;
  return (
    <div role="group" aria-label="Show prices in" className={`inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-semibold ${className}`}>
      {["GHS", "USD"].map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={currency === c}
          onClick={() => setCurrency(c)}
          className={`px-3 py-1.5 rounded-full transition-colors ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {c === "GHS" ? "GH₵ GHS" : "$ USD"}
        </button>
      ))}
    </div>
  );
}
