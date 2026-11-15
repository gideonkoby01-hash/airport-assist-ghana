// Verifies webhook signatures in the Svix format that Resend uses: the signed text is `${id}.${timestamp}.${body}`,
// signed with HMAC-SHA256 using the base64 secret that follows "whsec_", and sent as space-separated "v1,<base64>" values.

function b64decode(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(atob(text).length));
  for (let i = 0; i < bytes.length; i++) bytes[i] = atob(text).charCodeAt(i);
  return bytes;
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64decode(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return btoa(String.fromCharCode(...mac));
}

export async function verifySvix(
  secret: string, headers: Headers, body: string, opts: { toleranceSeconds?: number; nowMs?: number } = {},
): Promise<boolean> {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!id || !timestamp || !signatures) return false;
  const ageSeconds = Math.abs((opts.nowMs ?? Date.now()) / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > (opts.toleranceSeconds ?? 300)) return false;
  const expected = await sign(secret, id, timestamp, body);
  return signatures.split(' ').some((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && !!value && sameText(value, expected);
  });
}
