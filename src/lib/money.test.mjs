import test from 'node:test';
import assert from 'node:assert/strict';
import { formatForPackage, hasUsdPrice } from './money.js';

const arrival = { code: 'full_arrival', price: 700, price_usd: 50 };

test('dollars are the actual dollar price set for the service, not a conversion', () => {
  assert.equal(formatForPackage(700, arrival, 'USD'), '$50.00');
  assert.equal(formatForPackage(2100, arrival, 'USD'), '$150.00'); // 3 passengers
  assert.equal(formatForPackage(630, arrival, 'USD'), '$45.00'); // a 10% discount takes 10% off the dollar price too
  assert.equal(formatForPackage(0, arrival, 'USD'), '$0.00');
});
test('a service with no dollar price, or cedis chosen, shows cedis', () => {
  assert.equal(formatForPackage(700, { price: 700, price_usd: null }, 'USD'), 'GHS 700.00');
  assert.equal(formatForPackage(700, { price: 700 }, 'USD'), 'GHS 700.00');
  assert.equal(formatForPackage(700, arrival, 'GHS'), 'GHS 700.00');
  assert.equal(formatForPackage(700, null, 'USD'), 'GHS 700.00');
});
test('hasUsdPrice', () => {
  assert.equal(hasUsdPrice(arrival), true);
  assert.equal(hasUsdPrice({ price: 700, price_usd: 0 }), false);
  assert.equal(hasUsdPrice(undefined), false);
});
