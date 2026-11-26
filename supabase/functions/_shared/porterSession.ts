// A porter's signed-in session: a token the porter dashboard sends with every request. It carries which porter, a version number (so
// resetting the password or switching the login off ends every earlier session at once) and an expiry, and is signed with a key derived
// from SETTINGS_ENCRYPTION_KEY, so it cannot be forged or altered. Porters are not accounts of the sign-in service, so this is the whole
// of their session.

const SESSION_HOURS = 12;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function signingKey(keyB64: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey('raw', unb64url(keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // a separate key for this purpose, so the settings key is never used to sign anything directly
  const derived = new Uint8Array(await crypto.subtle.sign('HMAC', root, new TextEncoder().encode('porter-session-v1')));
  return await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export interface PorterSession { p: string; tv: number; iat: number; exp: number }

export async function signSession(porterId: string, tokenVersion: number, keyB64: string, nowMs = Date.now()): Promise<{ token: string; expires_at: string }> {
  const payload: PorterSession = { p: porterId, tv: tokenVersion, iat: Math.floor(nowMs / 1000), exp: Math.floor(nowMs / 1000) + SESSION_HOURS * 3600 };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(keyB64), new TextEncoder().encode(`v1.${body}`)));
  return { token: `v1.${body}.${b64url(sig)}`, expires_at: new Date(payload.exp * 1000).toISOString() };
}

/** The session inside a token, or null if it was altered, is not ours, or has expired. */
export async function verifySession(token: unknown, keyB64: string, nowMs = Date.now()): Promise<PorterSession | null> {
  const [version, body, sig] = String(token ?? '').split('.');
  if (version !== 'v1' || !body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await signingKey(keyB64), unb64url(sig), new TextEncoder().encode(`v1.${body}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as PorterSession;
    if (typeof payload.p !== 'string' || !Number.isInteger(payload.tv) || !Number.isFinite(payload.exp) || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}
