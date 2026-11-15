// Runs before the app (and the Supabase client) starts. If an emailed invitation / reset / expired link landed
// anywhere except the password page, for example the homepage, carry it over to /reset-password intact.
import { parseAuthLink } from '@/lib/authLink';

export const AUTH_LINK_KEY = 'aag_auth_link';

try {
  const kind = parseAuthLink(window.location.hash, window.location.search);
  if (kind) {
    sessionStorage.setItem(AUTH_LINK_KEY, kind);
    if (window.location.pathname !== '/reset-password') {
      window.location.replace(`/reset-password${window.location.search}${window.location.hash}`);
    }
  }
} catch {
  // Storage or location unavailable: the normal flow still works when the link opens the right page.
}
