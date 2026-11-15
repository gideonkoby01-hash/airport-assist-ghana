import { HttpError } from './http.ts';

// Scheduled functions are called by the database scheduler with a shared secret, not by a signed-in user.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

export async function requireCronSecret(req: Request): Promise<void> {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) throw new Error('CRON_SECRET is not configured');
  if (!(await sameSecret(req.headers.get('x-cron-secret') ?? '', expected))) throw new HttpError(401, 'Unauthorized');
}
