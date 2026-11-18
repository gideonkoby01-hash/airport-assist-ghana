import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRLINES, airlineCode, isListedAirline } from './airlines.js';

test('listed airlines have a name and a two-character code, with no duplicates', () => {
  const names = new Set();
  const codes = new Set();
  for (const a of AIRLINES) {
    assert.ok(a.name.length > 2);
    assert.match(a.code, /^[A-Z0-9]{2}$/);
    names.add(a.name);
    codes.add(a.code);
  }
  assert.equal(names.size, AIRLINES.length);
  assert.equal(codes.size, AIRLINES.length);
});
test('the code of a listed airline, and nothing for others', () => {
  assert.equal(airlineCode('Kenya Airways'), 'KQ');
  assert.equal(airlineCode('Some Charter Co'), '');
  assert.equal(isListedAirline('Kenya Airways'), true);
  assert.equal(isListedAirline(''), false);
});
