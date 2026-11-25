import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, signInCredentials } from './loginIdentifier.js';

test('Ghana numbers in the usual ways all become the same number', () => {
  for (const t of ['0241234567', '024 123 4567', '024-123-4567', '(024) 123 4567', '233241234567', '+233241234567', '+233 24 123 4567', '00233241234567', '241234567']) {
    assert.equal(normalizePhone(t), '+233241234567', t);
  }
});

test('another country\'s number keeps its own code', () => {
  assert.equal(normalizePhone('+447911123456'), '+447911123456');
});

test('an email address or other text is not a phone number', () => {
  for (const t of ['', '   ', 'ama@example.com', 'ama', '12345', '0241234567x', 'abc123456789', null, undefined]) assert.equal(normalizePhone(t), null, String(t));
});

test('sign-in uses the phone for a number and the email for anything else', () => {
  assert.deepEqual(signInCredentials(' 0241234567 ', 'pw'), { phone: '+233241234567', password: 'pw' });
  assert.deepEqual(signInCredentials(' Ama@Example.com ', 'pw'), { email: 'Ama@Example.com', password: 'pw' });
});
