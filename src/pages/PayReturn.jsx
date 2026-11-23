import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { api } from "@/api/db";
import { useDocumentTitle } from "@/hooks/use-document-title";
import PayShell from "@/components/booking/PayShell";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/packages";
import { payPath, RESULT_COPY, returnReference, VERIFY_POLL } from "@/lib/payments";

const ICONS = { good: CheckCircle2, warn: AlertTriangle, bad: XCircle, wait: Clock };
const TONES = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-destructive", wait: "text-muted-foreground" };

// Where Paystack sends the passenger after paying. The result is asked of Paystack itself, never read from the address, and the
// page asks again for a short while if Paystack has not decided yet.
export default function PayReturn() {
  useDocumentTitle("Payment");
  const reference = returnReference(useLocation().search);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState("");
  const checks = useRef(0);

  useEffect(() => {
    if (!reference) return undefined;
    let live = true;
    let timer;
    const check = async () => {
      checks.current += 1;
      try {
        const r = await api.payments.verify(reference);
        if (!live) return;
        setProblem("");
        setResult(r);
        if (r.status === "pending" && checks.current < VERIFY_POLL.maxChecks) timer = setTimeout(check, VERIFY_POLL.delayMs);
      } catch (e) {
        if (!live) return;
        if (checks.current < VERIFY_POLL.maxChecks) timer = setTimeout(check, VERIFY_POLL.delayMs);
        else setProblem(e.message || "We could not check the payment.");
      }
    };
    check();
    return () => { live = false; clearTimeout(timer); };
  }, [reference]);

  if (!reference) {
    return (
      <PayShell>
        <p className="text-center text-sm text-muted-foreground" role="status">This page shows the result of a payment. Open your booking confirmation email to pay a booking.</p>
      </PayShell>
    );
  }

  const copy = result ? RESULT_COPY[result.status] : null;
  const Icon = copy ? ICONS[copy.tone] : null;
  const stillChecking = !result || (result.status === "pending" && checks.current < VERIFY_POLL.maxChecks);

  return (
    <PayShell>
      <div className="rounded-2xl border border-border bg-card p-6 text-center" role="status" aria-live="polite">
        {problem ? (
          <>
            <XCircle className="w-12 h-12 mx-auto text-destructive" aria-hidden="true" />
            <h1 className="serif text-2xl mt-3">We could not check the payment</h1>
            <p className="text-sm text-muted-foreground mt-2">{problem} If you were charged, it will show on your booking shortly and we will email you. Please do not pay again straight away.</p>
          </>
        ) : !copy ? (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-muted-foreground" aria-hidden="true" />
            <h1 className="serif text-2xl mt-3">Checking your payment…</h1>
            <p className="text-sm text-muted-foreground mt-2">This takes a few seconds. Please keep this page open.</p>
          </>
        ) : (
          <>
            {Icon && <Icon className={`w-12 h-12 mx-auto ${TONES[copy.tone]}`} aria-hidden="true" />}
            <h1 className="serif text-2xl mt-3">{copy.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">{copy.body}</p>
            {result.booking_reference && (
              <p className="text-sm mt-4">
                Booking <span className="font-mono font-semibold">{result.booking_reference}</span>
                {result.amount != null && <> · <span className="tabular font-semibold">{formatGHS(result.amount)}</span></>}
              </p>
            )}
            {stillChecking && <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Checking again…</p>}
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {result?.status === "failed" && result.booking_id && (
          <Button asChild><Link to={payPath({ id: result.booking_id, reference: result.booking_reference })}>Try again</Link></Button>
        )}
        <Button variant="outline" asChild><Link to="/">Back to the home page</Link></Button>
      </div>
    </PayShell>
  );
}
