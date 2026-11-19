// Chart colours. One fixed order, validated for colour-blind readers, and a colour belongs to the thing it names
// (a payment method keeps its colour on every chart), never to its rank. Text never wears a series colour.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const NEUTRAL = "#c3c2b7"; // the de-emphasis grey

// A sequential ramp (light to dark blue) for magnitude on a grid.
export const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#104281"];

export const GOOD = "#006300"; // success text
export const BAD = "#d03b3b"; // critical

export const METHOD_COLOURS = { cash: SERIES[0], mobile_money: SERIES[1], card: SERIES[2], corporate_account: SERIES[3], bank_transfer: SERIES[6] };
export const CHANNEL_COLOURS = { online: SERIES[0], walk_in: SERIES[1] };
export const DIRECTION_COLOURS = { arrival: SERIES[0], departure: SERIES[1] };
export const PACKAGE_COLOURS = { full_arrival: SERIES[0], full_departure: SERIES[1], departure_priority: SERIES[2], porter_only: SERIES[3] };
export const STATUS_COLOURS = { completed: SERIES[2], in_progress: SERIES[0], assigned: SERIES[6], confirmed: SERIES[3], cancelled: SERIES[7], no_show: NEUTRAL };

export const AXIS = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };

/** A colour for the n-th item of a list with no fixed colours: the fixed order, then grey for "the rest". */
export function seriesColour(i) {
  return i < SERIES.length ? SERIES[i] : NEUTRAL;
}
