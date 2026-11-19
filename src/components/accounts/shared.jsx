import React from "react";
import { Loader2 } from "lucide-react";

/** Loads data for an Accounts page and keeps the last result on screen (dimmed) while the next one loads. */
export function useLoad(fn, deps) {
  const [state, setState] = React.useState({ data: null, loading: true, error: "" });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    fn()
      .then((data) => live && setState({ data, loading: false, error: "" }))
      .catch((e) => live && setState((s) => ({ ...s, loading: false, error: e.message || "Could not load this page." })));
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function LoadState({ loading, error, hasData, children }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-3 mb-4">
          {error} If this is new, run the Accounts database update first.
        </p>
      )}
      {!hasData && loading && <div className="flex items-center justify-center py-14 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>}
      {hasData && <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>{children}</div>}
    </>
  );
}

export const methodLabel = (m) => ({ cash: "Cash", mobile_money: "Mobile money", card: "Card", corporate_account: "Corporate account", bank_transfer: "Bank transfer" })[m] || m || "—";
export const fmtDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
export const fmtMonth = (iso) => new Date(`${String(iso).slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function Panel({ title, note = undefined, actions = undefined, children, className = "" }) {
  return (
    <section className={`bg-card rounded-2xl border border-border p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {note && <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{note}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
