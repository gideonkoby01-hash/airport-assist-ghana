// "Remember me on this device": the email or phone number the person last signed in with is kept in this browser so it is filled in next
// time. The password is NEVER kept here; saving it is left to the browser's own password manager (see offerToSavePassword), which keeps it
// encrypted and under the person's control. Pure where it can be; tested in rememberedLogin.test.mjs.

export const REMEMBERED_LOGIN_KEY = "aag-last-login";

/** The remembered email or phone number, or "" when nothing is remembered (or the browser will not say). */
export function readRememberedLogin(storage) {
  try {
    const v = String(storage?.getItem(REMEMBERED_LOGIN_KEY) ?? "").trim();
    return v.length > 0 && v.length <= 200 && !/\s{2,}/.test(v) ? v : "";
  } catch {
    return "";
  }
}

/** Remembers `who` when `remember` is on, otherwise forgets whatever was remembered. */
export function saveRememberedLogin(storage, who, remember) {
  try {
    const v = String(who ?? "").trim();
    if (remember && v) storage?.setItem(REMEMBERED_LOGIN_KEY, v.slice(0, 200));
    else storage?.removeItem(REMEMBERED_LOGIN_KEY);
  } catch {
    // remembering is only a convenience
  }
}

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
export const rememberedLogin = () => readRememberedLogin(browserStorage());
export const rememberLogin = (who, remember) => saveRememberedLogin(browserStorage(), who, remember);

/**
 * Asks the browser to offer saving this sign-in in its password manager (Chrome, Edge and other browsers that support it). Browsers that do
 * not have this offer to save on their own when the form is submitted. Never throws and never waits long.
 */
export async function offerToSavePassword(id, password) {
  try {
    const w = /** @type {any} */ (typeof window === "undefined" ? undefined : window);
    if (!w?.PasswordCredential || !navigator.credentials?.store) return;
    await Promise.race([navigator.credentials.store(new w.PasswordCredential({ id, password, name: id })), new Promise((resolve) => setTimeout(resolve, 1500))]);
  } catch {
    // the person can still save it from the browser's own prompt
  }
}
