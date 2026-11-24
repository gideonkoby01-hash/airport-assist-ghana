import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLoginRows, loginsPage, loginsText, nameOnlyPeople } from './rosterLogins.js';

test('only supervisors added by name are listed for a login', () => {
  const members = [{ person_id: 'name:doreen', person_name: 'Doreen' }, { person_id: 'a1b2', person_name: 'Mavis' }];
  assert.deepEqual(nameOnlyPeople(members).map((m) => m.person_name), ['Doreen']);
  assert.deepEqual(nameOnlyPeople(undefined), []);
});

test('rows with no email are left for later and are not an error', () => {
  const r = checkLoginRows([{ id: 'a', name: 'Doreen', email: '' }, { id: 'b', name: 'Mavis', email: '  ' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ready, []);
});

test('a name and a real-looking email are needed, and emails are tidied', () => {
  const r = checkLoginRows([
    { id: 'a', name: '  Doreen   Mensah ', email: ' Doreen@Example.COM ' },
    { id: 'b', name: 'M', email: 'mavis@example.com' },
    { id: 'c', name: 'Betty', email: 'not-an-email' },
  ]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.ready, [{ id: 'a', name: 'Doreen Mensah', email: 'doreen@example.com' }]);
  assert.equal(r.errors.b, "Type the person's name.");
  assert.match(r.errors.c, /email address/);
});

test('the same email cannot be given to two people', () => {
  const r = checkLoginRows([{ id: 'a', name: 'Doreen', email: 'x@example.com' }, { id: 'b', name: 'Mavis', email: 'X@example.com' }]);
  assert.equal(r.ok, false);
  assert.match(r.errors.b, /already used/);
  assert.equal(r.ready.length, 1);
});

test('the passwords are written out once per person, and names cannot break the printed page', () => {
  const results = [{ name: 'Doreen', email: 'd@x.com', password: 'Abc-123' }, { name: 'Failed', email: 'f@x.com', error: 'taken' }, { name: '<b>x</b>', email: 'b@x.com', password: 'P<1>' }];
  assert.equal(loginsText(results), 'Doreen | d@x.com | Abc-123\n<b>x</b> | b@x.com | P<1>');
  const page = loginsPage(results, 'https://site.example');
  assert.ok(page.includes('Abc-123') && page.includes('https://site.example'));
  assert.ok(!page.includes('<b>x</b>') && page.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.equal((page.match(/class="slip"/g) || []).length, 2, 'no slip for the one that failed');
});
