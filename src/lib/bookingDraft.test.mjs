import test from 'node:test';
import assert from 'node:assert/strict';
import { inclusionList, readDraft, saveDraft, clearDraft } from './bookingDraft.js';

test('inclusions become one line per service', () => {
  assert.deepEqual(
    inclusionList('Curbside meet & greet, Check-in assistance, Fast-track escort through immigration and screening, Lounge access.'),
    ['Curbside meet & greet', 'Check-in assistance', 'Fast-track escort through immigration and screening', 'Lounge access'],
  );
  assert.deepEqual(inclusionList(''), []);
  assert.deepEqual(inclusionList(null), []);
});

function fakeSession() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test('a draft is kept, read back, and cleared', () => {
  fakeSession();
  assert.equal(readDraft(), null);
  saveDraft({ form: { package_code: 'full_arrival' }, passengers: [{ name: 'Ama' }], step: 2, consented: false, otherAirline: false });
  const d = readDraft();
  assert.equal(d.form.package_code, 'full_arrival');
  assert.equal(d.step, 2);
  clearDraft();
  assert.equal(readDraft(), null);
});

test('a draft older than a day, or a broken one, is ignored', () => {
  fakeSession();
  saveDraft({ form: { a: 1 }, passengers: [{}], step: 0, consented: false, otherAirline: false }, Date.now() - 25 * 60 * 60 * 1000);
  assert.equal(readDraft(), null);
  sessionStorage.setItem('aag-booking-draft-v1', '{not json');
  assert.equal(readDraft(), null);
});
