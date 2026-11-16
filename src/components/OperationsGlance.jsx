import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/db";
import { LIVE_STATUSES, UNASSIGNED, tallyToday, waitingForPorter } from "@/lib/bookingRules";
import { todayUtc } from "@/lib/bookingFormRules";
import { CheckCircle2, ChevronRight } from "lucide-react";

const STEPS = [
  { key: "waiting", label: "Unassigned", bar: "bg-amber-400" },
  { key: "assigned", label: "Assigned", bar: "bg-sky-500" },
  { key: "in_progress", label: "In progress", bar: "bg-indigo-500" },
  { key: "completed", label: "Completed", bar: "bg-emerald-500" },
  { key: "other", label: "Cancelled or no-show", bar: "bg-slate-300" },
];

function Row({ b }) {
  return (
    <Link to={`/bookings/${b.id}`} className="flex items-center gap-3 py-2.5 group">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          <span className="font-mono text-primary">{b.reference}</span> · {b.flight_number || "No flight number"}
        </p>
        <p className="text-xs text-muted-foreground">
          {b.flight_type === "departure" ? "Departure" : "Arrival"} · {b.flight_date} {b.scheduled_flight_time}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

function AttentionList({ title, hint, rows, loading, emptyText, to }) {
  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {to && rows.length > 0 && <Link to={to} className="text-xs font-medium text-primary hover:underline">See all</Link>}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-2 divide-y divide-border">
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" /> {emptyText}
          </p>
        ) : (
          rows.map((b) => <Row key={b.id} b={b} />)
        )}
      </div>
    </section>
  );
}

// Management's first look at the day: how today's flights are going, and the bookings that need someone to act.
export default function OperationsGlance() {
  const today = todayUtc();
  const [tally, setTally] = useState(null);
  const [unassigned, setUnassigned] = useState(null);
  const [overdue, setOverdue] = useState(null);
  const [needPorter, setNeedPorter] = useState(null);

  useEffect(() => {
    let live = true;
    const fields = ["reference", "flight_number", "flight_type", "flight_date", "scheduled_flight_time", "status"];
    api.entities.Booking.filter({ flight_date: today }, { limit: 500, fields: ["status"] })
      .then((p) => live && setTally(tallyToday(p.items || [])))
      .catch(() => live && setTally({ total: 0 }));
    api.entities.Booking.filter(UNASSIGNED, { sort: "flight_date,scheduled_flight_time", limit: 5, fields })
      .then((p) => live && setUnassigned(p.items || []))
      .catch(() => live && setUnassigned([]));
    api.entities.Booking.filter({ status: { $in: LIVE_STATUSES }, flight_date: { $lt: today } }, { sort: "flight_date,scheduled_flight_time", limit: 5, fields })
      .then((p) => live && setOverdue(p.items || []))
      .catch(() => live && setOverdue([]));
    // Website porter requests nobody has been assigned to yet: management assigns the porter.
    api.entities.Booking.filter({ package_code: "porter_only", status: { $in: LIVE_STATUSES } }, { sort: "flight_date,scheduled_flight_time", limit: 100, fields: [...fields, "package_code", "porters"] })
      .then((p) => live && setNeedPorter(waitingForPorter(p.items || []).slice(0, 5)))
      .catch(() => live && setNeedPorter([]));
    return () => {
      live = false;
    };
  }, [today]);

  return (
    <div className="space-y-4">
      <section className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Today's flights</h3>
          {tally && <Link to="/management?tab=bookings&view=today" className="text-xs font-medium text-primary hover:underline">See today's bookings</Link>}
        </div>
        {!tally ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : tally.total === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No flights booked for today.</p>
        ) : (
          <>
            <p className="tabular text-2xl font-semibold tracking-tight mt-2">{tally.total} <span className="text-sm font-medium text-muted-foreground">flight{tally.total === 1 ? "" : "s"}</span></p>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-secondary mt-3" role="img"
              aria-label={STEPS.filter((s) => tally[s.key]).map((s) => `${tally[s.key]} ${s.label.toLowerCase()}`).join(", ")}>
              {STEPS.filter((s) => tally[s.key] > 0).map((s) => (
                <div key={s.key} className={s.bar} style={{ width: `${(tally[s.key] / tally.total) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {STEPS.filter((s) => tally[s.key] > 0).map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.bar}`} aria-hidden="true" />
                  <span className="tabular font-medium text-foreground">{tally[s.key]}</span> {s.label.toLowerCase()}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <AttentionList
          title="Unassigned bookings"
          hint="Confirmed bookings nobody has been assigned to yet, soonest flight first."
          rows={unassigned || []}
          loading={unassigned === null}
          emptyText="Every confirmed booking has a supervisor."
          to="/management?tab=bookings&view=unassigned"
        />
        <AttentionList
          title="Waiting for a porter"
          hint="Porter requests from the website. Open the booking and assign a porter."
          rows={needPorter || []}
          loading={needPorter === null}
          emptyText="Every porter request has a porter."
          to="/management?tab=bookings"
        />
        <AttentionList
          title="Flight date passed, still open"
          hint="Someone needs to complete, cancel or mark these as no-show."
          rows={overdue || []}
          loading={overdue === null}
          emptyText="No stale bookings."
          to="/management?tab=bookings&view=open"
        />
      </div>
    </div>
  );
}
