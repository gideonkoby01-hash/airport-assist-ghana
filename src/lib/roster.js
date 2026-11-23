// Monthly shift rosters for supervisors and porters, in the layout the team already uses: four shifts (groups of people), and for every
// day each shift is on the Morning (M), on the Night (N) or Off (O). A shift works M, then N, then is off two days, and the four shifts
// are one day apart, so every day exactly one shift covers the morning and one the night. For supervisors, one shift at a time is also
// marked "H. SUP" (head supervisor) for its morning and the night after, and the mark moves to the shift working the morning every
// five days. The pattern is worked out from two dates stored with the roster, so a new month simply carries on from the last one.
// Pure functions, tested in roster.test.mjs.

export const CYCLE = ["M", "N", "O", "O"];
export const GROUP_COUNT = 4;
export const HEAD_EVERY = 5;
/** The days the sheet shades: Tuesday and Wednesday (0 is Sunday). */
export const SHADED_WEEKDAYS = [2, 3];
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

/** The people of a shift as the header lists them: the ordinary members by name, then the marked ones with ** in front. */
export function groupNames(members, group) {
  const mine = (members || []).filter((m) => Number(m.group_no) === group);
  const byName = (a, b) => String(a.person_name).localeCompare(String(b.person_name), "en", { sensitivity: "base" });
  const plain = mine.filter((m) => !m.lead).sort(byName);
  const lead = mine.filter((m) => m.lead).sort(byName);
  return [...plain.map((m) => ({ ...m, label: m.person_name })), ...lead.map((m) => ({ ...m, label: `**${m.person_name}` }))];
}

/**
 * Everything the sheet needs: the title, the four headers with their people, and one row for each day with a cell for each shift.
 * `roster` is { kind, month, anchor_date, phases, head_anchor }, `members` rows of { person_name, group_no, lead }.
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

/** The sheet's own styling. `shade` is the colour of the shaded days and the month bar (green for supervisors, blue for porters). */
export function sheetCss() {
  return `.roster{font-family:Calibri,Arial,Helvetica,sans-serif;color:#000;font-size:13px;max-width:760px}
.roster h2{text-align:center;font-size:14px;margin:0 0 4px;letter-spacing:.02em}
.roster table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}
.roster th,.roster td{border:1px solid #333;padding:3px 6px;vertical-align:top}
.roster th{text-align:left;font-weight:700;font-size:13px}
.roster th small{display:block;font-weight:400;font-size:12px;line-height:1.35;margin-top:2px}
.roster .m{text-align:left;font-size:13px}.roster td.c{text-align:center}
.roster td.n{text-align:right;width:54px;padding-right:12px;white-space:nowrap}.roster td.w{width:112px;white-space:nowrap}
.roster tr.s td{background:var(--shade)}.roster .shift{width:20%}
.roster .h{font-weight:700;display:block;line-height:1.15}.roster sup{font-size:9px}
.roster tr.next td{background:var(--shade);font-weight:700}
.roster .legend{margin-top:8px;font-size:12px;color:#444}`;
}

/** The sheet as an HTML fragment (the table and its title), the same markup on screen and on paper. */
export function sheetHtml(sheet) {
  const shade = sheet.kind === "porter" ? "#00b0f0" : "#92d050";
  const head = sheet.groups.map((g) => `<th class="shift">SHIFT ${["ONE", "TWO", "THREE", "FOUR"][g.no - 1]}<small>${esc(g.people.map((p) => p.label).join(", ")) || "&nbsp;"}</small></th>`).join("");
  const body = sheet.rows.map((r) => {
    const cells = r.cells.map((c) => `<td class="c">${esc(c.code)}${c.head ? '<span class="h">H. SUP</span>' : ""}</td>`).join("");
    return `<tr${r.shaded ? ' class="s"' : ""}><td class="n">${ordinal(r.day).replace(/(st|nd|rd|th)$/, "<sup>$1</sup>")}</td><td class="w">${esc(r.weekdayName)}</td>${cells}</tr>`;
  }).join("");
  return `<div class="roster" style="--shade:${shade}"><h2>${esc(sheet.title)}</h2>
<table><thead><tr><th colspan="2">${esc(sheet.monthName)}:&nbsp;&nbsp;12H SHIFT REPRESENTATION</th>${head}</tr></thead><tbody>${body}
<tr class="next"><td colspan="6">${esc(sheet.nextMonthName)}:</td></tr></tbody></table>
<p class="legend">M = morning shift · N = night shift · O = off${sheet.kind === "supervisor" ? " · H. SUP = head supervisor · ** = marked in the shift" : ""}</p></div>`;
}

/** A whole page for printing or saving as PDF (portrait, one page). */
export function sheetPage(sheet) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sheet.title)} ${esc(sheet.monthName)} roster</title>
<style>${sheetCss()}@page{size:A4 portrait;margin:10mm}body{margin:16px}@media print{.no-print{display:none!important}body{margin:0}.roster{max-width:none}.roster th,.roster td{padding:1px 5px;font-size:11px}}</style></head>
<body>${sheetHtml(sheet)}</body></html>`;
}

/** The roster as CSV rows: one line a day, for spreadsheets. */
export function sheetCsvRows(sheet) {
  return sheet.rows.map((r) => ({
    date: r.date, day: r.weekdayName,
    ...Object.fromEntries(r.cells.map((c) => [`shift_${c.group}`, c.head ? `${c.code} (H. SUP)` : c.code])),
  }));
}
