// A one-time password an admin can read out or paste: 16 characters, no look-alikes (0/O, 1/l/I),
// guaranteed to contain a lower-case letter, an upper-case letter, a digit and a symbol.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '#$%&*+=?';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

// Unbiased pick from `chars` using random bytes (rejects values that would skew the result).
function pick(chars: string, bytes: Uint8Array, state: { i: number }): string {
  const limit = 256 - (256 % chars.length);
  for (;;) {
    if (state.i >= bytes.length) {
      crypto.getRandomValues(bytes);
      state.i = 0;
    }
    const b = bytes[state.i++];
    if (b < limit) return chars[b % chars.length];
  }
}

// Unbiased random whole number from 0 to max - 1.
function randomIndex(max: number): number {
  const limit = 0x100000000 - (0x100000000 % max);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generateTempPassword(length = 16): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const state = { i: 0 };
  const out = [pick(LOWER, bytes, state), pick(UPPER, bytes, state), pick(DIGIT, bytes, state), pick(SYMBOL, bytes, state)];
  while (out.length < length) out.push(pick(ALL, bytes, state));
  // Shuffle so the guaranteed characters are not always first.
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
