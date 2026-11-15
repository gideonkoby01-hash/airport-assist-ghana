import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv.js';

test('quotes and escapes cells that need it', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(12.5), '12.5');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test('cells that look like formulas are neutralised', () => {
  for (const bad of ['=SUM(A1)', '+1', '-1+2', '@cmd', '=HYPERLINK("http://evil","x")']) {
    assert.ok(csvCell(bad).replace(/^"/, '').startsWith("'"), bad);
  }
});

test('a table with a header, a byte-order mark and CRLF line ends', () => {
  const csv = toCsv([{ a: 1, b: 'x,y' }, { a: 2, b: 'z' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', value: (r) => r.b.toUpperCase() }]);
  assert.equal(csv, '﻿A,B\r\n1,"X,Y"\r\n2,Z\r\n');
});
