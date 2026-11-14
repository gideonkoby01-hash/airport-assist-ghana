// Booking lifecycle rules, mirrored from the database trigger `bookings_status_guard`
// (supabase/migrations/..._lifecycle_audit_governance.sql). The database is the authority;
// this copy only decides which choices the screen offers. Keep the two in step.

export const STATUS_TRANSITIONS = {
  confirmed: ["assigned", "cancelled", "no_show"],
  assigned: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS);

/** Statuses a booking can move to from `status`. */
export function nextStatuses(status) {
  return STATUS_TRANSITIONS[status] || [];
}

/** Completed, cancelled and no-show bookings take no payments and no normal status changes. */
export function isClosed(status) {
  return nextStatuses(status).length === 0;
}

/** Payments are refused on cancelled and no-show bookings. */
export function acceptsPayments(status) {
  return status !== "cancelled" && status !== "no_show";
}
