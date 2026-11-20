// Run: deno test supabase/functions/_shared/rules_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { canOperateBooking, canViewBooking, bookingOwnerId, bookingEmailAddress } from './bookingAccess.ts';
import { computeDiscount, evaluateDiscount, normalizeCode } from './discounts.ts';

const future = '2999-12-31';
const past = '2000-01-01';
const code = (over: Record<string, unknown> = {}) => ({
  code: 'SAVE', active: true, start_date: past, expiry_date: future, max_uses: 10, redemption_count: 0,
  recipient_type: 'individual', eligible_email: 'ama@example.com', discount_type: 'percentage', discount_value: 10, ...over,
});

Deno.test('codes are case- and space-insensitive', () => assertEquals(normalizeCode('  save   10 '), 'SAVE 10'));

Deno.test('percentage and fixed discounts, fixed never exceeds the total', () => {
  assertEquals(computeDiscount(200, 'percentage', 10), { gross_total: 200, discount_amount: 20, final_total: 180 });
  assertEquals(computeDiscount(50, 'fixed', 80), { gross_total: 50, discount_amount: 50, final_total: 0 });
});

Deno.test('a valid code for the right customer applies', () => {
  const r = evaluateDiscount({ record: code(), userEmail: 'Ama@Example.com', grossTotal: 100, usedByUser: 0 });
  assertEquals(r.ok, true);
});

Deno.test('rejections: wrong customer, expired, not started, inactive, exhausted, per-customer limit', () => {
  const ok = (rec: Record<string, unknown>, email = 'ama@example.com', used = 0) => evaluateDiscount({ record: code(rec), userEmail: email, grossTotal: 100, usedByUser: used }).ok;
  assertEquals(ok({}, 'other@example.com'), false);
  assertEquals(ok({ expiry_date: past }), false);
  assertEquals(ok({ start_date: future }), false);
  assertEquals(ok({ active: false }), false);
  assertEquals(ok({ max_uses: 2, redemption_count: 2 }), false);
  assertEquals(ok({ max_uses_per_customer: 1 }, 'ama@example.com', 1), false);
  assertEquals(evaluateDiscount({ record: null, userEmail: 'a@b.c', grossTotal: 1, usedByUser: 0 }).ok, false);
});

Deno.test('corporate codes accept the approved domain or a listed member only', () => {
  const corp = { recipient_type: 'corporation', recipient_name: 'Acme', eligible_email: '', eligible_domain: 'acme.com', eligible_emails: ['vip@gmail.com'] };
  const ok = (email: string) => evaluateDiscount({ record: code(corp), userEmail: email, grossTotal: 100, usedByUser: 0 }).ok;
  assertEquals(ok('staff@acme.com'), true);
  assertEquals(ok('vip@gmail.com'), true);
  assertEquals(ok('x@evil.com'), false);
});

Deno.test('booking access: admin/management all, supervisor only assigned, passenger only own', () => {
  const booking = { passenger_user_id: 'p1', assigned_supervisor_id: 's1' };
  assertEquals(canOperateBooking({ id: 'a', role: 'admin' }, booking), true);
  assertEquals(canOperateBooking({ id: 'm', role: 'management' }, booking), true);
  assertEquals(canOperateBooking({ id: 's1', role: 'supervisor' }, booking), true);
  assertEquals(canOperateBooking({ id: 's2', role: 'supervisor' }, booking), false);
  assertEquals(canOperateBooking({ id: 'p1', role: 'passenger' }, booking), false);
  assertEquals(canViewBooking({ id: 'p1', role: 'passenger' }, booking), true);
  assertEquals(canViewBooking({ id: 'p2', role: 'passenger' }, booking), false);
  assertEquals(bookingOwnerId({ created_by_id: 'legacy' }), 'legacy');
});

Deno.test('booking emails go to the address given when booking, else the account that made it', () => {
  assertEquals(bookingEmailAddress({ contact_email: ' ama@example.com ' }, 'owner@example.com'), 'ama@example.com');
  assertEquals(bookingEmailAddress({ contact_email: '' }, 'owner@example.com'), 'owner@example.com');
  assertEquals(bookingEmailAddress({ contact_email: null }, null), null);
  assertEquals(bookingEmailAddress(null, undefined), null);
});
