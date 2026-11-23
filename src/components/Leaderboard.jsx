import React, { useMemo, useState } from "react";
import { Star, Trophy } from "lucide-react";
import { api } from "@/api/db";
import { formatGHS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import { rangeForPreset } from "@/lib/finance";
import { PORTER_METRICS, SUPERVISOR_METRICS, barShare, collectionRate, rankRows, realSupervisors } from "@/lib/leaderboard";
import PeriodPicker from "@/components/charts/PeriodPicker";
import { LoadState, Panel, useLoad } from "@/components/accounts/shared";

const n = (x) => Number(x) || 0;
const plural = (count, one, many) => `${n(count).toLocaleString("en-GB")} ${n(count) === 1 ? one : many}`;

function show(kind, value) {
  if (value === null || value === undefined) return "—";
  if (kind === "money") return formatGHS(value);
  if (kind === "percent") return `${Math.round(value * 100)}%`;
  if (kind === "rating") return `${Number(value).toFixed(1)}`;
  return n(value).toLocaleString("en-GB");
}

// The other figures behind a person, so the ranking can be checked against the work.
function supervisorFacts(r) {
  const rate = collectionRate(r);
  return [
    { key: "completed", text: plural(r.completed, "job completed", "jobs completed") },
    { key: "collected", text: `${formatGHS(r.collected)} collected` },
    { key: "collection", text: rate === null ? null : `${Math.round(rate * 100)}% of billed collected` },
    { key: "rating", text: n(r.ratings) > 0 ? `${Number(r.rating).toFixed(1)} from ${plural(r.ratings, "rating", "ratings")}` : "No ratings yet" },
  ];
}
function porterFacts(r) {
  return [
    { key: "passengers", text: plural(r.passengers, "passenger", "passengers") },
    { key: "jobs", text: plural(r.jobs, "job", "jobs") },
    { key: "commission", text: `${formatGHS(r.commission)} earned` },
  ];
}

function Podium({ top, metric, facts }) {
  return (
    <ol className="hidden sm:grid sm:grid-cols-3 gap-3" aria-label="Top three">
      {top.map((r) => {
        const first = r.rank === 1;
        return (
          <li key={`${r.supervisor_id || r.name}`} className={`rounded-2xl border p-4 ${first ? "border-accent bg-accent/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`grid place-items-center w-9 h-9 rounded-full text-sm font-bold tabular ${first ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"}`} aria-label={`Rank ${r.rank}`}>{r.rank}</span>
              {first && <Trophy className="w-5 h-5 text-accent" aria-hidden="true" />}
            </div>
            <p className="mt-3 font-semibold text-foreground truncate" title={r.name}>{r.name}</p>
            <p className="mt-1 text-2xl font-bold tabular text-foreground inline-flex items-baseline gap-1.5">
              {show(metric.kind, r.value)}
              {metric.kind === "rating" && <Star className="w-4 h-4 fill-current text-accent self-center" aria-hidden="true" />}
            </p>
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-xs text-muted-foreground">{facts(r).filter((f) => f.key !== metric.key && f.text).map((f) => f.text).join(" · ")}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Board({ rows, metric, facts, empty }) {
  const ranked = useMemo(() => rankRows(rows, metric), [rows, metric]);
  const top = ranked.find((r) => r.rank !== null)?.value ?? 0;
  const podium = ranked.filter((r) => r.rank !== null && r.rank <= 3).slice(0, 3);
  if (!ranked.length) return <p className="text-sm text-muted-foreground py-10 text-center">{empty}</p>;
  return (
    <div className="space-y-5">
      {podium.length > 0 && <Podium top={podium} metric={metric} facts={facts} />}
      {metric.note && <p className="text-xs text-muted-foreground">{metric.note}</p>}
      <ol className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden" aria-label="Full ranking">
        {ranked.map((r) => (
          <li key={`${r.supervisor_id || r.name}`} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 sm:px-4 py-3">
            <span className="absolute inset-y-0 left-0 bg-accent/10 pointer-events-none" style={{ width: `${Math.round(barShare(r.value, top) * 100)}%` }} aria-hidden="true" />
            <span className="relative text-center text-sm font-semibold tabular text-muted-foreground">{r.rank ?? "—"}</span>
            <div className="relative min-w-0">
              <p className="font-medium text-foreground truncate" title={r.name}>{r.name}</p>
              <p className="text-xs text-muted-foreground">{facts(r).filter((f) => f.key !== metric.key && f.text).map((f) => f.text).join(" · ")}</p>
            </div>
            <span className="relative text-right font-semibold tabular text-foreground">
              {r.rank === null ? <span className="text-xs font-normal text-muted-foreground">Not enough yet</span> : show(metric.kind, r.value)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Who is doing the most: supervisors and porters ranked for the dates chosen. For management and admin only.
export default function Leaderboard() {
  const today = todayUtc();
  const [period, setPeriod] = useState({ preset: "mtd", ...rangeForPreset("mtd", today) });
  const [who, setWho] = useState("supervisors");
  const [metricKey, setMetricKey] = useState({ supervisors: "completed", porters: "passengers" });
  const { data, loading, error } = useLoad(() => api.team.leaderboard(period.from, period.to), [period.from, period.to]);

  const metrics = who === "supervisors" ? SUPERVISOR_METRICS : PORTER_METRICS;
  const metric = metrics.find((m) => m.key === metricKey[who]) || metrics[0];
  const rows = who === "supervisors" ? realSupervisors(data?.supervisors) : (data?.porters || []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Leaderboard</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Who is doing the most in the dates you choose. Only management and admin can see this page.</p>
      </div>

      <PeriodPicker
        value={period}
        onPreset={(preset) => setPeriod({ preset, ...rangeForPreset(preset, today) })}
        onCustom={(from, to) => setPeriod({ preset: "custom", from, to })}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="inline-flex rounded-full border border-border bg-card p-1" role="group" aria-label="Who to rank">
          {[["supervisors", "Supervisors"], ["porters", "Porters"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${who === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rank by">
          <span className="text-xs text-muted-foreground mr-1">Rank by</span>
          {metrics.map((m) => (
            <button key={m.key} type="button" aria-pressed={metric.key === m.key} onClick={() => setMetricKey((s) => ({ ...s, [who]: m.key }))}
              className={`press px-3 py-1.5 rounded-full text-sm border transition-colors ${metric.key === m.key ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card border-border hover:border-accent"}`}>{m.label}</button>
          ))}
        </div>
      </div>

      <Panel
        title={who === "supervisors" ? "Supervisors" : "Porters"}
        note={who === "supervisors"
          ? "Bookings by flight date. Jobs completed counts finished services; money collected is what they recorded on their bookings."
          : "Completed jobs by flight date, from the porters named on each booking."}
      >
        <LoadState loading={loading} error={error} hasData={Boolean(data)}>
          <Board
            key={who}
            rows={rows}
            metric={metric}
            facts={who === "supervisors" ? supervisorFacts : porterFacts}
            empty={who === "supervisors" ? "No supervisor has bookings in these dates." : "No porter has a completed job in these dates."}
          />
        </LoadState>
      </Panel>
    </div>
  );
}
