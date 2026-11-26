import test from 'node:test';
import assert from 'node:assert/strict';
import { readPorterSession, savePorterSession, clearPorterSession, PORTER_SESSION_KEY } from './porterSession.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const now = Date.parse('2026-11-25T08:00:00Z');

test('a saved session comes back until it expires', () => {
  const s = memory();
  savePorterSession(s, { token: 'v1.a.b', expires_at: '2026-11-25T20:00:00.000Z' }, 'Kofi');
  assert.deepEqual(readPorterSession(s, now), { token: 'v1.a.b', expires_at: '2026-11-25T20:00:00.000Z', name: 'Kofi' });
  assert.equal(readPorterSession(s, Date.parse('2026-11-25T20:00:01Z')), null);
});

test('clearing forgets it', () => {
  const s = memory();
  savePorterSession(s, { token: 't', expires_at: '2026-11-26T00:00:00Z' });
  clearPorterSession(s);
  assert.equal(readPorterSession(s, now), null);
});

test('rubbish or missing data is no session, and a refusing storage never throws', () => {
  const s = memory();
  for (const bad of ['', 'not json', '{}', '{"token":""}', '{"token":"x"}', '{"token":"x","expires_at":"soon"}', 'null', '42']) {
    s.setItem(PORTER_SESSION_KEY, bad);
    assert.equal(readPorterSession(s, now), null, bad);
  }
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(readPorterSession(broken, now), null);
  savePorterSession(broken, { token: 't', expires_at: 'x' });
  clearPorterSession(broken);
});
