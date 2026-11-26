import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftsFrom, splitJobs, earningsSummary, dayLabel, longDayLabel, flightLine, addDays } from './porterDashboard.js';

test('days are written the short and long way', () => {
  assert.equal(dayLabel('2026-11-25'), 'Wed 25 Nov');
  assert.equal(longDayLabel('2026-11-25'), 'Wednesday 25 November');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('shifts follow the roster pattern: morning, night, then two days off', () => {
  // group 1 works the morning on the anchor date (phases [0,3,2,1]); see roster.js
  const rosters = [{ month: '2026-11-01', anchor_date: '2026-11-01', phases: [0, 3, 2, 1], group_no: 1 }];
  const s = shiftsFrom(rosters, '2026-11-01', 6);
  assert.deepEqual(s.map((d) => d.code), ['M', 'N', 'O', 'O', 'M', 'N']);
  assert.equal(s[0].name, 'Morning');
  assert.equal(s[2].name, 'Off');
  assert.equal(s[0].weekend, true); // 1 Nov 2026 is a Sunday
});

test('a day in a month with no roster for the porter says so, and the next month is used when there is one', () => {
  const rosters = [{ month: '2026-11-01', anchor_date: '2026-11-01', phases: [0, 3, 2, 1], group_no: 1 }, { month: '2026-12-01', anchor_date: '2026-12-01', phases: [0, 3, 2, 1], group_no: 1 }];
  const s = shiftsFrom(rosters, '2026-11-29', 4);
  assert.deepEqual(s.map((d) => d.date), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  assert.equal(s[2].code, 'M'); // the December pattern starts afresh from its own anchor
  const none = shiftsFrom([], '2026-11-25', 2);
  assert.deepEqual(none.map((d) => [d.code, d.name]), [[null, 'No roster yet'], [null, 'No roster yet']]);
});

test('jobs are split into today, coming up and recent', () => {
  const jobs = [
    { reference: 'C', flight_date: '2026-11-27', scheduled_flight_time: '09:00' },
    { reference: 'A', flight_date: '2026-11-25', scheduled_flight_time: '14:00' },
    { reference: 'B', flight_date: '2026-11-25', scheduled_flight_time: '08:00' },
    { reference: 'Z', flight_date: '2026-11-23', scheduled_flight_time: '08:00' },
    { reference: 'Y', flight_date: '2026-11-24', scheduled_flight_time: '08:00' },
    { reference: 'D', flight_date: '2026-11-26' },
  ];
  const r = splitJobs(jobs, '2026-11-25');
  assert.deepEqual(r.today.map((j) => j.reference), ['B', 'A']);
  assert.deepEqual(r.upcoming.map((j) => j.reference), ['D', 'C']);
  assert.deepEqual(r.recent.map((j) => j.reference), ['Y', 'Z']);
  assert.deepEqual(splitJobs(null, '2026-11-25'), { today: [], upcoming: [], recent: [] });
});

test('earnings: this month, what was paid, and what is still owed', () => {
  const e = [
    { date: '2026-11-20', jobs: 2, passengers: 3, earned: 15, paid: 4 },
    { date: '2026-11-10', jobs: 1, passengers: 1, earned: 5, paid: 5 },
    { date: '2026-10-30', jobs: 1, passengers: 2, earned: 10, paid: 12 }, // paid more than earned: never a negative balance
  ];
  const s = earningsSummary(e, '2026-11-25');
  assert.equal(s.monthEarned, 20);
  assert.equal(s.monthJobs, 3);
  assert.equal(s.monthPassengers, 4);
  assert.equal(s.owed, 11);
  assert.equal(s.paid, 21);
  assert.deepEqual(s.days.map((d) => d.balance), [11, 0, 0]);
  assert.deepEqual(earningsSummary(undefined, '2026-11-25'), { monthEarned: 0, monthJobs: 0, monthPassengers: 0, owed: 0, paid: 0, days: [] });
});

test('the flight line leaves out what is missing', () => {
  assert.equal(flightLine({ flight_type: 'arrival', airline: 'BA', flight_number: '078', scheduled_flight_time: '10:30' }), 'Arrival · BA 078 · 10:30');
  assert.equal(flightLine({ flight_type: 'departure' }), 'Departure');
});
