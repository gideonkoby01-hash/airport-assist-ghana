import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, followUpState, customerLabel } from './crm.js';

test('tags are tidied, lower-cased, de-duplicated and capped', () => {
  assert.deepEqual(parseTags(' VIP, corporate ,vip,, Travel   Agent '), ['vip', 'corporate', 'travel agent']);
  assert.deepEqual(parseTags(''), []);
  assert.equal(parseTags(Array.from({ length: 20 }, (_, i) => 't' + i).join(',')).length, 12);
});
test('follow-up states', () => {
  assert.equal(followUpState({ follow_up_on: '2026-11-10', done: false }, '2026-11-15'), 'overdue');
  assert.equal(followUpState({ follow_up_on: '2026-11-15', done: false }, '2026-11-15'), 'today');
  assert.equal(followUpState({ follow_up_on: '2026-11-20', done: false }, '2026-11-15'), 'later');
  assert.equal(followUpState({ follow_up_on: '2026-11-10', done: true }, '2026-11-15'), 'none');
  assert.equal(followUpState({ follow_up_on: null, done: false }, '2026-11-15'), 'none');
});
test('a customer with no name is still labelled', () => {
  assert.equal(customerLabel({ full_name: ' ', phone: '024 111 2222' }), '024 111 2222');
  assert.equal(customerLabel({}), 'Unnamed customer');
});
