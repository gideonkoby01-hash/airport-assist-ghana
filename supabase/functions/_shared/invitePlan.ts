// Decides what the staff invite should do. Pure, so the rules are tested without a database or mail server.
export const INVITABLE_ROLES = ['supervisor', 'management'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type InvitePlan =
  | { action: 'invite_new' }                       // no account yet: create it and email an invitation
  | { action: 'resend_invite'; setRole: boolean }  // account exists but the person never accepted: send a fresh invitation
  | { action: 'apply_role' }                       // activated account: just give the role, no email
  | { action: 'send_reset'; setRole: boolean }     // activated account and a resend was asked for: password reset email
  | { action: 'refuse'; reason: string };

export function planInvite(input: {
  profile: { role: string } | null;
  activated: boolean; // the person has accepted an invitation or confirmed their email at least once
  role: InvitableRole;
  resend: boolean;
}): InvitePlan {
  const { profile, activated, role, resend } = input;
  if (!profile) return { action: 'invite_new' };
  // Never re-label an admin through the invite box; admins are managed separately.
  if (profile.role === 'admin') return { action: 'refuse', reason: 'That person is an Admin. Change an admin\'s access from the User Accounts list.' };
  const setRole = profile.role !== role;
  if (!activated) return { action: 'resend_invite', setRole };
  if (resend) return { action: 'send_reset', setRole };
  return setRole ? { action: 'apply_role' } : { action: 'refuse', reason: 'That person already has an active account with this role. Use "Resend access email" in the list if they need a new password link.' };
}
