import React, { useState } from "react";
import { Check, Loader2, Luggage, Phone, PlaneLanding, PlaneTakeoff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ConfirmAction";
import { formatGHS } from "@/lib/packages";
import { flightLine, longDayLabel } from "@/lib/porterDashboard";

const STATUS = { confirmed: "Confirmed", assigned: "Assigned", in_progress: "In progress", completed: "Completed" };

// One job: where and when, who to look for, and the porter's own part. The button marks it done once its day has come.
export default function JobCard({ job, today, showDay = false, onDone }) {
  const [busy, setBusy] = useState(false);
  const Icon = job.flight_type === "departure" ? PlaneTakeoff : PlaneLanding;
  const done = Boolean(job.done_at);
  const canMark = !done && job.flight_date <= today;

  const mark = async () => {
    setBusy(true);
    try {
      await onDone(job.reference);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="bg-card border border-border rounded-2xl p-4 space-y-3" aria-label={`Job ${job.reference}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-xl bg-accent/15 text-accent shrink-0"><Icon className="w-5 h-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground leading-tight">{flightLine(job)}</p>
            {showDay && <p className="text-sm text-muted-foreground">{longDayLabel(job.flight_date)}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">{job.reference}{job.package_name ? ` · ${job.package_name}` : ""}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${done ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
          {done ? "Done" : STATUS[job.status] || job.status}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Look for</dt>
          <dd className="font-medium">{job.lead_passenger || "The passenger"}{job.num_passengers > 1 ? ` and ${job.num_passengers - 1} more` : ""}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" aria-hidden="true" />You handle</dt>
          <dd className="font-medium">{job.passengers_handled} {job.passengers_handled === 1 ? "passenger" : "passengers"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground flex items-center gap-1"><Luggage className="w-3 h-3" aria-hidden="true" />Bags</dt>
          <dd className="font-medium">{job.total_bags ?? "–"}</dd>
        </div>
        {job.lounge_used && (
          <div className="col-span-2"><dt className="text-xs text-muted-foreground">Lounge</dt><dd className="font-medium">{job.lounge_used}</dd></div>
        )}
        {job.special_requests && (
          <div className="col-span-2"><dt className="text-xs text-muted-foreground">Special requests</dt><dd>{job.special_requests}</dd></div>
        )}
        <div className="col-span-2 flex items-center justify-between gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Supervisor</dt>
            <dd className="font-medium">{job.supervisor_name || "Not assigned yet"}</dd>
          </div>
          {job.supervisor_phone && (
            <a href={`tel:${job.supervisor_phone}`} className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted" aria-label={`Call ${job.supervisor_name}`}>
              <Phone className="w-4 h-4" aria-hidden="true" />Call
            </a>
          )}
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
        <p className="text-sm text-muted-foreground">You earn <span className="font-semibold text-foreground">{formatGHS(job.commission)}</span></p>
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check className="w-4 h-4" aria-hidden="true" />Marked done</span>
        ) : canMark ? (
          <ConfirmAction title="Mark this job done?" description={`${flightLine(job)}, ${job.reference}. Only mark it once you have finished with the passengers.`} confirmLabel="Yes, it is done" onConfirm={mark}>
            <Button className="h-11 px-5" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" />Mark done</>}</Button>
          </ConfirmAction>
        ) : (
          <span className="text-xs text-muted-foreground">You can mark it done on the day</span>
        )}
      </div>
    </article>
  );
}
