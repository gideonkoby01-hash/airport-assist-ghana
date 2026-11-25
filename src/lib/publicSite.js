// Whether the public website (home, booking, payment, privacy) is open. The super admin can close it (Admin > Settings), and then those pages
// send visitors to the staff sign-in. The last answer is remembered in the browser so a closed website never flashes open while the setting loads.

export const PUBLIC_SITE_CACHE_KEY = "aag-public-site";

/** The remembered answer: "true", "false", or null when nothing is remembered (or the browser will not say). */
export function readCachedPublicSite(storage) {
  try {
    const v = storage?.getItem(PUBLIC_SITE_CACHE_KEY);
    return v === "true" || v === "false" ? v : null;
  } catch {
    return null;
  }
}

export function writeCachedPublicSite(storage, value) {
  try {
    if (value === "true" || value === "false") storage?.setItem(PUBLIC_SITE_CACHE_KEY, value);
  } catch {
    // remembering is only a convenience
  }
}

/**
 * What a public page should do: "show" the page, "redirect" to the staff sign-in, or "wait" (nothing is known yet and nothing is remembered).
 * Once the settings have loaded (or failed to), their answer rules; a failed load leaves the website open.
 */
export function publicSiteDecision({ loaded, value, cached }) {
  if (loaded) return value === "false" ? "redirect" : "show";
  if (cached === "false") return "redirect";
  if (cached === "true") return "show";
  return "wait";
}
