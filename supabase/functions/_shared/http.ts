// Shared HTTP plumbing for Edge Functions: CORS, JSON replies, request ids, body limits, one error boundary.
import { AsyncLocalStorage } from 'node:async_hooks';

const MAX_BODY_BYTES = 100_000;
const context = new AsyncLocalStorage<{ origin: string; requestId: string }>();

// Browsers from APP_URL (and any ALLOWED_ORIGINS, comma separated, e.g. preview sites) may call the functions.
// With neither set (local development) any origin is allowed.
function allowedOrigins(): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',');
  return [Deno.env.get('APP_URL') ?? '', ...extra].map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
}

export function corsFor(origin: string): Record<string, string> {
  const allowed = allowedOrigins();
  const allow = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status = 200): Response {
  const ctx = context.getStore();
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(ctx?.origin ?? ''), 'Content-Type': 'application/json', ...(ctx ? { 'x-request-id': ctx.requestId } : {}) },
  });
}

// An error whose message is safe to show the caller.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wraps a handler: answers CORS preflight, turns HttpError into its status, and hides everything else behind
// a generic 500 that carries a request id (the detail goes to the function log under that id).
export function handle(name: string, handler: (req: Request) => Promise<Response>) {
  return (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    return context.run({ origin: req.headers.get('origin') ?? '', requestId }, async () => {
      if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req.headers.get('origin') ?? '') });
      try {
        if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
        return await handler(req);
      } catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status);
        console.error(`[${requestId}] ${name} failed:`, error instanceof Error ? error.message : error);
        return json({ error: `Something went wrong. Please try again. (Reference ${requestId})`, request_id: requestId }, 500);
      }
    });
  };
}

export function serve(name: string, handler: (req: Request) => Promise<Response>) {
  Deno.serve(handle(name, handler));
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
