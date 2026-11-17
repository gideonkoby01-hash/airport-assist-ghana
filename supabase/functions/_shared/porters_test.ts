// Run: deno test supabase/functions/_shared/porters_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { canChangeExtraPorters, checkPorterShare, extraPorterEntry, porterCommission } from './porters.ts';

Deno.test('a porter can be credited up to the passengers on the booking', () => {
  assertEquals(checkPorterShare([], 3, 3), null);
  assertEquals(checkPorterShare([{ passengers_handled: 1 }], 2, 3), null);
});
Deno.test('crediting more than the booking has is refused, with what is left', () => {
  assertEquals(checkPorterShare([], 4, 3)?.includes('Only 3'), true);
  assertEquals(checkPorterShare([{ passengers_handled: 2 }], 2, 3)?.includes('Only 1 passenger on this booking is'), true);
  assertEquals(checkPorterShare([{ passengers_handled: 3 }], 1, 3)?.includes('already cover all'), true);
});
Deno.test('the number must be a whole number from 1 to 50', () => {
  for (const bad of [0, -1, 1.5, 'x', 51, null]) assertEquals(typeof checkPorterShare([], bad, 100), 'string');
});
Deno.test('commission is the rate times passengers handled', () => {
  assertEquals(porterCommission(30, 3), 90);
  assertEquals(porterCommission(30.5, 2), 61);
});

import { canAssignPorter } from './porters.ts';

Deno.test('website requests: management assigns the porter, a supervisor does not', () => {
  const online = { booking_channel: 'online', assigned_supervisor_id: 's1', status: 'assigned' };
  assertEquals(canAssignPorter({ id: 'm1', role: 'management' }, online), true);
  assertEquals(canAssignPorter({ id: 'a1', role: 'admin' }, online), true);
  assertEquals(canAssignPorter({ id: 's1', role: 'supervisor' }, online), false);
  assertEquals(canAssignPorter({ id: 'p1', role: 'passenger' }, online), false);
});
Deno.test('walk-ins: the supervisor it belongs to assigns the porter, another supervisor does not', () => {
  const walkIn = { booking_channel: 'walk_in', assigned_supervisor_id: 's1', status: 'confirmed' };
  assertEquals(canAssignPorter({ id: 's1', role: 'supervisor' }, walkIn), true);
  assertEquals(canAssignPorter({ id: 's2', role: 'supervisor' }, walkIn), false);
  assertEquals(canAssignPorter({ id: 'm1', role: 'management' }, walkIn), true);
});
Deno.test('nobody changes porters on a cancelled booking', () => {
  const dead = { booking_channel: 'walk_in', assigned_supervisor_id: 's1', status: 'cancelled' };
  assertEquals(canAssignPorter({ id: 'm1', role: 'management' }, dead), false);
  assertEquals(canAssignPorter({ id: 's1', role: 'supervisor' }, dead), false);
});

Deno.test('an extra porter earns a flat commission, carries the fee and is credited with no passengers', () => {
  assertEquals(extraPorterEntry({ id: 'p1', full_name: 'Yaw' }, 30, 100), { porter_id: 'p1', porter_name: 'Yaw', passengers_handled: 0, commission: 30, extra: true, fee: 100 });
});
Deno.test('extra porters can only change on a service that is still open', () => {
  for (const s of ['confirmed', 'assigned', 'in_progress']) assertEquals(canChangeExtraPorters(s), true);
  for (const s of ['completed', 'cancelled', 'no_show']) assertEquals(canChangeExtraPorters(s), false);
});
