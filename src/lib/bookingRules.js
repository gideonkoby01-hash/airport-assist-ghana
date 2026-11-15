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

/** Bookings still to be served. */
export const LIVE_STATUSES = ["confirmed", "assigned", "in_progress"];

/** Filters for the supervisor's list: what is asked of the database, in the order the day is worked. */
export function supervisorView(view, supervisorId, today, search = "") {
  const base = { assigned_supervisor_id: supervisorId };
  /** @type {any} */
  let query;
  let sort;
  if (view === "today") {
    query = { ...base, status: { $in: LIVE_STATUSES }, flight_date: today };
    sort = "scheduled_flight_time";
  } else if (view === "closed") {
    query = { ...base, status: { $in: ["completed", "cancelled", "no_show"] } };
    sort = "-flight_date,-scheduled_flight_time";
  } else if (view === "all") {
    query = base;
    sort = "-flight_date,-scheduled_flight_time";
  } else {
    query = { ...base, status: { $in: LIVE_STATUSES } };
    sort = "flight_date,scheduled_flight_time";
  }
  const text = String(search).trim();
  if (text) {
    query = { $and: [query, { $or: [{ reference: { $regex: text } }, { flight_number: { $regex: text } }, { contact: { $regex: text } }] }] };
  }
  return { query, sort };
}

/** A booking that is still live although its flight date has gone by: someone needs to close or cancel it. */
export function isOverdue(booking, today) {
  return LIVE_STATUSES.includes(booking?.status) && Boolean(booking?.flight_date) && booking.flight_date < today;
}
