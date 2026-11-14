import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STATUSES, acceptsPayments, isClosed, nextStatuses } from './bookingRules.js';

test('every status is covered and only moves to known statuses', () => {
  assert.equal(ALL_STATUSES.length, 6);
  for (const s of ALL_STATUSES) for (const n of nextStatuses(s)) assert.ok(ALL_STATUSES.includes(n), `${s} -> ${n}`);
});

test('the live path: confirmed, assigned, in progress, completed', () => {
  assert.deepEqual(nextStatuses('confirmed'), ['assigned', 'cancelled', 'no_show']);
  assert.ok(nextStatuses('assigned').includes('in_progress'));
  assert.ok(nextStatuses('in_progress').includes('completed'));
});

test('closed bookings go nowhere and take no payments (except completed, for a late balance)', () => {
  for (const s of ['completed', 'cancelled', 'no_show']) { assert.equal(isClosed(s), true); assert.deepEqual(nextStatuses(s), []); }
  assert.equal(acceptsPayments('cancelled'), false);
  assert.equal(acceptsPayments('no_show'), false);
  assert.equal(acceptsPayments('completed'), true);
  assert.equal(acceptsPayments('confirmed'), true);
});

test('nothing can reopen a terminal booking', () => {
  for (const s of ALL_STATUSES) for (const closed of ['completed', 'cancelled', 'no_show']) {
    if (s !== closed) assert.ok(!nextStatuses(closed).includes(s));
  }
});
