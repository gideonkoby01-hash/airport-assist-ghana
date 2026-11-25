// The porter's signed-in session, kept in this browser (porters are not accounts of the staff sign-in service). The token is signed by
// the backend and checked on every request, so this only remembers it. Pure where it can be; tested in porterSession.test.mjs.

export const PORTER_SESSION_KEY = "aag_porter_session";

/** The saved session if there is one that has not expired, otherwise null. `storage` and `now` are passed in by the tests. */
export function readPorterSession(storage, now = Date.now()) {
  try {
    const s = JSON.parse(storage.getItem(PORTER_SESSION_KEY) || "null");
    if (!s || typeof s.token !== "string" || !s.token) return null;
    if (!Number.isFinite(Date.parse(s.expires_at)) || Date.parse(s.expires_at) <= now) return null;
    return { token: s.token, expires_at: s.expires_at, name: String(s.name || "") };
  } catch {
    return null;
  }
}

export function savePorterSession(storage, { token, expires_at }, name = "") {
  try {
    storage.setItem(PORTER_SESSION_KEY, JSON.stringify({ token, expires_at, name }));
  } catch {
    /* a private window can refuse; the porter just has to sign in again next time */
  }
}

export function clearPorterSession(storage) {
  try {
    storage.removeItem(PORTER_SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
};
export const currentPorterSession = () => readPorterSession(browserStorage());
export const rememberPorterSession = (session, name) => savePorterSession(browserStorage(), session, name);
export const forgetPorterSession = () => clearPorterSession(browserStorage());
