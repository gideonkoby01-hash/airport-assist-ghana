import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, applySort, ApiError } from './filters.js';

// A recording stand-in for the PostgREST builder: every call is logged as [method, ...args].
function fakeBuilder() {
  const calls = [];
  const b = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return b; } });
  return { b, calls };
}
const run = (filter) => { const { b, calls } = fakeBuilder(); applyFilter(b, filter); return calls; };

test('equality and null', () => {
  assert.deepEqual(run({ status: 'paid', note: null }), [['eq', 'status', 'paid'], ['is', 'note', null]]);
});

test('range and $in on one field (BookingFinancials)', () => {
  assert.deepEqual(
    run({ status: { $in: ['completed', 'in_progress'] }, created_date: { $gte: '2026-01-01T00:00:00Z' } }),
    [['in', 'status', ['completed', 'in_progress']], ['gte', 'created_date', '2026-01-01T00:00:00Z']],
  );
});

test('two bounds on one field (ratings date range)', () => {
  assert.deepEqual(run({ submitted_at: { $gte: 'a', $lte: 'b' } }), [['gte', 'submitted_at', 'a'], ['lte', 'submitted_at', 'b']]);
});

test('$and is applied clause by clause', () => {
  assert.deepEqual(run({ $and: [{ overall_rating: 5 }, { package_code: 'full_arrival' }] }),
    [['eq', 'overall_rating', 5], ['eq', 'package_code', 'full_arrival']]);
});

test('$or with $regex becomes a case-insensitive contains match (ratings search)', () => {
  const calls = run({ $or: [{ booking_reference: { $regex: 'AAG', $options: 'i' } }, { passenger_name: { $regex: 'a,b', $options: 'i' } }] });
  assert.deepEqual(calls, [['or', 'booking_reference.ilike."%AAG%",passenger_name.ilike."%a,b%"']]);
});

test('$or mixes plain values and operators, quoting awkward characters', () => {
  const calls = run({ $or: [{ user_id: 'u"1' }, { read: false }, { n: { $gt: 3 } }] });
  assert.deepEqual(calls, [['or', 'user_id.eq."u\\"1",read.eq.false,n.gt.3']]);
});

test('LIKE wildcards in the search text are escaped', () => {
  const calls = run({ $or: [{ a: { $regex: '50%_off' } }] });
  assert.deepEqual(calls, [['or', 'a.ilike."%50\\\\%\\\\_off%"']]);
});

test('unsupported operators fail loudly', () => {
  assert.throws(() => run({ a: { $near: 1 } }), ApiError);
});

test('sort: descending, ascending and multiple fields', () => {
  const { b, calls } = fakeBuilder();
  applySort(b, '-created_date,full_name');
  assert.deepEqual(calls, [['order', 'created_date', { ascending: false }], ['order', 'full_name', { ascending: true }]]);
});
