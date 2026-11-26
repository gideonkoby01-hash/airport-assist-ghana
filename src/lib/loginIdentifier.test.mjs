import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, whoIsSigningIn } from './loginIdentifier.js';

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

test('a phone number is a porter and anything else is a staff email', () => {
  assert.deepEqual(whoIsSigningIn(' 0241234567 '), { porter: true, phone: '+233241234567' });
  assert.deepEqual(whoIsSigningIn(' Ama@Example.com '), { porter: false, email: 'Ama@Example.com' });
});
