// Encryption for API keys saved from the admin Settings page. AES-256-GCM: the data is scrambled and also sealed,
// so a changed or truncated value is refused rather than decrypted wrongly. The key comes from the function secret
// SETTINGS_ENCRYPTION_KEY (32 random bytes, base64) and is never stored in the database.

const VERSION = 'v1';

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function b64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function encryptionKeyProblem(keyB64: string | undefined): string | null {
  if (!keyB64) return 'SETTINGS_ENCRYPTION_KEY is not set.';
  try {
    if (b64ToBytes(keyB64).length !== 32) return 'SETTINGS_ENCRYPTION_KEY must be 32 random bytes, base64 encoded.';
  } catch {
    return 'SETTINGS_ENCRYPTION_KEY is not valid base64.';
  }
  return null;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const problem = encryptionKeyProblem(keyB64);
  if (problem) throw new Error(problem);
  return await crypto.subtle.importKey('raw', b64ToBytes(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyB64), new TextEncoder().encode(plain)));
  return `${VERSION}.${bytesToB64(iv)}.${bytesToB64(sealed)}`;
}

// Throws if the key is wrong or the stored value was altered.
export async function decryptSecret(stored: string, keyB64: string): Promise<string> {
  const [version, iv, sealed] = stored.split('.');
  if (version !== VERSION || !iv || !sealed) throw new Error('Unreadable stored secret.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, await importKey(keyB64), b64ToBytes(sealed));
  return new TextDecoder().decode(plain);
}

// For the page: a hint of which key is saved, never the key.
export function last4(secret: string): string {
  return secret.length >= 8 ? secret.slice(-4) : '';
}
