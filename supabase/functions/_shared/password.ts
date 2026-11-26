// Password storage for porter logins: PBKDF2-HMAC-SHA256 with a random salt, stored as "pbkdf2-sha256$iterations$salt$hash" (base64).
// Comparison takes the same time whether or not the first bytes match, and a phone number that has no login still pays for one hash,
// so the answer does not reveal which phone numbers are registered.

const ITERATIONS = 210_000;
const ALGO = 'pbkdf2-sha256';

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(text);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  return `${ALGO}$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [algo, iter, salt, hash] = String(stored ?? '').split('$');
  const iterations = Number(iter);
  if (algo !== ALGO || !Number.isInteger(iterations) || iterations < 1000 || iterations > 2_000_000 || !salt || !hash) return false;
  try {
    return sameBytes(await derive(password, unb64(salt), iterations), unb64(hash));
  } catch {
    return false;
  }
}

// A hash of nothing in particular, checked when there is no login for a phone number (same cost, always false).
let dummy: string | null = null;
export async function spendTheSameTime(password: string): Promise<false> {
  dummy ??= await hashPassword('not-a-real-password');
  await verifyPassword(dummy, password);
  return false;
}

/** Why a new password is not allowed, or null. Ten characters at least, and not just the phone number or digits. */
export function passwordProblem(password: unknown, phone = ''): string | null {
  const p = String(password ?? '');
  if (p.length < 10) return 'Use at least 10 characters.';
  if (p.length > 200) return 'That password is too long.';
  if (/^\d+$/.test(p)) return 'Use letters as well as numbers.';
  if (phone && p.replace(/\D/g, '').length >= 9 && phone.replace(/\D/g, '').endsWith(p.replace(/\D/g, '').slice(-9))) return 'Do not use your phone number as your password.';
  return null;
}
