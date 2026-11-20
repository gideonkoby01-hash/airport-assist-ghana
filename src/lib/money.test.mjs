import test from 'node:test';
import assert from 'node:assert/strict';
import { ghsToUsd, formatMoney } from './money.js';

test('dollars are the cedi price divided by the rate, rounded up to the cent', () => {
  assert.equal(ghsToUsd(700, 15), 46.67);
  assert.equal(ghsToUsd(150, 15), 10);
  assert.equal(ghsToUsd(0, 15), 0);
});
test('an unusable rate falls back to cedis', () => {
  assert.equal(ghsToUsd(700, 0), null);
  assert.equal(formatMoney(700, 'USD', 'abc'), 'GHS 700.00');
});
test('formatting', () => {
  assert.equal(formatMoney(700, 'GHS', 15), 'GHS 700.00');
  assert.equal(formatMoney(700, 'USD', 15), '$46.67');
  assert.equal(formatMoney(1500, 'USD', 15), '$100.00');
});
