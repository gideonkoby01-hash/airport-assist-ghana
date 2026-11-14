// AAG-YYMMDD-XXXX, with the random part from the crypto source (no easily confused characters).
export function makeReference(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `AAG-${ymd}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}
