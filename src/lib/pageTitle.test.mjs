import test from 'node:test';
import assert from 'node:assert/strict';
import { pageTitle } from './pageTitle.js';

test('page title with the business name', () => {
  assert.equal(pageTitle('Sign in', 'Airport Assist Ghana'), 'Sign in · Airport Assist Ghana');
});
test('no page title: just the business name; empty name falls back', () => {
  assert.equal(pageTitle('', 'Acme'), 'Acme');
  assert.equal(pageTitle('Privacy notice', '  '), 'Privacy notice · Airport Assist Ghana');
});
