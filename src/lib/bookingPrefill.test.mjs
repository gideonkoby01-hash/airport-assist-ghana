import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookingPrefill, bookingAddress } from './bookingPrefill.js';

const today = '2026-11-16';
test('a valid quote is read back', () => {
  assert.deepEqual(parseBookingPrefill('?tab=book&package=full_departure&date=2026-12-01&pax=3', today),
    { package_code: 'full_departure', flight_type: 'departure', flight_date: '2026-12-01', passengers: 3 });
});
test('anything invalid is ignored', () => {
  assert.deepEqual(parseBookingPrefill('?package=nope&date=2020-01-01&pax=99', today),
    { package_code: '', flight_type: '', flight_date: '', passengers: 1 });
  assert.equal(parseBookingPrefill('?date=2026-13-45x', today).flight_date, '');
  assert.equal(parseBookingPrefill('?pax=0', today).passengers, 1);
  assert.equal(parseBookingPrefill('?pax=2.5', today).passengers, 1);
});
test('the porter package leaves the direction alone', () => {
  assert.equal(parseBookingPrefill('?package=porter_only', today).flight_type, '');
});
test('the booking address round-trips', () => {
  const a = bookingAddress({ package_code: 'full_arrival', date: '2026-12-01', pax: 2 });
  assert.equal(a, '/book?package=full_arrival&date=2026-12-01&pax=2');
  assert.equal(parseBookingPrefill(a.split('?')[1], today).passengers, 2);
  assert.equal(bookingAddress({ package_code: '', date: '', pax: 1 }), '/book');
});
