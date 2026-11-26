// A phone number written the usual ways ("0241234567", "024 123 4567", "233241234567", "+233 24 123 4567") as +E.164
// ("+233241234567"), or null when the text is not a phone number. The website has the same rules (src/lib/loginIdentifier.js).
export function normalizePhone(text: unknown): string | null {
  const raw = String(text ?? '').trim();
  if (!raw || raw.includes('@')) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{9,15}$/.test(cleaned)) return null;
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('233')) return `+${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length === 10) return `+233${cleaned.slice(1)}`;
  if (cleaned.length === 9) return `+233${cleaned}`;
  return null;
}
