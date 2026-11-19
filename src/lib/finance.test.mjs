import test from 'node:test';
import assert from 'node:assert/strict';
import { agingTotals, change, receivedByChannel, changeLabel, compact, daysInclusive, profitAndLoss, rangeForPreset, share, shiftDays } from './finance.js';

test('date ranges for each preset', () => {
  assert.deepEqual(rangeForPreset('today', '2026-11-19'), { from: '2026-11-19', to: '2026-11-19' });
  assert.deepEqual(rangeForPreset('7d', '2026-11-19'), { from: '2026-11-13', to: '2026-11-19' });
  assert.deepEqual(rangeForPreset('30d', '2026-11-19'), { from: '2026-10-21', to: '2026-11-19' });
  assert.deepEqual(rangeForPreset('mtd', '2026-11-19'), { from: '2026-11-01', to: '2026-11-19' });
  assert.deepEqual(rangeForPreset('last_month', '2026-11-19'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(rangeForPreset('last_month', '2026-01-05'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(rangeForPreset('ytd', '2026-11-19'), { from: '2026-01-01', to: '2026-11-19' });
});
test('shifting and counting days', () => {
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysInclusive('2026-11-13', '2026-11-19'), 7);
  assert.equal(daysInclusive('2026-11-19', '2026-11-19'), 1);
});
test('change figures', () => {
  assert.equal(change(120, 100), 0.2);
  assert.equal(change(80, 100), -0.2);
  assert.equal(change(0, 0), 0);
  assert.equal(change(50, 0), null);
  assert.equal(changeLabel(0.2), '+20%');
  assert.equal(changeLabel(-0.04), '-4%');
  assert.equal(changeLabel(null), 'new');
  assert.equal(changeLabel(0.001), 'no change');
});
test('short numbers and shares', () => {
  assert.equal(compact(950), '950');
  assert.equal(compact(12900), '12.9K');
  assert.equal(compact(4200000), '4.2M');
  assert.equal(share(1, 4), '25%');
  assert.equal(share(1, 0), '0%');
});
test('profit and loss on a cash basis', () => {
  const pl = profitAndLoss({ collected: 10000, refunds: 500, porter_commission: 1200, supervisor_commission: 300, expenses: 2000, expenses_by_category: [{ category: 'rent', amount: 1500 }, { category: 'transport', amount: 500 }] });
  assert.equal(pl.netIncome, 9500);
  assert.equal(pl.commissions, 1500);
  assert.equal(pl.grossProfit, 8000);
  assert.equal(pl.operating, 2000);
  assert.equal(pl.netProfit, 6000);
  assert.ok(Math.abs(pl.margin - 6000 / 9500) < 1e-9);
  assert.equal(pl.expenseLines.length, 2);
  assert.equal(profitAndLoss({}).netProfit, 0);
  assert.equal(profitAndLoss({}).margin, null);
});
test('aged receivables totals', () => {
  const t = agingTotals([{ bucket: '0-7', outstanding_balance: 100 }, { bucket: '0-7', outstanding_balance: 50 }, { bucket: '60+', outstanding_balance: 700 }]);
  assert.equal(t.count, 3);
  assert.equal(t.amount, 850);
  assert.deepEqual(t.totals['0-7'], { count: 2, amount: 150 });
  assert.deepEqual(t.totals['31-60'], { count: 0, amount: 0 });
});

test('money received by cash, POS (mobile money plus card) and on account', () => {
  const r = receivedByChannel([{ method: 'cash', net: 1300 }, { method: 'mobile_money', net: 300 }, { method: 'card', net: 200 }, { method: 'corporate_account', net: 50 }]);
  assert.deepEqual(r, { cash: 1300, pos: 500, mobile: 300, card: 200, account: 50, total: 1850 });
  assert.deepEqual(receivedByChannel([]), { cash: 0, pos: 0, mobile: 0, card: 0, account: 0, total: 0 });
  assert.equal(receivedByChannel([{ method: 'cash', net: '25.5' }]).cash, 25.5);
});
