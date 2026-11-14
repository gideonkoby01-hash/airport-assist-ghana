import { supabase } from '@/api/supabaseClient';

// Authenticator-app (TOTP) multi-factor authentication through Supabase Auth.
// Enrolment: enroll() shows a QR code, then confirm() with the first code activates the factor.
// Sign-in: once a factor is verified, every new session must pass verify() to reach aal2.

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function listFactors() {
  const data = unwrap(await supabase.auth.mfa.listFactors());
  return data.totp || []; // verified TOTP factors only
}

export async function enroll() {
  // Clear any half-finished enrolment first, or Supabase refuses a second one with the same name.
  const { data: all } = await supabase.auth.mfa.listFactors();
  for (const f of all?.all || []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const data = unwrap(await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' }));
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// Used for both enrolment confirmation and sign-in: challenge then verify the 6-digit code.
export async function verify(factorId, code) {
  const challenge = unwrap(await supabase.auth.mfa.challenge({ factorId }));
  unwrap(await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: String(code).replace(/\s+/g, '') }));
}

export async function disable(factorId) {
  unwrap(await supabase.auth.mfa.unenroll({ factorId }));
}
