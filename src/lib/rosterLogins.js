// Creating logins for the supervisors who are on the roster by name: checking what was typed, and writing out the temporary passwords.
// Pure functions, tested in rosterLogins.test.mjs.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The supervisors on a roster who have no account yet (they were added by name). */
export const nameOnlyPeople = (members) => (members || []).filter((m) => String(m.person_id).startsWith("name:"));

/**
 * `rows` is [{ id, name, email }]. Rows with no email are left for later. Returns the rows ready to be made and a message for each problem:
 * the name needs at least two letters, the email must look like one, and no email may be used twice.
 */
export function checkLoginRows(rows) {
  const errors = {};
  const ready = [];
  const seen = new Map();
  for (const r of rows || []) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!email) continue;
    const name = String(r.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2) errors[r.id] = "Type the person's name.";
    else if (!EMAIL_RE.test(email)) errors[r.id] = "That does not look like an email address.";
    else if (seen.has(email)) errors[r.id] = "This email is already used for another person on this list.";
    else {
      seen.set(email, r.id);
      ready.push({ id: r.id, name, email });
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, ready };
}

/** The results as text to copy, one person a line. */
export function loginsText(results) {
  return (results || []).filter((r) => r.password).map((r) => `${r.name} | ${r.email} | ${r.password}`).join("\n");
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A page to print and cut up, so each supervisor gets their own slip. */
export function loginsPage(results, siteAddress = "") {
  const slips = (results || []).filter((r) => r.password).map((r) => `<div class="slip"><h3>Airport Assist Ghana</h3>
<p><strong>${esc(r.name)}</strong></p><p>Website: ${esc(siteAddress)}</p><p>Email: <strong>${esc(r.email)}</strong></p>
<p>Temporary password: <strong class="pw">${esc(r.password)}</strong></p><p class="small">You choose your own password the first time you sign in.</p></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Supervisor logins</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#0b213c}.slip{display:inline-block;vertical-align:top;width:300px;border:1px dashed #666;padding:10px 14px;margin:6px;box-sizing:border-box}
h3{margin:0 0 6px;font-size:15px}p{margin:4px 0;font-size:13px}.pw{font-family:'Courier New',monospace;font-size:15px}.small{color:#555;font-size:11px}@media print{.no-print{display:none!important}body{margin:0}}</style></head>
<body>${slips}</body></html>`;
}
