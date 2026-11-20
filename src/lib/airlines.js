// The airlines passengers choose from, in the order the business gave them. Picking one starts the flight number with its
// two-letter code (KQ for Kenya Airways).
export const AIRLINES = [
  { name: "Africa World Airlines", code: "AW" },
  { name: "Passion Air", code: "OP" },
  { name: "Air Peace", code: "P4" },
  { name: "ASKY Airlines", code: "KP" },
  { name: "Brussels Airlines", code: "SN" },
  { name: "Air Côte d’Ivoire", code: "HF" },
  { name: "Emirates", code: "EK" },
  { name: "Middle East Airlines", code: "ME" },
  { name: "Qatar Airways", code: "QR" },
  { name: "South African Airways", code: "SA" },
  { name: "Kenya Airways", code: "KQ" },
  { name: "TAP Air Portugal", code: "TP" },
  { name: "Ethiopian Airlines", code: "ET" },
  { name: "Royal Air Maroc", code: "AT" },
  { name: "Turkish Airlines", code: "TK" },
  { name: "KLM", code: "KL" },
  { name: "Delta Air Lines", code: "DL" },
  { name: "United Airlines", code: "UA" },
  { name: "EgyptAir", code: "MS" },
  { name: "British Airways", code: "BA" },
  { name: "ITA Airways", code: "AZ" },
  { name: "RwandAir", code: "WB" },
  { name: "Air Tanzania (via Lagos)", code: "TC" },
  { name: "Value Jet", code: "VK" },
  { name: "Ibom Air", code: "QI" },
  { name: "Uganda Airlines", code: "UR" },
  { name: "United Nigeria Airlines", code: "UN" },
  { name: "Air Burkina", code: "2J" },
];

export const OTHER_AIRLINE = "__other";

/** The airline's flight code when `name` is one of the listed airlines, otherwise "". */
export function airlineCode(name) {
  return AIRLINES.find((a) => a.name === name)?.code || "";
}

/** True when the saved airline text is one of the listed names (otherwise the form shows it in the "Other" box). */
export function isListedAirline(name) {
  return AIRLINES.some((a) => a.name === name);
}
