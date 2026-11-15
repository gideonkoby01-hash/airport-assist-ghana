import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvents } from './bookingHistory.js';

const t = (m) => `2026-11-14T10:${String(m).padStart(2, '0')}:00Z`;

test('a booking story, oldest first, with who did it', () => {
  const audit = [
    { at: t(1), action: 'INSERT', actor_id: 'p1', actor_role: 'passenger', after: { status: 'confirmed' } },
    { at: t(2), action: 'UPDATE', actor_id: 'm1', actor_role: 'management',
      before: { status: 'confirmed', assigned_supervisor_id: null }, after: { status: 'assigned', assigned_supervisor_id: 's1', assigned_supervisor_name: 'Ama' } },
    { at: t(5), action: 'UPDATE', actor_id: 'a1', actor_role: 'admin',
      before: { status: 'completed' }, after: { status: 'in_progress', status_reason: 'Marked complete by mistake' } },
  ];
  const payments = [
    { created_date: t(3), entry_type: 'payment', amount: 40, method: 'cash', recorded_by_name: 'Ama' },
    { created_date: t(4), entry_type: 'refund', amount: 10, method: 'mobile_money', reason: 'Short service', recorded_by_name: 'Kofi' },
    { created_date: t(6), entry_type: 'write_off', amount: 5, method: null, reason: 'Left without paying', recorded_by_name: 'Kofi' },
  ];
  const events = buildEvents(audit, payments, { m1: 'Mary Manager' });
  assert.deepEqual(events.map((e) => e.text), [
    'Booking created',
    'Status Confirmed to Assigned',
    'Assigned to Ama',
    'Payment GHS 40.00 by Cash',
    'Refunded GHS 10.00 by Mobile Money: Short service',
    'Status Completed to In Progress (reason: Marked complete by mistake)',
    'Wrote off GHS 5.00: Left without paying',
  ]);
  assert.equal(events[1].who, 'Mary Manager');
  assert.equal(events[0].who, 'passenger');
});

test('touch-only updates produce no events', () => {
  const events = buildEvents([{ at: t(1), action: 'UPDATE', before: { status: 'assigned', x: 1 }, after: { status: 'assigned', x: 2 } }], []);
  assert.deepEqual(events, []);
});
