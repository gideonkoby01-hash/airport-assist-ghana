import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTP_PRESETS, smtpHints } from './smtpHelp.js';

test('a sensible combination gets no advice', () => {
  assert.deepEqual(smtpHints({ port: '465', security: 'ssl' }), []);
});

test('mismatched port and security are called out', () => {
  assert.ok(smtpHints({ port: '465', security: 'starttls' }).some((h) => h.includes('SSL/TLS')));
  assert.ok(smtpHints({ port: '587', security: 'ssl' }).some((h) => h.includes('STARTTLS')));
});

test('no encryption and the ports Supabase may block are warned about', () => {
  assert.ok(smtpHints({ port: '25', security: 'none' }).some((h) => h.includes('unprotected')));
  assert.ok(smtpHints({ port: '587', security: 'starttls' }).some((h) => h.includes('blocked')));
  assert.ok(smtpHints({ port: '25', security: 'none' }).some((h) => h.includes('blocked')));
  assert.equal(smtpHints({ port: '465', security: 'ssl' }).some((h) => h.includes('blocked')), false);
});

test('every preset is complete and consistent with its own advice', () => {
  assert.ok(SMTP_PRESETS.length >= 4);
  for (const p of SMTP_PRESETS) {
    assert.match(p.host, /^[a-z0-9.-]+\.[a-z]{2,}$/);
    assert.ok(['ssl', 'starttls'].includes(p.security));
    const mismatches = smtpHints({ port: p.port, security: p.security }).filter((h) => h.includes('normally uses'));
    assert.deepEqual(mismatches, [], p.label);
  }
});
