import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptHtml } from './receiptHtml.js';

const booking = { reference: 'AAG-261114-AB12', package_name: 'Full Arrival Assist', num_passengers: 2, airline: 'BA', flight_number: 'BA78', flight_date: '2026-12-01',
  original_total: 1400, discount_amount: 140, total_value: 1260, amount_collected: 1260, outstanding_balance: 0, payment_method: 'cash', status: 'completed' };

test('the receipt shows what was bought, discounted and paid', () => {
  const html = receiptHtml(booking, new Date('2026-11-14T10:00:00Z'));
  for (const text of ['AAG-261114-AB12', 'Full Arrival Assist', 'BA BA78 2026-12-01', 'Price before discount', 'GHS 1,400.00', '-GHS 140.00', 'Paid (Cash)', 'Completed', '14 November 2026']) {
    assert.ok(html.includes(text), `missing: ${text}`);
  }
});

test('no discount rows without a discount, and text is escaped', () => {
  const html = receiptHtml({ ...booking, discount_amount: 0, package_name: '<script>alert(1)</script>' });
  assert.ok(!html.includes('Price before discount'));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});
