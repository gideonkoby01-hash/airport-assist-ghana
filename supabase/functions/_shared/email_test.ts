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
