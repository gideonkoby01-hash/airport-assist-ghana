import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_DEFAULTS } from './publicSettings.js';

// The context file is JSX, so its two small helpers are re-stated here from the source text to keep the test free of a JSX build.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./SettingsContext.jsx', import.meta.url), 'utf8');
const pick = (name) => new Function(`${src.slice(src.indexOf(`export function ${name}`)).split('\n}\n')[0].replace('export ', '')}\n}\nreturn ${name};`)();
const addressLines = pick('addressLines');
const phoneNumbers = pick('phoneNumbers');

test('the address splits into street and digital address', () => {
  assert.deepEqual(addressLines('39 Ring Road East, Nyaniba [GL-030-6750]'), ['39 Ring Road East, Nyaniba', 'GL-030-6750']);
  assert.deepEqual(addressLines('Terminal 3, Accra'), ['Terminal 3, Accra']);
  assert.deepEqual(addressLines(''), ['']);
});

test('phone numbers split on slashes', () => {
  assert.deepEqual(phoneNumbers('+233 537 755 063 / +233 246 222 777'), ['+233 537 755 063', '+233 246 222 777']);
  assert.deepEqual(phoneNumbers('0201234567'), ['0201234567']);
  assert.deepEqual(phoneNumbers(''), []);
});

test('the website defaults keep the current contact details', () => {
  assert.equal(PUBLIC_DEFAULTS.contact_phone, '+233 537 755 063 / +233 246 222 777');
  assert.equal(PUBLIC_DEFAULTS.online_bookings_enabled, 'true');
});
