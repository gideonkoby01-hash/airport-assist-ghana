import test from 'node:test';
import assert from 'node:assert/strict';
import { payPath, RESULT_COPY, readPayLink, returnReference, VERIFY_POLL } from './payments.js';

test('the return reference is read from what Paystack adds to the address', () => {
  assert.equal(returnReference('?trxref=aag-ab12-0123456789abcdef&reference=aag-ab12-0123456789abcdef'), 'aag-ab12-0123456789abcdef');
  assert.equal(returnReference('?reference=aag-x-0123456789abcdef'), 'aag-x-0123456789abcdef');
  assert.equal(returnReference('?trxref=aag-x-0123456789abcdef'), 'aag-x-0123456789abcdef');
});

test('a missing or odd-looking reference is refused', () => {
  assert.equal(returnReference(''), '');
  assert.equal(returnReference('?reference=short'), '');
  assert.equal(returnReference('?reference=<script>alert(1)</script>'), '');
  assert.equal(returnReference('?reference=' + 'a'.repeat(101)), '');
});

test('the pay link round-trips the booking id and reference', () => {
  const booking = { id: '123e4567-e89b-12d3-a456-426614174000', reference: 'AAG 1/2' };
  const path = payPath(booking);
  assert.equal(path, '/pay?booking=123e4567-e89b-12d3-a456-426614174000&ref=AAG%201%2F2');
  assert.deepEqual(readPayLink(path.slice(path.indexOf('?'))), { bookingId: booking.id, reference: 'AAG 1/2' });
});

test('an incomplete pay link is not accepted', () => {
  assert.equal(readPayLink(''), null);
  assert.equal(readPayLink('?booking=nope&ref=AAG-1'), null);
  assert.equal(readPayLink('?booking=123e4567-e89b-12d3-a456-426614174000'), null);
});

test('every outcome has plain wording, and the pending wait is bounded', () => {
  for (const key of ['paid', 'review', 'failed', 'pending']) {
    assert.ok(RESULT_COPY[key].title && RESULT_COPY[key].body, key);
  }
  assert.match(RESULT_COPY.review.body, /do not pay again/i);
  assert.ok(VERIFY_POLL.delayMs * VERIFY_POLL.maxChecks <= 60000);
});

import { payWording } from './payments.js';

test('the wording about paying follows the online payment switch', () => {
  assert.equal(payWording({ paystack_enabled: 'false' }).online, false);
  assert.match(payWording({ paystack_enabled: 'false' }).faq, /No payment is taken online/);
  assert.equal(payWording({ paystack_enabled: 'true' }).online, true);
  assert.match(payWording({ paystack_enabled: 'true' }).faq, /optional/);
  assert.doesNotMatch(payWording({ paystack_enabled: 'true' }).short, /nothing is taken online/i);
  assert.equal(payWording(undefined).online, false);
});
