// Run: deno test supabase/functions/_shared/email_test.ts
import { assertEquals, assertStringIncludes, assertFalse } from 'jsr:@std/assert@1';
import { renderTemplate, sendTransactionalEmail } from './email.ts';

// Minimal stand-in for the Supabase client: records rows and can simulate a duplicate claim.
function fakeAdmin(opts: { duplicate?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const admin = {
    rows, updates,
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        const result = opts.duplicate && row.status === 'queued'
          ? { data: null, error: { code: '23505', message: 'duplicate key' } }
          : (rows.push(row), { data: { id: 'claim-1' }, error: null });
        const thenable = { select: () => ({ single: () => Promise.resolve(result) }), then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) };
        return thenable;
      },
      update: (patch: Record<string, unknown>) => ({ eq: () => { updates.push(patch); return Promise.resolve({ error: null }); } }),
    }),
  };
  return admin;
}

function stubFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(status === 200 ? '{"id":"em_1"}' : '{"message":"bad"}', { status }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

Deno.env.set('RESEND_API_KEY', 're_test');
Deno.env.set('EMAIL_FROM', 'Airport Assist Ghana <noreply@example.com>');
const vars = { first_name: 'Ama', role_label: 'Supervisor', submitted_line: 'now', cta_url: 'https://app.example/login' };

Deno.test('template variables are filled and HTML-escaped', () => {
  const { html, subject } = renderTemplate('StaffRequestReceived', { ...vars, first_name: '<script>x</script>' });
  assertStringIncludes(html, '&lt;script&gt;x&lt;/script&gt;');
  assertFalse(html.includes('<script>x'));
  assertFalse(/\{\{/.test(html));
  assertStringIncludes(subject, 'received');
});

Deno.test('sends through Resend with an idempotency key and marks the claim sent', async () => {
  const f = stubFetch(200); const admin = fakeAdmin();
  try {
    const r = await sendTransactionalEmail(admin as never, { eventKey: 'e1', templateName: 'StaffRequestReceived', to: 'a@b.com', variables: vars });
    assertEquals(r, { status: 'sent', sent: true });
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, 'https://api.resend.com/emails');
    assertEquals((f.calls[0].init.headers as Record<string, string>)['Idempotency-Key'], 'e1');
    assertEquals(admin.updates[0].status, 'sent');
  } finally { f.restore(); }
});

Deno.test('a duplicate event does not send again', async () => {
  const f = stubFetch(200);
  try {
    const r = await sendTransactionalEmail(fakeAdmin({ duplicate: true }) as never, { eventKey: 'e1', templateName: 'StaffRequestReceived', to: 'a@b.com', variables: vars });
    assertEquals(r.status, 'duplicate');
    assertEquals(f.calls.length, 0);
  } finally { f.restore(); }
});

Deno.test('a provider rejection is reported as failed, not thrown', async () => {
  const f = stubFetch(422); const admin = fakeAdmin();
  try {
    const r = await sendTransactionalEmail(admin as never, { eventKey: 'e2', templateName: 'StaffRequestReceived', to: 'a@b.com', variables: vars });
    assertEquals(r.status, 'failed');
    assertEquals(admin.updates[0].status, 'failed');
  } finally { f.restore(); }
});

Deno.test('an invalid recipient is skipped without calling Resend', async () => {
  const f = stubFetch(200); const admin = fakeAdmin();
  try {
    const r = await sendTransactionalEmail(admin as never, { eventKey: 'e3', templateName: 'StaffRequestReceived', to: 'not-an-email', variables: vars });
    assertEquals(r.status, 'skipped');
    assertEquals(f.calls.length, 0);
    assertEquals(admin.rows[0].status, 'skipped');
  } finally { f.restore(); }
});

// ---- retry ---------------------------------------------------------------------------------------------
import { retryDelivery } from './email.ts';

function fakeRetryAdmin(row: Record<string, unknown> | null, opts: { claimed?: boolean; claimError?: { code: string } } = {}) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    updates,
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        const result = patch.status === 'queued'
          ? { data: opts.claimed === false ? [] : [{ id: 'r1' }], error: opts.claimError ?? null }
          : { data: null, error: null };
        const chain: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) };
        chain.eq = () => chain;
        chain.select = () => Promise.resolve(result);
        return chain;
      },
    }),
  };
  return admin;
}
const failedRow = { id: 'r1', event_key: 'e9', template_name: 'StaffRequestReceived', to_email: 'a@b.com', variables: vars, attempts: 1, status: 'failed' };

Deno.test('retry: a failed email is sent again and its recipient is erased once accepted', async () => {
  const f = stubFetch(200); const admin = fakeRetryAdmin(failedRow);
  try {
    const r = await retryDelivery(admin as never, 'r1');
    assertEquals(r?.status, 'sent');
    assertEquals(f.calls.length, 1);
    assertEquals(admin.updates[0].status, 'queued');
    assertEquals(admin.updates[0].attempts, 2);
    const last = admin.updates[admin.updates.length - 1];
    assertEquals([last.status, last.to_email, last.variables, last.provider_id], ['sent', null, null, 'em_1']);
  } finally { f.restore(); }
});

Deno.test('retry: rows that are not failed, or have no recipient, or were claimed by someone else, are left alone', async () => {
  const f = stubFetch(200);
  try {
    assertEquals(await retryDelivery(fakeRetryAdmin({ ...failedRow, status: 'sent' }) as never, 'r1'), null);
    assertEquals(await retryDelivery(fakeRetryAdmin({ ...failedRow, to_email: null }) as never, 'r1'), null);
    assertEquals(await retryDelivery(fakeRetryAdmin(failedRow, { claimed: false }) as never, 'r1'), null);
    assertEquals((await retryDelivery(fakeRetryAdmin(failedRow, { claimError: { code: '23505' } }) as never, 'r1'))?.status, 'duplicate');
    assertEquals(f.calls.length, 0);
  } finally { f.restore(); }
});

Deno.test('retry: a second failure stays failed and keeps the recipient for the next attempt', async () => {
  const f = stubFetch(500); const admin = fakeRetryAdmin(failedRow);
  try {
    assertEquals((await retryDelivery(admin as never, 'r1'))?.status, 'failed');
    const last = admin.updates[admin.updates.length - 1];
    assertEquals(last.status, 'failed');
    assertEquals('to_email' in last, false);
  } finally { f.restore(); }
});
