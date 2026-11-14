// Turns audit-log rows and payments-ledger rows into a readable booking timeline.
import { STATUS_LABELS, formatGHS, PAYMENT_METHOD_LABELS } from "./packages.js";

export function buildEvents(auditRows, paymentRows, names = {}) {
  const who = (id, role) => names[id] || (role ? role : "System");
  const events = [];
  for (const r of auditRows) {
    if (r.action === "INSERT") {
      events.push({ at: r.at, text: "Booking created", who: who(r.actor_id, r.actor_role) });
    } else if (r.action === "UPDATE" && r.before && r.after) {
      if (r.before.status !== r.after.status) {
        const reason = r.after.status_reason && r.before.status_reason !== r.after.status_reason ? ` (reason: ${r.after.status_reason})` : "";
        events.push({
          at: r.at,
          text: `Status ${STATUS_LABELS[r.before.status] || r.before.status} to ${STATUS_LABELS[r.after.status] || r.after.status}${reason}`,
          who: who(r.actor_id, r.actor_role),
        });
      }
      if (r.before.assigned_supervisor_id !== r.after.assigned_supervisor_id && r.after.assigned_supervisor_name) {
        events.push({ at: r.at, text: `Assigned to ${r.after.assigned_supervisor_name}`, who: who(r.actor_id, r.actor_role) });
      }
    }
  }
  for (const p of paymentRows) {
    const type = p.entry_type || "payment";
    const how = p.method ? ` by ${PAYMENT_METHOD_LABELS[p.method] || p.method}` : "";
    const text =
      type === "refund" ? `Refunded ${formatGHS(p.amount)}${how}: ${p.reason || ""}`
      : type === "write_off" ? `Wrote off ${formatGHS(p.amount)}: ${p.reason || ""}`
      : `Payment ${formatGHS(p.amount)}${how}`;
    events.push({ at: p.created_date, text, who: p.recorded_by_name || "Staff" });
  }
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
