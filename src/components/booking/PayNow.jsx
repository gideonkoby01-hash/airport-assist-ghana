import React, { useEffect, useState } from "react";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/SettingsContext";
import { formatGHS } from "@/lib/packages";

const NOT_PAYABLE = {
  paid: "This booking is already paid in full. Thank you.",
  cancelled: "This booking is cancelled, so it cannot be paid.",
  unavailable: "Online payment is not available right now. You can pay at the airport.",
  error: "We could not check this booking just now. Please try again in a moment, or pay at the airport.",
};

// Pay a booking now by card or mobile money, through Paystack. Optional: paying at the airport always works. The amount
// shown is asked of the server, which always charges what is still owed on the booking. `quiet` draws nothing at all when
// the booking cannot be paid online (the booking confirmation); the payment page explains why instead.
export default function PayNow({ bookingId, reference, quiet = false }) {
  const { settings, loaded } = useSettings();
  const enabled = settings.paystack_enabled === "true";
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded || !enabled) return undefined;
    let live = true;
    api.payments.quote(bookingId, reference)
      .then((q) => { if (live) setQuote(q); })
      .catch(() => { if (live) setQuote({ payable: false, reason: "error" }); });
    return () => { live = false; };
  }, [loaded, enabled, bookingId, reference]);

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      const started = await api.payments.start(bookingId, reference);
      window.location.assign(started.authorization_url);
    } catch (e) {
      setError(e.message || "We could not open the payment page. Please try again, or pay at the airport.");
      setBusy(false);
    }
  };

  if (!loaded) return quiet ? null : <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking…</p>;
  const reason = !enabled ? "unavailable" : quote && !quote.payable ? quote.reason : null;
  if (reason) return quiet ? null : <p className="text-sm text-muted-foreground" role="status">{NOT_PAYABLE[reason] || NOT_PAYABLE.error}</p>;
  if (!quote) return quiet ? null : <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking what is owed…</p>;

  return (
    <section aria-label="Pay now" className="rounded-2xl border border-border bg-card p-5 text-left">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><CreditCard className="w-4.5 h-4.5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Pay now, if you like</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pay <span className="font-semibold text-foreground tabular">{formatGHS(quote.amount)}</span> by card or mobile money. Or pay at the airport instead; nothing else changes.
          </p>
        </div>
      </div>
      <Button className="w-full mt-4 h-11" onClick={pay} disabled={busy}>
        {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> Opening the payment page…</> : "Pay now with card or mobile money"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive mt-3">{error}</p>}
      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Payments are taken by Paystack. We never see your card details. Charged in Ghana cedis.</p>
    </section>
  );
}
