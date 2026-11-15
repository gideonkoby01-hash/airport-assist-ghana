// The printable receipt, as a standalone HTML page (printed from a hidden frame so the app's menus never appear on it).
import { PAYMENT_METHOD_LABELS, STATUS_LABELS, formatGHS } from "./packages.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function receiptHtml(booking, now = new Date()) {
  const row = (label, value, bold = false) =>
    `<tr${bold ? ' class="b"' : ""}><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`;
  const flight = [booking.airline, booking.flight_number].filter(Boolean).join(" ");
  const rows = [
    row("Service", booking.package_name || booking.package_code),
    row("Passengers", booking.num_passengers),
    row("Flight", `${flight} ${booking.flight_date || ""}`.trim() || "—"),
    ...(Number(booking.discount_amount) > 0
      ? [row("Price before discount", formatGHS(booking.original_total)), row("Discount", `-${formatGHS(booking.discount_amount)}`)]
      : []),
    row("Total", formatGHS(booking.total_value)),
    row(`Paid${booking.payment_method ? ` (${PAYMENT_METHOD_LABELS[booking.payment_method] || booking.payment_method})` : ""}`, formatGHS(booking.amount_collected), true),
    row("Balance", formatGHS(booking.outstanding_balance)),
    row("Status", STATUS_LABELS[booking.status] || booking.status),
  ].join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(booking.reference)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#0b213c;margin:32px;max-width:560px}h1{font-size:20px;margin:0 0 4px}
p{margin:0 0 16px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 0;border-bottom:1px solid #e5e7eb}
.r{text-align:right}.b td{font-weight:700}small{color:#5a697c}</style></head><body>
<h1>Airport Assist Ghana, Akwaaba Services</h1><p>Receipt for booking <strong>${esc(booking.reference)}</strong></p>
<table>${rows}</table>
<p style="margin-top:16px"><small>Printed ${esc(now.toLocaleDateString("en-GB", { dateStyle: "long" }))}. This receipt shows what was paid for this booking; it is not a tax invoice.</small></p>
</body></html>`;
}
