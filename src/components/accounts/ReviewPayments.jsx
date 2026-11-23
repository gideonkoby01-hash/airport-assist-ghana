import React, { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/api/db";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGHS } from "@/lib/packages";
import { notifyError } from "@/lib/notify";
import { fmtDate, useLoad } from "./shared";

const REASONS = {
  amount_mismatch: "The amount or currency Paystack reported was not what was asked for.",
  overpayment: "The booking was already paid (for example at the airport) while the passenger was paying online.",
  booking_closed: "The booking was cancelled or marked no-show before the payment arrived.",
  booking_not_found: "The booking no longer exists.",
};

// Online payments that Paystack took from a passenger but that could not be put on their booking. The money is with Paystack,
// so someone has to decide: usually refund it from the Paystack dashboard, then mark it as dealt with here. Draws nothing when there are none.
export default function ReviewPayments() {
  const canRecord = useCan()("accounts.record");
  const { data, reload } = useLoad(() => api.payments.needingReview(), []);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = data || [];
  if (rows.length === 0) return null;

  const resolve = async (reference) => {
    setBusy(true);
    try {
      await api.payments.resolve(reference, note.trim());
      setOpen(null);
      setNote("");
      reload();
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-label="Online payments to check">
      <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> Online payments to check ({rows.length})</h3>
      <p className="text-xs mt-1 mb-3">These were paid through Paystack but could not be added to the booking. The money is with Paystack and is not in the books. Refund it from the Paystack dashboard if it should not stand, then mark it as dealt with.</p>
      <ul className="divide-y divide-amber-200">
        {rows.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{r.booking_reference || "Booking"} · <span className="tabular">{formatGHS(r.amount)}</span></p>
                <p className="text-xs">{REASONS[r.review_reason] || "It needs checking."}</p>
                <p className="text-xs text-amber-900/80">{fmtDate(r.created_date)} · Paystack reference <span className="font-mono">{r.reference}</span></p>
              </div>
              {canRecord && open !== r.id && <Button size="sm" variant="outline" onClick={() => { setOpen(r.id); setNote(""); }}>Mark as dealt with</Button>}
            </div>
            {open === r.id && (
              <form className="flex flex-wrap gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); resolve(r.reference); }}>
                <Input aria-label="What was done" className="flex-1 min-w-[14rem] bg-white" placeholder="What was done? For example: refunded in Paystack" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                <Button type="submit" size="sm" disabled={busy || note.trim().length < 3}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>Back</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
