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

import { supervisorView, isOverdue } from './bookingRules.js';

test('supervisor views ask for the right bookings in working order', () => {
  const open = supervisorView('active', 'u1', '2026-11-15');
  assert.deepEqual(open.query.status.$in, ['confirmed', 'assigned', 'in_progress']);
  assert.equal(open.sort, 'flight_date,scheduled_flight_time');
  const today = supervisorView('today', 'u1', '2026-11-15');
  assert.equal(today.query.flight_date, '2026-11-15');
  assert.equal(today.sort, 'scheduled_flight_time');
  assert.deepEqual(supervisorView('closed', 'u1', '2026-11-15').query.status.$in, ['completed', 'cancelled', 'no_show']);
  assert.deepEqual(supervisorView('all', 'u1', 'x').query, { assigned_supervisor_id: 'u1' });
});
test('a search keeps the supervisor scope and looks in reference, flight and contact', () => {
  const { query } = supervisorView('active', 'u1', '2026-11-15', ' KQ ');
  assert.equal(query.$and[0].assigned_supervisor_id, 'u1');
  assert.deepEqual(query.$and[1].$or.map((c) => Object.keys(c)[0]), ['reference', 'flight_number', 'contact']);
});
test('overdue means live and the flight date has passed', () => {
  assert.equal(isOverdue({ status: 'assigned', flight_date: '2026-11-14' }, '2026-11-15'), true);
  assert.equal(isOverdue({ status: 'assigned', flight_date: '2026-11-15' }, '2026-11-15'), false);
  assert.equal(isOverdue({ status: 'completed', flight_date: '2026-11-01' }, '2026-11-15'), false);
});
