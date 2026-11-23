// Ranking for the management leaderboard of supervisors and porters. The numbers come from the dashboard analytics;
// this file only decides who ranks where. Pure functions, tested in leaderboard.test.mjs.

/** A rating needs at least this many customer ratings before it counts, so one 5-star review does not win. */
export const MIN_RATINGS = 3;

const n = (x) => Number(x) || 0;

/** Money collected as a share of what was billed, 0 to 1. null when nothing was billed. */
export function collectionRate(row) {
  const billed = n(row.billed);
  return billed > 0 ? Math.min(1, n(row.collected) / billed) : null;
}

// value() gives the number ranked on, or null when the row has too little to be ranked fairly on it.
export const SUPERVISOR_METRICS = [
  { key: "completed", label: "Jobs completed", kind: "count", value: (r) => n(r.completed) },
  { key: "collected", label: "Money collected", kind: "money", value: (r) => n(r.collected) },
  { key: "rating", label: "Customer rating", kind: "rating", value: (r) => (n(r.ratings) >= MIN_RATINGS ? n(r.rating) : null), note: `Needs at least ${MIN_RATINGS} ratings to be ranked.` },
  { key: "collection", label: "Collection rate", kind: "percent", value: (r) => collectionRate(r), note: "Share of what was billed that has been collected." },
];

export const PORTER_METRICS = [
  { key: "passengers", label: "Passengers handled", kind: "count", value: (r) => n(r.passengers) },
  { key: "jobs", label: "Jobs done", kind: "count", value: (r) => n(r.jobs) },
  { key: "commission", label: "Earned", kind: "money", value: (r) => n(r.commission) },
];

/**
 * Rank rows on a metric, highest first. Rows with the same value share a rank (1, 2, 2, 4). Rows the metric cannot
 * rank (too few ratings, nothing billed) go to the bottom with rank null. `tieBreak` orders equal rows for display only.
 */
export function rankRows(rows, metric, tieBreak = (r) => String(r.name || "")) {
  const scored = (rows || []).map((r) => ({ row: r, value: metric.value(r) }));
  const ranked = scored.filter((s) => s.value !== null).sort((a, b) => b.value - a.value || tieBreak(a.row).localeCompare(tieBreak(b.row)));
  const unranked = scored.filter((s) => s.value === null).sort((a, b) => tieBreak(a.row).localeCompare(tieBreak(b.row)));
  let lastValue = null;
  let lastRank = 0;
  const out = ranked.map((s, i) => {
    const rank = s.value === lastValue ? lastRank : i + 1;
    lastValue = s.value;
    lastRank = rank;
    return { ...s.row, rank, value: s.value };
  });
  return [...out, ...unranked.map((s) => ({ ...s.row, rank: null, value: null }))];
}

/** Supervisors who actually have a person behind them (bookings with nobody assigned are grouped as "Unassigned"). */
export function realSupervisors(rows) {
  return (rows || []).filter((r) => r.supervisor_id);
}

/** Share of the leader's value, 0 to 1, for the bar behind each row. */
export function barShare(value, top) {
  if (value === null || value === undefined || !(top > 0)) return 0;
  return Math.max(0, Math.min(1, value / top));
}
