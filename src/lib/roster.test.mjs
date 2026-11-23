import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, buildSheet, daysInMonth, groupNames, headMarkOn, isBalanced, morningGroupOn, monthDays, ordinal, personShifts, phasesForFirstMorning, shiftOn,
  printRowMm, sheetCsvRows, sheetCss, sheetHtml, sheetPage,
} from './roster.js';

// November 2026 as the team has it on paper: for each shift, its 30 days.
const NOV = {
  1: 'OOMNOOMNOOMNOOMNOOMNOOMNOOMNOO',
  2: 'NOOMNOOMNOOMNOOMNOOMNOOMNOOMNO',
  3: 'MNOOMNOOMNOOMNOOMNOOMNOOMNOOMN',
  4: 'OMNOOMNOOMNOOMNOOMNOOMNOOMNOOM',
};
// The days "H. SUP" is written, and next to which shift, in the supervisors' sheet.
const HEAD = { 4: [2, 'M'], 5: [2, 'N'], 9: [3, 'M'], 10: [3, 'N'], 14: [4, 'M'], 15: [4, 'N'], 19: [1, 'M'], 20: [1, 'N'], 24: [2, 'M'], 25: [2, 'N'], 29: [3, 'M'], 30: [3, 'N'] };

const supervisors = (members = []) => ({ roster: { kind: 'supervisor', month: '2026-11-01', anchor_date: '2026-11-01', phases: phasesForFirstMorning(3), head_anchor: '2026-11-04' }, members });
const porters = { kind: 'porter', month: '2026-11-01', anchor_date: '2026-11-01', phases: phasesForFirstMorning(3), head_anchor: null };

test('starting with shift three on the morning gives the team\'s November pattern for all four shifts', () => {
  assert.deepEqual(phasesForFirstMorning(3), [2, 1, 0, 3]);
  const { roster } = supervisors();
  for (const g of [1, 2, 3, 4]) {
    const got = monthDays('2026-11-01').map((d) => shiftOn(roster.phases, roster.anchor_date, d.date, g)).join('');
    assert.equal(got, NOV[g], `shift ${g}`);
  }
});

test('every day has exactly one shift on the morning, one on the night and two off', () => {
  const { roster } = supervisors();
  for (const d of monthDays('2026-12-01')) {
    const codes = [1, 2, 3, 4].map((g) => shiftOn(roster.phases, roster.anchor_date, d.date, g)).sort().join('');
    assert.equal(codes, 'MNOO', d.date);
  }
});

test('the head supervisor mark is on the same days and shifts as the sheet', () => {
  const sheet = buildSheet(supervisors().roster, []);
  const found = {};
  for (const r of sheet.rows) for (const c of r.cells) if (c.head) found[r.day] = [c.group, c.code];
  assert.deepEqual(found, HEAD);
});

test('porters have no head supervisor mark', () => {
  const sheet = buildSheet(porters, []);
  assert.equal(sheet.rows.some((r) => r.cells.some((c) => c.head)), false);
});

test('December carries on from November without a gap or a repeat', () => {
  const { roster } = supervisors();
  // Nov 29 and 30 were the third shift's head days, so the next mark is on Dec 4 (five days after Nov 29)
  const dec = buildSheet({ ...roster, month: '2026-12-01' }, []);
  const found = dec.rows.flatMap((r) => r.cells.filter((c) => c.head).map((c) => `${r.day}${c.code}`));
  assert.deepEqual(found, ['4M', '5N', '9M', '10N', '14M', '15N', '19M', '20N', '24M', '25N', '29M', '30N']);
  // Nov 30 (O,N,O,O... ) leads into Dec 1 for shift one: it worked Nov 27 M, 28 N, 29 O, 30 O, so Dec 1 is M
  assert.equal(shiftOn(roster.phases, roster.anchor_date, '2026-12-01', 1), 'M');
});

test('a head mark that starts on the last day of a month finishes on the first of the next', () => {
  const roster = { ...supervisors().roster, head_anchor: '2026-11-30' };
  assert.equal(headMarkOn(roster.head_anchor, '2026-11-30'), 'M');
  assert.equal(headMarkOn(roster.head_anchor, '2026-12-01'), 'N');
  const dec = buildSheet({ ...roster, month: '2026-12-01' }, []);
  assert.equal(dec.rows[0].cells.filter((c) => c.head).length, 1);
});

test('the shaded days are Tuesdays and Wednesdays, as on the paper sheet', () => {
  const shaded = monthDays('2026-11-01').filter((d) => d.shaded).map((d) => d.day);
  assert.deepEqual(shaded, [3, 4, 10, 11, 17, 18, 24, 25]);
  assert.equal(monthDays('2026-11-01')[0].weekdayName, 'Sunday');
});

test('months have the right length, including leap years', () => {
  assert.equal(daysInMonth('2026-11-01'), 30);
  assert.equal(daysInMonth('2026-12-15'), 31);
  assert.equal(daysInMonth('2028-02-01'), 29);
  assert.equal(daysInMonth('2027-02-01'), 28);
  assert.equal(addMonths('2026-12-01'), '2027-01-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st']);
});

test('the morning shift of a day is the one working M', () => {
  const { roster } = supervisors();
  assert.equal(morningGroupOn(roster.phases, roster.anchor_date, '2026-11-01'), 3);
  assert.equal(morningGroupOn(roster.phases, roster.anchor_date, '2026-11-02'), 4);
  assert.equal(morningGroupOn(roster.phases, roster.anchor_date, '2026-11-03'), 1);
});

const people = [
  { person_id: 'a', person_name: 'Doreen', group_no: 1, lead: false },
  { person_id: 'b', person_name: 'Emmanuella', group_no: 1, lead: false },
  { person_id: 'c', person_name: 'Ankrah', group_no: 1, lead: true },
  { person_id: 'd', person_name: 'Mavis', group_no: 2, lead: false },
  { person_id: 'e', person_name: 'Betty', group_no: 2, lead: false },
];

test('a header lists people by name with the marked ones last, ** in front', () => {
  assert.deepEqual(groupNames(people, 1).map((p) => p.label), ['Doreen', 'Emmanuella', '**Ankrah']);
  assert.deepEqual(groupNames(people, 2).map((p) => p.label), ['Betty', 'Mavis']);
  assert.deepEqual(groupNames(people, 4), []);
});

test('one person\'s own shifts follow their shift', () => {
  const { roster } = supervisors(people);
  const mine = personShifts(roster, people, 'a');
  assert.equal(mine.length, 30);
  assert.equal(mine.map((m) => m.code).join(''), NOV[1]);
  assert.equal(personShifts(roster, people, 'nobody'), null);
  const lead = personShifts(roster, people, 'd').filter((m) => m.head).map((m) => m.day);
  assert.deepEqual(lead, [4, 5, 24, 25]);
});

test('balance is within one person', () => {
  assert.equal(isBalanced(people), false);
  assert.equal(isBalanced([{ group_no: 1 }, { group_no: 2 }, { group_no: 3 }, { group_no: 4 }, { group_no: 1 }]), true);
});

test('the sheet reads like the paper one', () => {
  const { roster } = supervisors(people);
  const sheet = buildSheet(roster, people);
  assert.equal(sheet.title, 'SUPERVISORS');
  assert.equal(sheet.monthName, 'NOVEMBER');
  assert.equal(sheet.nextMonthName, 'DECEMBER');
  const html = sheetHtml(sheet);
  for (const text of ['SUPERVISORS', 'NOVEMBER:', '12H SHIFT REPRESENTATION', 'SHIFT ONE', 'Doreen, Emmanuella, **Ankrah', 'SHIFT FOUR', 'Tuesday', 'DECEMBER:', 'H. SUP', '1<sup>st</sup>', '22<sup>nd</sup>']) {
    assert.ok(html.includes(text), text);
  }
  assert.equal((html.match(/class="s"/g) || []).length, 8, 'eight shaded days');
  assert.ok(html.includes('#92d050'), 'supervisors are green');
  assert.ok(sheetHtml(buildSheet(porters, [])).includes('#00b0f0'), 'porters are blue');
  assert.ok(!sheetHtml(buildSheet(porters, [])).includes('H. SUP ·'), 'no head supervisor legend for porters');
});

test('names are escaped so a name cannot break the page', () => {
  const sheet = buildSheet(supervisors().roster, [{ person_id: 'x', person_name: '<img src=x onerror=alert(1)>', group_no: 1, lead: false }]);
  assert.ok(!sheetHtml(sheet).includes('<img'));
  assert.ok(sheetHtml(sheet).includes('&lt;img'));
  assert.ok(sheetPage(sheet).startsWith('<!doctype html>'));
});

test('the CSV has a line for every day', () => {
  const rows = sheetCsvRows(buildSheet(supervisors().roster, []));
  assert.equal(rows.length, 30);
  assert.deepEqual(rows[3], { date: '2026-11-04', day: 'Wednesday', shift_1: 'N', shift_2: 'M (H. SUP)', shift_3: 'O', shift_4: 'O' });
});

test('names keep the order they were put in, with the marked ones last', () => {
  const list = [
    { person_name: 'Zed', group_no: 1, lead: false, position: 1 },
    { person_name: 'Abe', group_no: 1, lead: false, position: 2 },
    { person_name: 'Mid', group_no: 1, lead: true, position: 3 },
    { person_name: 'New', group_no: 1, lead: false, position: 1052 },
    { person_name: 'Unordered', group_no: 1, lead: false },
  ];
  assert.deepEqual(groupNames(list, 1).map((p) => p.label), ['Zed', 'Abe', 'New', 'Unordered', '**Mid']);
});

test('printing keeps the colours and the sheet fits one A4 page', () => {
  assert.ok(sheetCss().includes('print-color-adjust:exact'), 'shading is forced on for printing');
  const sheet = buildSheet({ ...porters, month: '2026-12-01' }, [{ person_name: 'A long name '.repeat(5), group_no: 1, lead: false }]);
  const page = sheetPage(sheet);
  assert.ok(page.includes('@page{size:A4 portrait;margin:0}'), 'no page margin, so the browser prints no date, title or address');
  assert.ok(page.includes('print-color-adjust:exact'));
  assert.ok(!page.includes('class="legend"') || page.includes('.roster .legend{display:none}'), 'no legend on paper, like the paper roster');
  const rowMm = printRowMm(sheet);
  assert.ok(rowMm >= 4.4 && rowMm <= 8.5, `row height ${rowMm}`);
  const sup = buildSheet({ ...supervisors().roster, month: '2026-12-01' }, []);
  assert.ok(printRowMm(sup) < printRowMm(buildSheet({ ...porters, month: '2026-12-01' }, [])), 'a month with two-line H. SUP rows has shorter ordinary rows');
});
