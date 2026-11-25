// What a person types in the sign-in box: an email address, or a phone number (porters sign in with their phone number). Pure functions,
// tested in loginIdentifier.test.mjs.

/**
 * A Ghana or international phone number written the usual ways ("0241234567", "024 123 4567", "233241234567", "+233 24 123 4567")
 * as +E.164 ("+233241234567"), or null if the text is not a phone number.
 */
export function normalizePhone(text) {
  const raw = String(text ?? "").trim();
  if (!raw || raw.includes("@")) return null;
  const cleaned = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{9,15}$/.test(cleaned)) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("233")) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length === 10) return `+233${cleaned.slice(1)}`;
  if (cleaned.length === 9) return `+233${cleaned}`; // 241234567: the leading zero left off
  return null;
}

/** The credentials object for Supabase sign-in: { phone } for a phone number, otherwise { email }. */
export function signInCredentials(text, password) {
  const phone = normalizePhone(text);
  return phone ? { phone, password } : { email: String(text ?? "").trim(), password };
}
