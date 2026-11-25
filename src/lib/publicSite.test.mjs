import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_SITE_CACHE_KEY, publicSiteDecision, readCachedPublicSite, writeCachedPublicSite } from './publicSite.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };

test('once the settings are known they decide; a failed load keeps the website open', () => {
  assert.equal(publicSiteDecision({ loaded: true, value: 'false', cached: 'true' }), 'redirect');
  assert.equal(publicSiteDecision({ loaded: true, value: 'true', cached: 'false' }), 'show');
  assert.equal(publicSiteDecision({ loaded: true, value: undefined, cached: null }), 'show');
});

test('before they load, the remembered answer decides, and with none the page waits', () => {
  assert.equal(publicSiteDecision({ loaded: false, value: 'true', cached: 'false' }), 'redirect');
  assert.equal(publicSiteDecision({ loaded: false, value: 'true', cached: 'true' }), 'show');
  assert.equal(publicSiteDecision({ loaded: false, value: 'true', cached: null }), 'wait');
});

test('the remembered answer is only ever true or false, and a blocked browser store is harmless', () => {
  const s = store();
  assert.equal(readCachedPublicSite(s), null);
  writeCachedPublicSite(s, 'false');
  assert.equal(readCachedPublicSite(s), 'false');
  writeCachedPublicSite(s, 'garbage');
  assert.equal(s.m.get(PUBLIC_SITE_CACHE_KEY), 'false', 'nothing odd is stored');
  s.m.set(PUBLIC_SITE_CACHE_KEY, '<script>');
  assert.equal(readCachedPublicSite(s), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readCachedPublicSite(broken), null);
  writeCachedPublicSite(broken, 'true');
  assert.equal(readCachedPublicSite(undefined), null);
});
