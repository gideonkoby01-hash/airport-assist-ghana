import test from 'node:test';
import assert from 'node:assert/strict';
import { initials } from './profile.js';

test('initials from a name, a single name, or the email', () => {
  assert.equal(initials('Ama Mensah', 'a@x.com'), 'AM');
  assert.equal(initials('  kofi   boateng  asante ', ''), 'KA');
  assert.equal(initials('Esi', ''), 'ES');
  assert.equal(initials('', 'sup@example.com'), 'SU');
  assert.equal(initials(null, null), '?');
});
