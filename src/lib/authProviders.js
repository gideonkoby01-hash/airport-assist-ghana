import { useEffect, useState } from "react";

// Which sign-in methods the Supabase project has switched on. Google only works once it is enabled there (with a Google client
// ID and secret), so the button is shown only when it will work instead of failing with "provider is not enabled".
let cached = null;

async function loadProviders() {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    cached = { google: Boolean(data?.external?.google) };
  } catch {
    // Could not check: show the button and let the sign-in itself report any problem.
    cached = { google: true };
  }
  return cached;
}

export function useAuthProviders() {
  const [providers, setProviders] = useState(cached || { google: false });
  useEffect(() => {
    let live = true;
    loadProviders().then((p) => live && setProviders(p));
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

/** A plain message for a failed Google sign-in. */
export function googleErrorMessage(error) {
  const text = String(error?.message || "");
  if (/provider is not enabled|unsupported provider/i.test(text)) return "Google sign-in is not switched on yet. Please sign in with your email and password.";
  return text || "Google sign-in failed. Please try again or use your email and password.";
}
