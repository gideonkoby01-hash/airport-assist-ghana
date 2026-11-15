import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, shrinkImage } from './imageResize.js';

test('large photos are scaled to 1600 px on the long side, keeping the shape', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
});
test('small photos are never enlarged', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 1600), { width: 1600, height: 1600 });
});
test('anything that is not a supported image is passed through untouched', async () => {
  const pdf = { name: 'x.pdf', type: 'application/pdf', size: 10 };
  assert.equal(await shrinkImage(pdf), pdf);
  assert.equal(await shrinkImage(null), null);
});
