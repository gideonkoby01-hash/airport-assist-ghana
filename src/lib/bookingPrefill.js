// The website's quick quote sends people to the booking form with their choices in the address:
// /passenger?tab=book&package=full_arrival&date=2026-12-01&pax=2
// This reads them back safely: anything that is not a known package, a real future date or 1 to 10 people is ignored.
import { PACKAGE_DEFINITIONS } from "./packages.js";

export const MAX_PREFILL_PASSENGERS = 10;

export function parseBookingPrefill(search, today = new Date().toISOString().slice(0, 10)) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const pkg = PACKAGE_DEFINITIONS.find((p) => p.code === params.get("package"));
  const date = params.get("date") || "";
  const pax = Number(params.get("pax"));
  return {
    package_code: pkg ? pkg.code : "",
    flight_type: pkg && pkg.flight_type !== "both" ? pkg.flight_type : "",
    flight_date: /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today ? date : "",
    passengers: Number.isInteger(pax) && pax >= 1 && pax <= MAX_PREFILL_PASSENGERS ? pax : 1,
  };
}

/** The booking address for a quote: where the website's "Continue to booking" button goes. */
export function bookingAddress({ package_code = "", date = "", pax = 1 } = {}) {
  const q = new URLSearchParams({ tab: "book" });
  if (package_code) q.set("package", package_code);
  if (date) q.set("date", date);
  if (pax && pax > 1) q.set("pax", String(pax));
  return `/passenger?${q.toString()}`;
}
