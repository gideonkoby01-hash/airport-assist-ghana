import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBooking, isPhone, isEmail, todayUtc } from './bookingFormRules.js';

const now = Date.UTC(2026, 10, 15, 10, 0); // 15 Nov 2026 10:00
const good = {
  form: { package_code: 'X', flight_number: 'KQ 510', flight_date: '2026-11-16', scheduled_flight_time: '14:30', contact: '+233 24 123 4567', contact_email: 'ama@example.com' },
  passengers: [{ name: 'Ama Mensah' }],
  channel: 'online', consented: true, now,
};

test('a complete booking has no problems', () => {
  assert.deepEqual(validateBooking(good), {});
});
test('each missing field gets its own message', () => {
  const e = validateBooking({ ...good, consented: false, form: { package_code: '', flight_number: ' ', flight_date: '', scheduled_flight_time: '', contact: '' }, passengers: [{ name: '' }, { name: 'B' }] });
  assert.deepEqual(Object.keys(e).sort(), ['consent', 'contact', 'contact_email', 'flight_date', 'flight_number', 'package_code', 'passenger_0_name', 'scheduled_flight_time']);
});
test('online bookings cannot be in the past; desk bookings may be (the server allows up to a day)', () => {
  const past = { ...good.form, flight_date: '2026-11-15', scheduled_flight_time: '08:00' };
  assert.ok(validateBooking({ ...good, form: past }).scheduled_flight_time);
  assert.ok(validateBooking({ ...good, form: { ...past, flight_date: '2026-11-14' } }).flight_date);
  assert.deepEqual(validateBooking({ ...good, channel: 'walk_in', consented: false, form: past }), {});
});
test('phone numbers follow the server rule', () => {
  assert.ok(isPhone('0241234567'));
  assert.ok(isPhone('+233 (24) 123-4567'));
  assert.ok(!isPhone('12345'));
  assert.ok(!isPhone('call me'));
  assert.ok(validateBooking({ ...good, form: { ...good.form, contact: 'abc' } }).contact);
});
test('today is read as a UTC date', () => {
  assert.equal(todayUtc(now), '2026-11-15');
});
test('an online booking needs an email address; a desk booking does not', () => {
  assert.ok(validateBooking({ ...good, form: { ...good.form, contact_email: '' } }).contact_email);
  assert.ok(validateBooking({ ...good, form: { ...good.form, contact_email: 'not an email' } }).contact_email);
  assert.equal(validateBooking({ ...good, channel: 'walk_in', consented: false, form: { ...good.form, contact_email: '' } }).contact_email, undefined);
  // Porter Service Only is confirmed by text, so its email is optional, but a wrong one is still refused
  assert.equal(validateBooking({ ...good, porterService: true, form: { ...good.form, contact_email: '' } }).contact_email, undefined);
  assert.ok(validateBooking({ ...good, porterService: true, form: { ...good.form, contact_email: 'not an email' } }).contact_email);
  assert.ok(isEmail('name@example.com'));
  assert.ok(!isEmail('name@example'));
  assert.ok(!isEmail(''));
});
