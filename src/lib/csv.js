// CSV for the accountant. Cells that start with = + - @ are prefixed with an apostrophe so a spreadsheet never
// runs them as a formula (a name or note typed as "=HYPERLINK(...)" must stay text).

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** columns: [{ key, label, value?: (row) => any }] */
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(","));
  // A leading byte-order mark makes Excel read the file as UTF-8 (names with accents stay correct).
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
