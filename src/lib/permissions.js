// Roles and tasks. The admin creates roles and chooses which tasks each may perform (Admin > Settings > Roles and tasks). The database
// checks every task; this file is what the screens use to offer only what a person may do. Pure functions, tested in
// permissions.test.mjs.

/** Every task, in the order the admin sees them. `requires` is a task that must come with it. */
export const PERMISSIONS = [
  { key: "accounts.view", group: "Accounts", label: "Look at the Accounts section", help: "The books, statements, banking, receivables and expenses. Read only." },
  { key: "accounts.record", group: "Accounts", label: "Record in the Accounts section", help: "Add expenses and journal entries, move money between accounts, check shift reports, pay supervisor commission, close a month.", requires: "accounts.view" },
  { key: "analytics.view", group: "Money and reports", label: "See revenue figures and dashboard charts", help: "The revenue, collected and outstanding totals and the analytics charts on the Summary." },
  { key: "commissions.view", group: "Money and reports", label: "See the Commissions list", help: "Which supervisor earned what, by day." },
  { key: "shift_reports.view", group: "Money and reports", label: "Read supervisors' shift reports", help: "The end-of-shift reports with their sales and cash counts." },
  { key: "leaderboard.view", group: "Team", label: "See the leaderboard", help: "Supervisors and porters ranked for the dates chosen." },
  { key: "rosters.manage", group: "Team", label: "Make and change shift rosters", help: "Generate the monthly supervisor and porter shifts, move people between shifts and reshuffle them." },
  { key: "ratings.view", group: "Team", label: "Read customer ratings and reviews", help: "What customers said about the service." },
  { key: "supervisors.assign", group: "Operations", label: "Assign supervisors to bookings", help: "Choose who looks after each website booking." },
  { key: "payments.adjust", group: "Operations", label: "Refund, write off and adjust payments", help: "Hand money back or forgive a balance on a booking. Always with a reason." },
  { key: "customers.manage", group: "Operations", label: "Use the Customers area", help: "Customer records, notes, tags and exports." },
  { key: "porter_pay.manage", group: "Operations", label: "Use Porter pay", help: "See each porter's day and record the payout." },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/** What the admin cannot change: Settings, Staff accounts, Service packages, Lounges, Discounts, Email and the porter register. */
export const ADMIN_ONLY_AREAS = ["Settings", "Staff accounts", "Service packages", "Lounges", "Discounts", "Email", "Porters"];

const ACCOUNTS = ["accounts.view", "accounts.record", "analytics.view"];

/** What a person could do before roles existed. Used until the roles update has been applied, so nobody is locked out meanwhile. */
export function legacyPermissions(role) {
  if (role === "admin") return [...PERMISSION_KEYS];
  if (role === "management") return [...PERMISSION_KEYS];
  if (role === "accounts") return [...ACCOUNTS];
  return [];
}

/** Does this person (with a `permissions` list) have the task? */
export function can(person, key) {
  if (!person) return false;
  if (person.role === "admin") return true;
  return Array.isArray(person.permissions) && person.permissions.includes(key);
}

/** The key of the role someone holds: Management without a chosen role is a General manager, Accounts an Accounts manager. */
export function staffRoleKeyOf(profile) {
  if (!profile) return null;
  if (profile.role === "management") return profile.staff_role || "general_manager";
  if (profile.role === "accounts") return profile.staff_role || "accounts_manager";
  return null;
}

/** Change one task in a list and keep it consistent: recording needs looking, so turning view off turns record off too. */
export function toggled(keys, key, on) {
  const set = new Set(keys || []);
  if (on) {
    set.add(key);
    const need = PERMISSIONS.find((p) => p.key === key)?.requires;
    if (need) set.add(need);
  } else {
    set.delete(key);
    for (const p of PERMISSIONS) if (p.requires === key) set.delete(p.key);
  }
  return PERMISSION_KEYS.filter((k) => set.has(k));
}

/** The menu a person sees: items that need a task they do not have are left out, and a heading with nothing under it goes too. */
export function visibleNav(groups, person) {
  return (groups || [])
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(person, i.perm)) }))
    .filter((g) => g.items.length > 0);
}

/** Roles with their holders counted, for the admin's list. A person's role comes from staffRoleKeyOf. */
export function roleCounts(roles, people) {
  const counts = {};
  for (const p of people || []) {
    const k = staffRoleKeyOf(p);
    if (k && !p.disabled) counts[k] = (counts[k] || 0) + 1;
  }
  return (roles || []).map((r) => ({ ...r, holders: counts[r.key] || 0 }));
}

/** Plain words for what the database refuses. */
export function roleSaveMessage(error) {
  const t = String(error?.message || error || "");
  if (/name_taken/.test(t)) return "Another role already has that name.";
  if (/invalid_name/.test(t)) return "Give the role a name of 2 to 60 characters.";
  if (/unknown_permission/.test(t)) return "One of the tasks is not recognised. Refresh the page and try again.";
  if (/system_role/.test(t)) return "The ready-made roles cannot be deleted. Change their tasks instead.";
  if (/role_in_use/.test(t)) return "Someone still holds this role. Give them another role under Staff accounts first.";
  if (/role_not_found/.test(t)) return "That role no longer exists. Refresh the page.";
  if (/user_not_found/.test(t)) return "That person cannot be given a role (an admin, or a disabled account).";
  if (/forbidden|42501|row-level security/i.test(t)) return "Only an admin can do this.";
  return t || "That did not work. Try again.";
}
