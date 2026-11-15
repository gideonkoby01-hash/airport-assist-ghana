import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthLink } from './authLink.js';

test('invitation and recovery links are recognised', () => {
  assert.equal(parseAuthLink('#access_token=abc&refresh_token=x&type=invite'), 'invite');
  assert.equal(parseAuthLink('#access_token=abc&type=recovery'), 'recovery');
});
test('an expired or already used link is recognised', () => {
  assert.equal(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), 'expired');
});
test('ordinary visits, Google sign-in returns and other errors are left alone', () => {
  assert.equal(parseAuthLink('', ''), null);
  assert.equal(parseAuthLink('#access_token=abc&refresh_token=x&provider_token=y', ''), null);
  assert.equal(parseAuthLink('#error=server_error&error_code=unexpected_failure'), null);
  assert.equal(parseAuthLink('#type=invite'), null); // no token: nothing to accept
});
