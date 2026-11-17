// Airlines that fly to and from Accra (Kotoka), with their two-letter flight code, so picking the airline can start the flight number.
export const AIRLINES = [
  { name: "Africa World Airlines", code: "AW" },
  { name: "Air Côte d'Ivoire", code: "HF" },
  { name: "Air France", code: "AF" },
  { name: "Air Peace", code: "P4" },
  { name: "Air Sénégal", code: "HM" },
  { name: "ASKY Airlines", code: "KP" },
  { name: "British Airways", code: "BA" },
  { name: "Brussels Airlines", code: "SN" },
  { name: "Delta Air Lines", code: "DL" },
  { name: "Egyptair", code: "MS" },
  { name: "Emirates", code: "EK" },
  { name: "Ethiopian Airlines", code: "ET" },
  { name: "Kenya Airways", code: "KQ" },
  { name: "KLM Royal Dutch Airlines", code: "KL" },
  { name: "Lufthansa", code: "LH" },
  { name: "Passion Air", code: "PJ" },
  { name: "Qatar Airways", code: "QR" },
  { name: "Royal Air Maroc", code: "AT" },
  { name: "RwandAir", code: "WB" },
  { name: "South African Airways", code: "SA" },
  { name: "Turkish Airlines", code: "TK" },
  { name: "United Airlines", code: "UA" },
  { name: "Virgin Atlantic", code: "VS" },
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
