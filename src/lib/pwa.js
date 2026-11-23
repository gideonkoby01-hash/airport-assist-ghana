// The installable app: how to tell where the app is running, what to offer, and how the update flow works. Pure functions are
// tested in pwa.test.mjs; the browser-only parts are at the bottom.

export const DISMISS_DAYS = 30;
const DISMISS_KEY = "aag-install-dismissed";
const DAY = 86400000;

/** "ios", "android" or "other". An iPad that asks for the desktop site still has a touch screen, so touch points tell it apart from a Mac. */
export function platformOf(userAgent = "", maxTouchPoints = 0) {
  const ua = String(userAgent);
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Is the page running as an installed app (from the Home Screen) rather than in a browser tab? */
export function isStandalone({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

/**
 * What to offer: "installed" (nothing), "prompt" (the browser can install it with one tap), "ios" (show the Add to Home Screen
 * steps, because iPhones have no install button) or "none".
 */
export function installMode({ standalone = false, platform = "other", hasPrompt = false } = {}) {
  if (standalone) return "installed";
  if (hasPrompt) return "prompt";
  if (platform === "ios") return "ios";
  return "none";
}

/** Was the offer dismissed recently? `savedAt` is the time it was dismissed (a number, or text of one). */
export function isDismissed(savedAt, now = Date.now(), days = DISMISS_DAYS) {
  const t = Number(savedAt);
  return Number.isFinite(t) && t > 0 && now - t < days * DAY;
}

/** The steps for an iPhone or iPad, in the words the phone uses. */
export const IOS_STEPS = [
  "Tap the Share button (the square with an arrow) at the bottom of Safari.",
  "Scroll down and tap Add to Home Screen.",
  "Tap Add. The Airport Assist icon is now on your Home Screen.",
];

// ---- browser-only parts ----------------------------------------------------------------------------------------------

export function readStandalone() {
  if (typeof window === "undefined") return false;
  return isStandalone({
    displayModeStandalone: Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
    navigatorStandalone: Boolean(/** @type {any} */ (window.navigator).standalone),
  });
}

export function readDismissed() {
  try {
    return isDismissed(localStorage.getItem(DISMISS_KEY));
  } catch {
    return false;
  }
}

export function saveDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // the offer comes back next visit
  }
}

let waiting = null;

/** The update waiting to be applied, if the service worker has found one. */
export function pendingUpdate() {
  return waiting;
}

/** Registers the service worker (production only). A new version is announced with an "aag-update-ready" event; it is applied only when the person taps Refresh. */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      const announce = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg;
          window.dispatchEvent(new CustomEvent("aag-update-ready"));
        }
      };
      announce();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") announce();
        });
      });
      // When the app comes back to the front (a phone left in a pocket for hours), look for a newer version.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}

/** Switches to the waiting version and reloads once it has taken over. */
export function applyUpdate() {
  if (!waiting) return window.location.reload();
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  waiting.waiting?.postMessage("SKIP_WAITING");
  return undefined;
}
