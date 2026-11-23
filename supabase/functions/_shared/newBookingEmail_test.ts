// Run: deno test --allow-all supabase/functions/_shared/newBookingEmail_test.ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { emailStaffAboutBooking, newBookingEmailVariables, whoCan } from './notify.ts';
import { renderTemplate } from './email.ts';

// A stand-in for the database: which people may do which tasks.
function db(allowed: Record<string, string[]>) {
  return { rpc: (_n: string, a: Record<string, unknown>) => Promise.resolve({ data: (allowed[String(a.p_user)] || []).includes(String(a.p_key)) }) };
}

Deno.test('only people whose role may assign supervisors are emailed, and an admin always is', async () => {
  const people = [
    { id: 'gm', email: 'gm@x.com', role: 'management' },
    { id: 'ops', email: 'ops@x.com', role: 'management' },
    { id: 'care', email: 'care@x.com', role: 'management' },
    { id: 'ada', email: 'ada@x.com', role: 'admin' },
  ];
  const d = db({ gm: ['supervisors.assign'], ops: ['supervisors.assign', 'customers.manage'], care: ['customers.manage'] });
  assertEquals((await whoCan(d, people, 'supervisors.assign')).map((p) => p.id), ['gm', 'ops', 'ada']);
});

Deno.test('someone with no email address is skipped', async () => {
  const d = db({ a: ['supervisors.assign'] });
  assertEquals(await whoCan(d, [{ id: 'a', email: '', role: 'management' }], 'supervisors.assign'), []);
});

const booking = {
  id: 'b1', reference: 'AAG-1001', package_name: 'Full Arrival Assist', airline: 'Kenya Airways', flight_number: 'KQ 510',
  flight_date: '2026-12-02', scheduled_flight_time: '14:30', num_passengers: 2, total_bags: 3, contact: '0241111111', passengers: [{ name: 'Ama Mensah' }],
};

Deno.test('the email carries the facts a manager needs and a link to the booking', () => {
  const v = newBookingEmailVariables(booking, 'https://example.com');
  assertEquals(v.reference, 'AAG-1001');
  assertEquals(v.passenger_name, 'Ama Mensah');
  assertEquals(v.flight_line, 'Kenya Airways KQ 510');
  assertEquals(v.travel_line, '2026-12-02 · 14:30');
  assertEquals(v.passengers_line, '2 passengers · 3 bag(s)');
  assertEquals(v.cta_url, 'https://example.com/bookings/b1');
});

Deno.test('missing details read sensibly', () => {
  const v = newBookingEmailVariables({ id: 'b2', reference: 'AAG-2', num_passengers: 1, contact: '0240000000' }, 'https://example.com');
  assertEquals(v.passenger_name, '0240000000');
  assertEquals(v.flight_line, 'To be confirmed');
  assertEquals(v.travel_line, 'To be confirmed');
  assertEquals(v.passengers_line, '1 passenger');
  assertEquals(v.service, '—');
});

Deno.test('the template fills in every detail', () => {
  const { subject, html } = renderTemplate('ManagementNewBooking', newBookingEmailVariables(booking, 'https://example.com'));
  assertEquals(subject, 'New website booking AAG-1001');
  for (const text of ['Ama Mensah', 'Full Arrival Assist', 'Kenya Airways KQ 510', '2026-12-02 · 14:30', '2 passengers', 'https://example.com/bookings/b1', 'Assign a supervisor']) assertStringIncludes(html, text);
  assertEquals(html.includes('{{'), false, 'no placeholder is left unfilled');
});

// A stand-in database: the staff profiles (only enabled ones come back, as the real query asks) and who may do what.
function fakeAdmin(profiles: Array<{ id: string; email: string; role: string; disabled: boolean }>, allowed: Record<string, string[]>) {
  return {
    from: () => ({ select: () => ({ in: () => ({ eq: (_c: string, v: boolean) => Promise.resolve({ data: profiles.filter((p) => p.disabled === v).map(({ id, email, role }) => ({ id, email, role })) }) }) }) }),
    rpc: (_n: string, a: Record<string, unknown>) => Promise.resolve({ data: (allowed[String(a.p_user)] || []).includes(String(a.p_key)) }),
  // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test('a website booking is emailed once to each person who can assign, never to a disabled account', async () => {
  const sent: Array<{ to: string; eventKey: string; template: string }> = [];
  // deno-lint-ignore no-explicit-any
  const send = (_a: any, o: any) => { sent.push({ to: o.to, eventKey: o.eventKey, template: o.templateName }); return Promise.resolve({ ok: true }); };
  const admin = fakeAdmin(
    [{ id: 'gm', email: 'gm@x.com', role: 'management', disabled: false }, { id: 'old', email: 'old@x.com', role: 'management', disabled: true }, { id: 'care', email: 'care@x.com', role: 'management', disabled: false }, { id: 'ada', email: 'ada@x.com', role: 'admin', disabled: false }],
    { gm: ['supervisors.assign'], old: ['supervisors.assign'], care: ['customers.manage'] },
  );
  // deno-lint-ignore no-explicit-any
  const count = await emailStaffAboutBooking(admin, { ...booking, booking_channel: 'online' }, send as any);
  assertEquals(count, 2);
  assertEquals(sent.map((s) => s.to), ['gm@x.com', 'ada@x.com']);
  assertEquals(sent[0].template, 'ManagementNewBooking');
  assertEquals(sent[0].eventKey, 'new_booking_staff:b1:gm', 'one email per booking per person, so a retry never doubles it');
});

Deno.test('a desk sale by a supervisor is not emailed', async () => {
  let called = 0;
  // deno-lint-ignore no-explicit-any
  const send = () => { called++; return Promise.resolve({ ok: true }); };
  const admin = fakeAdmin([{ id: 'ada', email: 'ada@x.com', role: 'admin', disabled: false }], {});
  // deno-lint-ignore no-explicit-any
  assertEquals(await emailStaffAboutBooking(admin, { ...booking, booking_channel: 'walk_in' }, send as any), 0);
  assertEquals(called, 0);
});

Deno.test('a problem finding recipients never breaks the booking', async () => {
  const broken = { from: () => { throw new Error('database down'); }, rpc: () => Promise.resolve({ data: false }) };
  // deno-lint-ignore no-explicit-any
  assertEquals(await emailStaffAboutBooking(broken as any, { ...booking, booking_channel: 'online' }), 0);
});
