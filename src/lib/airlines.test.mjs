import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRLINES, airlineCode, isListedAirline } from './airlines.js';

test('listed airlines have a name, and a two-character code where one is known, with no duplicates', () => {
  const names = new Set();
  const codes = new Set();
  for (const a of AIRLINES) {
    assert.ok(a.name.length > 2);
    if (a.code) {
      assert.match(a.code, /^[A-Z0-9]{2}$/);
      assert.ok(!codes.has(a.code), `duplicate code ${a.code}`);
      codes.add(a.code);
    }
    names.add(a.name);
  }
  assert.equal(names.size, AIRLINES.length);
  assert.equal(AIRLINES.length, 28);
});
test('the code of a listed airline, and nothing for others', () => {
  assert.equal(airlineCode('Kenya Airways'), 'KQ');
  assert.equal(airlineCode('Some Charter Co'), '');
  assert.equal(airlineCode('Passion Air'), ''); // listed, but no flight code to start the number with
  assert.equal(isListedAirline('Anisec'), false);
  assert.equal(isListedAirline('Business Aviation Asia'), false);
  assert.equal(isListedAirline('Kenya Airways'), true);
  assert.equal(isListedAirline(''), false);
});
