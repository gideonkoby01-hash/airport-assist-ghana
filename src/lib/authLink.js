// What an emailed Supabase link is for, read from the address it opens. Invitation and password-reset links
// arrive as  /some-page#access_token=...&type=invite  (or type=recovery); an expired or used link arrives as
// #error=access_denied&error_code=otp_expired. All of these must end up on the password page, never the homepage.
export function parseAuthLink(hash = '', search = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const query = new URLSearchParams(String(search).replace(/^\?/, ''));
  const get = (k) => params.get(k) || query.get(k);
  const type = get('type');
  if (type === 'invite' && get('access_token')) return 'invite';
  if (type === 'recovery' && get('access_token')) return 'recovery';
  if (get('error_code') === 'otp_expired') return 'expired';
  return null;
}
