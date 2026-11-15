// Run: deno test supabase/functions/_shared/invitePlan_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { planInvite } from './invitePlan.ts';

const base = { activated: false, role: 'supervisor' as const, resend: false };

Deno.test('no account yet: a new invitation', () => {
  assertEquals(planInvite({ ...base, profile: null }), { action: 'invite_new' });
});
Deno.test('invited but never accepted: resend the invitation, not a password reset', () => {
  assertEquals(planInvite({ ...base, profile: { role: 'supervisor' } }), { action: 'resend_invite', setRole: false });
  assertEquals(planInvite({ ...base, profile: { role: 'supervisor' }, role: 'management' }), { action: 'resend_invite', setRole: true });
});
Deno.test('activated account: password reset only when a resend is asked for', () => {
  assertEquals(planInvite({ ...base, activated: true, resend: true, profile: { role: 'supervisor' } }), { action: 'send_reset', setRole: false });
  assertEquals(planInvite({ ...base, activated: true, profile: { role: 'passenger' } }), { action: 'apply_role' });
});
Deno.test('activated account with the same role and no resend is refused with a hint', () => {
  const plan = planInvite({ ...base, activated: true, profile: { role: 'supervisor' } });
  assertEquals(plan.action, 'refuse');
});
Deno.test('an admin is never relabelled by an invite', () => {
  for (const activated of [true, false]) {
    assertEquals(planInvite({ ...base, activated, resend: true, profile: { role: 'admin' } }).action, 'refuse');
  }
});
