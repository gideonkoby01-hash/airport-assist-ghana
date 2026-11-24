// Monthly shift rosters for supervisors and porters, in the layout the team already uses: four shifts (groups of people), and for every
// day each shift is on the Morning (M), on the Night (N) or Off (O). A shift works M, then N, then is off two days, and the four shifts
// are one day apart, so every day exactly one shift covers the morning and one the night. For supervisors, one shift at a time is also
// marked "H. SUP" (head supervisor) for its morning and the night after, and the mark moves to the shift working the morning every
// five days. The pattern is worked out from two dates stored with the roster, so a new month simply carries on from the last one.
// Pure functions, tested in roster.test.mjs.

export const CYCLE = ["M", "N", "O", "O"];
export const GROUP_COUNT = 4;
export const HEAD_EVERY = 5;
/** The days the sheet shades: Saturday and Sunday (0 is Sunday). Only for looks. */
export const SHADED_WEEKDAYS = [0, 6];
export const KINDS = { supervisor: "Supervisors", porter: "Porters" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86400000;

const utc = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const mod = (n, m) => ((n % m) + m) % m;

/** Whole days from date a to date b ("2026-11-01" form). */
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY_MS);

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th"}`;
}

/** The first day of the month a date is in. */
export const monthStart = (date) => `${String(date).slice(0, 7)}-01`;

/** The first day of the month after (or `by` months from) this one. */
export function addMonths(month, by = 1) {
  const [y, m] = String(month).slice(0, 7).split("-").map(Number);
  const t = y * 12 + (m - 1) + by;
  return `${Math.floor(t / 12)}-${String(mod(t, 12) + 1).padStart(2, "0")}-01`;
}

export const monthLabel = (month) => MONTHS[Number(String(month).slice(5, 7)) - 1] || "";
export const monthTitle = (month) => `${monthLabel(month)} ${String(month).slice(0, 4)}`;

export function daysInMonth(month) {
  return daysBetween(monthStart(month), addMonths(month, 1));
}

/**
 * Where each shift is in its four-day cycle on the anchor date, when `group` (1 to 4) is the one on the morning that day. The next
 * shift in line for the night is the one before it in the list, as in the team's sheet (shift 3 on the morning, then 2 on the night).
 */
export function phasesForFirstMorning(group) {
  const g = Math.min(GROUP_COUNT, Math.max(1, Math.round(Number(group)) || 1));
  return Array.from({ length: GROUP_COUNT }, (_, i) => mod(g - (i + 1), GROUP_COUNT));
}

/** M, N or O for a shift (1 to 4) on a date. */
export function shiftOn(phases, anchor, date, group) {
  return CYCLE[mod(Number(phases[group - 1]) + daysBetween(anchor, date), CYCLE.length)];
}

/** The shift (1 to 4) working the morning on a date, or 0 if the phases are not usable. */
export function morningGroupOn(phases, anchor, date) {
  for (let g = 1; g <= GROUP_COUNT; g++) if (shiftOn(phases, anchor, date, g) === "M") return g;
  return 0;
}

/** "M" on a day the head supervisor mark starts (the morning), "N" the night after it, otherwise null. */
export function headMarkOn(headAnchor, date) {
  if (!headAnchor) return null;
  const k = mod(daysBetween(headAnchor, date), HEAD_EVERY);
  return k === 0 ? "M" : k === 1 ? "N" : null;
}

/** Every day of a month with its weekday and whether the sheet shades it. */
export function monthDays(month) {
  const start = utc(monthStart(month));
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = iso(start + i * DAY_MS);
    const weekday = new Date(start + i * DAY_MS).getUTCDay();
    return { date, day: i + 1, weekday, weekdayName: WEEKDAYS[weekday], shaded: SHADED_WEEKDAYS.includes(weekday) };
  });
}

/** The people of a shift as the header lists them: in the order they were put on the roster (then by name). */
export function groupNames(members, group) {
  const pos = (m) => (m.position === null || m.position === undefined ? Number.MAX_SAFE_INTEGER : Number(m.position));
  return (members || [])
    .filter((m) => Number(m.group_no) === group)
    .sort((a, b) => pos(a) - pos(b) || String(a.person_name).localeCompare(String(b.person_name), "en", { sensitivity: "base" }))
    .map((m) => ({ ...m, label: m.person_name }));
}

/**
 * Everything the sheet needs: the title, the four headers with their people, and one row for each day with a cell for each shift.
 * `roster` is { kind, month, anchor_date, phases, head_anchor }, `members` rows of { person_name, group_no, position }.
 */
export function buildSheet(roster, members) {
  const supervisors = roster.kind === "supervisor";
  const groups = Array.from({ length: GROUP_COUNT }, (_, i) => ({ no: i + 1, people: groupNames(members, i + 1) }));
  const rows = monthDays(roster.month).map((d) => {
    const mark = supervisors ? headMarkOn(roster.head_anchor, d.date) : null;
    return {
      ...d,
      cells: groups.map((g) => {
        const code = shiftOn(roster.phases, roster.anchor_date, d.date, g.no);
        return { group: g.no, code, head: mark !== null && mark === code };
      }),
    };
  });
  return {
    kind: roster.kind,
    title: (KINDS[roster.kind] || "").toUpperCase(),
    month: roster.month,
    monthName: monthLabel(roster.month).toUpperCase(),
    nextMonthName: monthLabel(addMonths(roster.month)).toUpperCase(),
    groups,
    rows,
  };
}

/** One person's shifts for a month: [{ date, day, weekdayName, code, head }] for the shift they are in, or null when they are in none. */
export function personShifts(roster, members, personId) {
  const me = (members || []).find((m) => String(m.person_id) === String(personId));
  if (!me) return null;
  return buildSheet(roster, members).rows.map((r) => ({ date: r.date, day: r.day, weekdayName: r.weekdayName, group: me.group_no, ...r.cells[me.group_no - 1] }));
}

/** How many people are in each shift, for the "unbalanced" hint (the sizes should differ by at most one). */
export function groupSizes(members) {
  const sizes = Array(GROUP_COUNT).fill(0);
  for (const m of members || []) if (m.group_no >= 1 && m.group_no <= GROUP_COUNT) sizes[m.group_no - 1] += 1;
  return sizes;
}
export const isBalanced = (members) => {
  const s = groupSizes(members);
  return Math.max(...s) - Math.min(...s) <= 1;
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The sheet's own styling, the same on screen and on paper. The shading is forced on for printing, because browsers leave out background colours by default. */
export function sheetCss() {
  return `.roster{font-family:Calibri,Carlito,Arial,Helvetica,sans-serif;color:#000;font-size:14px;max-width:820px;margin:0 auto}
.roster,.roster *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.roster h2{text-align:center;font-size:16px;margin:0 0 6px;font-weight:700}
.roster table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff;border:1.5px solid #222}
.roster th,.roster td{border:1px solid #222;padding:3px 7px;vertical-align:middle;line-height:1.25}
.roster thead th{text-align:left;font-weight:700;vertical-align:top}
.roster th small{display:block;font-weight:400;font-size:13px;line-height:1.35;margin-top:3px}
.roster td.c{text-align:center}.roster td.n{text-align:center}.roster td.w{text-align:left}
.roster tr.s td{background:var(--shade)}
.roster td.hs{font-weight:700}.roster .h{display:block;font-weight:700}.roster sup{font-size:10px;line-height:0}
.roster tr.next td{background:var(--shade);font-weight:700}

.roster .legend{margin-top:8px;font-size:12px;color:#444}
.roster.screen .cd{display:inline-block;min-width:1.9em;border-radius:6px;padding:0 5px;font-weight:600}
.roster.screen .cd.m{background:#fde68a;color:#78350f}
.roster.screen .cd.n{background:#c7d2fe;color:#312e81}
.roster.screen .cd.o{color:rgba(0,0,0,.42);font-weight:400}
.roster.screen tr.today td{outline:2px solid #0b213c;outline-offset:-2px;font-weight:700}
.roster.screen tr.today td.n::after{content:" \\2190";color:#0b213c}`;
}

/** The sheet as an HTML fragment (the table and its title), the same markup on screen and on paper. */
export function sheetHtml(sheet, opts = {}) {
  const shade = sheet.kind === "porter" ? "#00b0f0" : "#92d050";
  const head = sheet.groups.map((g) => `<th>SHIFT ${["ONE", "TWO", "THREE", "FOUR"][g.no - 1]}<small>${esc(g.people.map((p) => p.label).join(", ")) || "&nbsp;"}</small></th>`).join("");
  const body = sheet.rows.map((r) => {
    const cells = r.cells.map((c) => `<td class="c${c.head ? " hs" : ""}"><span class="cd ${c.code.toLowerCase()}">${esc(c.code)}</span>${c.head ? '<span class="h">H. SUP</span>' : ""}</td>`).join("");
    const classes = [r.shaded ? "s" : "", opts.today && r.date === opts.today ? "today" : ""].filter(Boolean).join(" ");
    return `<tr${classes ? ` class="${classes}"` : ""}><td class="n">${ordinal(r.day).replace(/(st|nd|rd|th)$/, "<sup>$1</sup>")}</td><td class="w">${esc(r.weekdayName)}</td>${cells}</tr>`;
  }).join("");
  return `<div class="roster${opts.screen ? " screen" : ""}" style="--shade:${shade}"><h2>${esc(sheet.title)}</h2>
<table><colgroup><col style="width:12%"><col style="width:19%"><col style="width:17.25%"><col style="width:17.25%"><col style="width:17.25%"><col style="width:17.25%"></colgroup>
<thead><tr><th>${esc(sheet.monthName)}:</th><th>12H SHIFT REPRESENTATION</th>${head}</tr></thead><tbody>${body}
<tr class="next"><td colspan="6">${esc(sheet.nextMonthName)}:</td></tr></tbody></table>
<p class="legend">M = morning shift · N = night shift · O = off${sheet.kind === "supervisor" ? " · H. SUP = head supervisor" : ""}</p></div>`;
}

/** How tall each day's row is on paper, so the month fills one A4 page (shorter for a month with many two-line H. SUP rows). */
export function printRowMm(sheet) {
  const headRows = sheet.rows.filter((r) => r.cells.some((c) => c.head)).length;
  const rows = sheet.rows.length + 1;
  // the header grows with the longest list of names (about 22 letters a line, 4.4 mm a line)
  const longest = Math.max(0, ...sheet.groups.map((g) => g.people.map((p) => p.label).join(", ").length));
  const headerMm = 9 + 4.4 * Math.ceil(longest / 22);
  return Math.round(Math.min(8.5, Math.max(4.4, (252 - headerMm - 4.5 * headRows) / rows)) * 10) / 10;
}

/**
 * A whole page for printing or saving as PDF: A4 portrait on one page, the colours kept, and no margin for the browser to print its own
 * date, page title and address in (the spacing comes from the page's own padding instead).
 */
export function sheetPage(sheet) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sheet.title)} ${esc(sheet.monthName)} roster</title>
<style>${sheetCss()}
@page{size:A4 portrait;margin:0}
html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{padding:12mm}
@media print{.no-print{display:none!important}.roster{max-width:none;font-size:10.5pt}.roster th small{font-size:10pt}.roster .legend{display:none}.roster tbody tr{height:${printRowMm(sheet)}mm}.roster th,.roster td{padding:1px 6px}.roster thead th{padding:3px 6px;font-size:10pt}.roster thead th small{font-size:10pt}}
</style></head>
<body>${sheetHtml(sheet)}</body></html>`;
}

/** The roster as CSV rows: one line a day, for spreadsheets. */
export function sheetCsvRows(sheet) {
  return sheet.rows.map((r) => ({
    date: r.date, day: r.weekdayName,
    ...Object.fromEntries(r.cells.map((c) => [`shift_${c.group}`, c.head ? `${c.code} (H. SUP)` : c.code])),
  }));
}
