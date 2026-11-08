// Shared helpers for the Passenger Ratings & Reviews feature.
// There is exactly ONE rating category: the overall Airport Assist experience.

export const STAR_VALUES = [5, 4, 3, 2, 1];

export const STAR_LABELS = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

export const RATING_SORT_OPTIONS = [
  { value: "-submitted_at", label: "Newest first" },
  { value: "submitted_at", label: "Oldest first" },
  { value: "-overall_rating", label: "Highest rating" },
  { value: "overall_rating", label: "Lowest rating" },
];

export function starText(value) {
  const n = Number(value) || 0;
  return `${n} Star${n === 1 ? "" : "s"}${STAR_LABELS[n] ? ` – ${STAR_LABELS[n]}` : ""}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}