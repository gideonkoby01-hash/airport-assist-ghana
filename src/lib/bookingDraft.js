// The booking page keeps what the passenger has filled in, so signing in, a refresh or leaving and coming back does not
// start the booking again. It lives only in this browser tab (session storage) and is dropped once the booking is made
// or after a day. The ID photo is never stored here.

const KEY = "aag-booking-draft-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readDraft(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || !d.form || typeof d.form !== "object") return null;
    if (!Number.isFinite(d.at) || now - d.at > MAX_AGE_MS) return null;
    if (!Array.isArray(d.passengers) || d.passengers.length < 1 || d.passengers.length > 50) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft({ form, passengers, step, consented, otherAirline }, now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ form, passengers, step, consented, otherAirline, at: now }));
  } catch {
    // storage is unavailable (a private window, for example): the booking still works, it just is not kept
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** "Meet and greet at the air-bridge, Fast-track escort through security and immigration." into one line per service. */
export function inclusionList(text) {
  return String(text || "")
    .split(/,\s*(?=[A-Z])/)
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter(Boolean);
}
