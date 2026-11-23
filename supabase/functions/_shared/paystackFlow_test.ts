// Run: deno test --allow-all supabase/functions/_shared/paystackFlow_test.ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { alertPaymentNeedsReview, REVIEW_REASONS, settleCharge } from './paystackFlow.ts';

// A stand-in database. Each table answers a query with its rows; inserts into notifications are kept so the test can see who was alerted.
function fakeAdmin(opts: { outcome?: Record<string, unknown>; alerted?: string[] } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const tables: Record<string, unknown> = {
    bookings: { reference: 'AAG-1001' },
    profiles: [{ id: 'gm', email: 'gm@x.com', full_name: 'GM', role: 'management' }, { id: 'ada', email: 'ada@x.com', full_name: 'Ada', role: 'admin' }],
    notifications: (opts.alerted ?? []).map((user_id) => ({ user_id })),
  };
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'ilike', 'order', 'limit', 'gte', 'not']) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: tables[table] });
    chain.insert = (row: Record<string, unknown>) => { inserted.push(row); return Promise.resolve({ error: null }); };
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table], error: null });
    return chain;
  };
  return {
    inserted, rpcCalls,
    from: (t: string) => query(t),
    rpc: (name: string, args: Record<string, unknown>) => { rpcCalls.push([name, args]); return Promise.resolve({ data: opts.outcome ?? { status: 'duplicate' }, error: null }); },
  // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test('a payment that cannot be recorded alerts management and admin, naming the reference and the reason', async () => {
  const admin = fakeAdmin();
  await alertPaymentNeedsReview(admin, 'aag-ps-1', { status: 'needs_review', reason: 'overpayment', booking_id: 'b1', amount: 700 });
  assertEquals(admin.inserted.map((r: Record<string, unknown>) => r.user_id), ['gm', 'ada']);
  const first = admin.inserted[0] as Record<string, string>;
  assertEquals(first.title, 'Online payment needs a look');
  for (const text of ['AAG-1001', 'GHS 700.00', 'aag-ps-1', REVIEW_REASONS.overpayment, 'Paystack dashboard']) assertStringIncludes(first.message, text);
});

Deno.test('the same payment never alerts the same person twice', async () => {
  const admin = fakeAdmin({ alerted: ['gm'] });
  await alertPaymentNeedsReview(admin, 'aag-ps-1', { status: 'needs_review', reason: 'booking_closed', booking_id: 'b1', amount: 700 });
  assertEquals(admin.inserted.map((r: Record<string, unknown>) => r.user_id), ['ada']);
});

Deno.test('settling a charge passes it to the database once and does nothing more for a repeat', async () => {
  const admin = fakeAdmin({ outcome: { status: 'duplicate', booking_id: 'b1' } });
  const result = await settleCharge(admin, { reference: 'aag-ps-1', amount: 70000, currency: 'GHS', channel: 'card', fees: 1050, id: 7 });
  assertEquals(result.status, 'duplicate');
  assertEquals(admin.rpcCalls.length, 1);
  assertEquals(admin.rpcCalls[0][0], 'record_online_payment');
  assertEquals(admin.inserted.length, 0);
});

Deno.test('settling a charge that needs review alerts staff and still reports it', async () => {
  const admin = fakeAdmin({ outcome: { status: 'needs_review', reason: 'amount_mismatch', booking_id: 'b1', amount: 500 } });
  const result = await settleCharge(admin, { reference: 'aag-ps-2', amount: 50000, currency: 'GHS', channel: 'card', id: 8 });
  assertEquals(result.status, 'needs_review');
  assertEquals(admin.inserted.length, 2);
});
