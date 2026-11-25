// What the porter dashboard works out from the data the backend sends: the shifts from the roster pattern, jobs grouped by day, and
// earnings totals. Pure functions, tested in porterDashboard.test.mjs.
import { shiftOn } from "./roster.js";

const DAY_MS = 86400000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const utc = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDays = (iso, n) => new Date(utc(iso) + n * DAY_MS).toISOString().slice(0, 10);

export const SHIFT_NAMES = { M: "Morning", N: "Night", O: "Off" };

/** "Wed 25 Nov" */
export function dayLabel(iso) {
  const d = new Date(utc(iso));
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** "Wednesday 25 November" */
export function longDayLabel(iso) {
  const d = new Date(utc(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The porter's shifts for `days` days from `from`. `rosters` are the porter's roster rows ({ month, anchor_date, phases, group_no });
 * a day with no roster for its month has code null (not on a roster that month).
 */
export function shiftsFrom(rosters, from, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const roster = (rosters || []).find((r) => String(r.month).slice(0, 7) === date.slice(0, 7));
    const code = roster ? shiftOn(roster.phases, String(roster.anchor_date).slice(0, 10), date, Number(roster.group_no)) : null;
    const weekday = new Date(utc(date)).getUTCDay();
    return { date, label: dayLabel(date), code, name: code ? SHIFT_NAMES[code] : "No roster yet", weekend: weekday === 0 || weekday === 6 };
  });
}

/** Jobs split into today, coming up, and recent (before today), each in time order. Recent comes newest first. */
export function splitJobs(jobs, today) {
  const sorted = [...(jobs || [])].sort((a, b) => `${a.flight_date} ${a.scheduled_flight_time || ""}`.localeCompare(`${b.flight_date} ${b.scheduled_flight_time || ""}`));
  return {
    today: sorted.filter((j) => j.flight_date === today),
    upcoming: sorted.filter((j) => j.flight_date > today),
    recent: sorted.filter((j) => j.flight_date < today).reverse(),
  };
}

/** Totals for the earnings tab: this month, and what is still owed to the porter (never below zero for any one day). */
export function earningsSummary(earnings, today) {
  const month = String(today).slice(0, 7);
  let monthEarned = 0, monthJobs = 0, monthPassengers = 0, owed = 0, paid = 0;
  const days = (earnings || []).map((e) => {
    const earned = Number(e.earned) || 0;
    const given = Number(e.paid) || 0;
    const balance = Math.max(0, Math.round((earned - given) * 100) / 100);
    owed += balance;
    paid += given;
    if (String(e.date).slice(0, 7) === month) {
      monthEarned += earned;
      monthJobs += Number(e.jobs) || 0;
      monthPassengers += Number(e.passengers) || 0;
    }
    return { date: e.date, label: dayLabel(e.date), jobs: Number(e.jobs) || 0, passengers: Number(e.passengers) || 0, earned, paid: given, balance };
  });
  const r = (n) => Math.round(n * 100) / 100;
  return { monthEarned: r(monthEarned), monthJobs, monthPassengers, owed: r(owed), paid: r(paid), days };
}

/** A job's plain-words flight line: "Arrival BA 078, 10:30". */
export function flightLine(job) {
  const kind = job.flight_type === "departure" ? "Departure" : "Arrival";
  const flight = [job.airline, job.flight_number].filter(Boolean).join(" ");
  return [kind, flight, job.scheduled_flight_time].filter(Boolean).join(" · ");
}
