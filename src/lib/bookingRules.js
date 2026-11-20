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

/** Bookings nobody is looking after yet: confirmed, with no supervisor assigned. */
export const UNASSIGNED = { status: "confirmed", $or: [{ assigned_supervisor_id: null }, { assigned_supervisor_id: "" }] };

/** Filters for management's list of every booking, in the order they matter. */
export function managementView(view, today, search = "") {
  /** @type {any} */
  let query = {};
  let sort = "-created_date";
  if (view === "unassigned") {
    query = UNASSIGNED;
    sort = "flight_date,scheduled_flight_time";
  } else if (view === "today") {
    query = { flight_date: today };
    sort = "scheduled_flight_time";
  } else if (view === "open") {
    query = { status: { $in: LIVE_STATUSES } };
    sort = "flight_date,scheduled_flight_time";
  } else if (view === "closed") {
    query = { status: { $in: ["completed", "cancelled", "no_show"] } };
    sort = "-flight_date,-scheduled_flight_time";
  }
  const text = String(search).trim();
  if (text) {
    const found = { $or: [{ reference: { $regex: text } }, { flight_number: { $regex: text } }, { contact: { $regex: text } }, { assigned_supervisor_name: { $regex: text } }] };
    query = Object.keys(query).length ? { $and: [query, found] } : found;
  }
  return { query, sort };
}

/** How today's flights split by progress, for the bar on the management summary. */
export function tallyToday(bookings) {
  const t = { waiting: 0, assigned: 0, in_progress: 0, completed: 0, other: 0, total: 0 };
  for (const b of bookings) {
    t.total += 1;
    if (b.status === "confirmed") t.waiting += 1;
    else if (b.status === "assigned") t.assigned += 1;
    else if (b.status === "in_progress") t.in_progress += 1;
    else if (b.status === "completed") t.completed += 1;
    else t.other += 1;
  }
  return t;
}

/**
 * Who puts a porter on a booking (mirrors supabase/functions/_shared/porters.ts; the server is the authority).
 * A service requested on the website: management and admin. A walk-in at the desk: its supervisor, and management and admin.
 */
export function canAssignPorter(user, booking) {
  if (!user || !booking) return false;
  if (booking.status === "cancelled" || booking.status === "no_show") return false;
  if (user.role === "admin" || user.role === "management") return true;
  return user.role === "supervisor" && booking.booking_channel === "walk_in" && booking.assigned_supervisor_id === user.id;
}

/** Website bookings (any service) still waiting for a porter: not cancelled or finished, nobody assigned yet. */
export function waitingForPorter(bookings) {
  return bookings.filter((b) => b.booking_channel !== "walk_in" && ["confirmed", "assigned", "in_progress"].includes(b.status) && (b.porters || []).reduce((n, p) => n + (Number(p.passengers_handled) || 0), 0) < (Number(b.num_passengers) || 1) - (Number(b.porters_waived) || 0));
}
