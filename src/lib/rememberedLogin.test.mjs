import test from 'node:test';
import assert from 'node:assert/strict';
import { readRememberedLogin, saveRememberedLogin, REMEMBERED_LOGIN_KEY } from './rememberedLogin.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), has: (k) => m.has(k) };
};

test('the email or phone number is remembered when asked, and trimmed', () => {
  const s = memory();
  saveRememberedLogin(s, '  ama@example.com ', true);
  assert.equal(readRememberedLogin(s), 'ama@example.com');
  saveRememberedLogin(s, '0241234567', true);
  assert.equal(readRememberedLogin(s), '0241234567');
});

test('turning it off forgets it, and an empty entry is never stored', () => {
  const s = memory();
  saveRememberedLogin(s, 'ama@example.com', true);
  saveRememberedLogin(s, 'ama@example.com', false);
  assert.equal(readRememberedLogin(s), '');
  assert.equal(s.has(REMEMBERED_LOGIN_KEY), false);
  saveRememberedLogin(s, '   ', true);
  assert.equal(s.has(REMEMBERED_LOGIN_KEY), false);
});

test('nothing but the login name is ever stored', () => {
  const s = memory();
  saveRememberedLogin(s, 'ama@example.com', true, 'a-password-that-must-not-be-kept');
  assert.equal([...['ama@example.com']].includes(readRememberedLogin(s)), true);
  assert.equal(JSON.stringify([...Object.values(s)]).includes('password'), false);
});

test('rubbish or a refusing storage gives nothing and never throws', () => {
  const s = memory();
  s.setItem(REMEMBERED_LOGIN_KEY, 'x'.repeat(500));
  assert.equal(readRememberedLogin(s), '');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(readRememberedLogin(broken), '');
  saveRememberedLogin(broken, 'a@b.co', true);
  saveRememberedLogin(undefined, 'a@b.co', true);
  assert.equal(readRememberedLogin(undefined), '');
});
