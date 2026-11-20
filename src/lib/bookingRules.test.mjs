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

import { managementView, tallyToday, UNASSIGNED } from './bookingRules.js';

test('management views', () => {
  assert.deepEqual(managementView('all', '2026-11-15').query, {});
  assert.equal(managementView('all', 'x').sort, '-created_date');
  assert.deepEqual(managementView('unassigned', 'x').query, UNASSIGNED);
  assert.equal(managementView('today', '2026-11-15').query.flight_date, '2026-11-15');
  assert.deepEqual(managementView('open', 'x').query.status.$in, ['confirmed', 'assigned', 'in_progress']);
  assert.deepEqual(managementView('closed', 'x').query.status.$in, ['completed', 'cancelled', 'no_show']);
});
test('a management search narrows the view, or stands alone on "all"', () => {
  assert.equal(managementView('all', 'x', 'Kofi').query.$or.length, 4);
  const narrowed = managementView('open', 'x', 'Kofi').query;
  assert.equal(narrowed.$and.length, 2);
  assert.equal(narrowed.$and[0].status.$in.length, 3);
});
test("today's tally counts each progress step", () => {
  const t = tallyToday([{ status: 'confirmed' }, { status: 'assigned' }, { status: 'assigned' }, { status: 'in_progress' }, { status: 'completed' }, { status: 'no_show' }]);
  assert.deepEqual(t, { waiting: 1, assigned: 2, in_progress: 1, completed: 1, other: 1, total: 6 });
});

import { canAssignPorter, waitingForPorter } from './bookingRules.js';

test('porter assignment: management for website bookings, the supervisor for their own walk-ins', () => {
  const online = { booking_channel: 'online', assigned_supervisor_id: 's1', status: 'assigned' };
  const walkIn = { booking_channel: 'walk_in', assigned_supervisor_id: 's1', status: 'confirmed' };
  assert.equal(canAssignPorter({ id: 'm', role: 'management' }, online), true);
  assert.equal(canAssignPorter({ id: 's1', role: 'supervisor' }, online), false);
  assert.equal(canAssignPorter({ id: 's1', role: 'supervisor' }, walkIn), true);
  assert.equal(canAssignPorter({ id: 's2', role: 'supervisor' }, walkIn), false);
  assert.equal(canAssignPorter({ id: 'm', role: 'management' }, { ...walkIn, status: 'cancelled' }), false);
});
test('website bookings waiting for a porter, whatever the service', () => {
  const rows = [
    { booking_channel: 'online', package_code: 'porter_only', status: 'confirmed', porters: [] },
    { booking_channel: 'online', package_code: 'porter_only', status: 'confirmed', porters: [{ porter_name: 'Kojo', passengers_handled: 1 }] },
    { booking_channel: 'online', package_code: 'porter_only', status: 'cancelled', porters: [] },
    { booking_channel: 'online', package_code: 'full_arrival', status: 'assigned', porters: [] },
    { booking_channel: 'walk_in', package_code: 'full_arrival', status: 'confirmed', porters: [] },
  ];
  assert.equal(waitingForPorter(rows).length, 2);
  // One porter handles one passenger: 3 passengers with 1 porter still waits; with 3 porters it does not.
  const three = (n) => ({ booking_channel: 'online', status: 'confirmed', num_passengers: 3, porters: Array.from({ length: n }, () => ({ passengers_handled: 1 })) });
  assert.equal(waitingForPorter([three(1)]).length, 1);
  assert.equal(waitingForPorter([three(3)]).length, 0);
  // A meet and assist may need no porter for some or all passengers.
  assert.equal(waitingForPorter([{ ...three(1), porters_waived: 2 }]).length, 0);
  assert.equal(waitingForPorter([{ ...three(0), porters_waived: 3 }]).length, 0);
  assert.equal(waitingForPorter([{ ...three(1), porters_waived: 1 }]).length, 1);
});
