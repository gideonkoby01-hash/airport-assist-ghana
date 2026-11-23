import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, PERMISSION_KEYS, can, legacyPermissions, roleCounts, roleSaveMessage, staffRoleKeyOf, toggled, visibleNav } from "./permissions.js";

test("every task has a label, a group, and a task it needs that exists", () => {
  assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
  for (const p of PERMISSIONS) {
    assert.ok(p.label && p.group && p.help, p.key);
    if (p.requires) assert.ok(PERMISSION_KEYS.includes(p.requires), p.key);
  }
  assert.equal(PERMISSION_KEYS.length, 11, "the same 11 tasks the database knows");
});

test("an admin can do everything, others only what their role has", () => {
  assert.equal(can({ role: "admin" }, "accounts.record"), true);
  assert.equal(can({ role: "management", permissions: ["customers.manage"] }, "customers.manage"), true);
  assert.equal(can({ role: "management", permissions: ["customers.manage"] }, "accounts.view"), false);
  assert.equal(can({ role: "management" }, "customers.manage"), false);
  assert.equal(can(null, "customers.manage"), false);
  assert.equal(can({ role: "supervisor", permissions: [] }, "ratings.view"), false);
});

test("until the roles update is applied, people keep what they could do before", () => {
  assert.deepEqual(legacyPermissions("management"), PERMISSION_KEYS);
  assert.deepEqual(legacyPermissions("accounts"), ["accounts.view", "accounts.record", "analytics.view"]);
  assert.deepEqual(legacyPermissions("supervisor"), []);
});

test("the role someone holds", () => {
  assert.equal(staffRoleKeyOf({ role: "management" }), "general_manager");
  assert.equal(staffRoleKeyOf({ role: "management", staff_role: "operations_manager" }), "operations_manager");
  assert.equal(staffRoleKeyOf({ role: "accounts" }), "accounts_manager");
  assert.equal(staffRoleKeyOf({ role: "supervisor" }), null);
  assert.equal(staffRoleKeyOf({ role: "admin" }), null);
});

test("recording needs looking: turning one on or off keeps the pair consistent", () => {
  assert.deepEqual(toggled([], "accounts.record", true), ["accounts.view", "accounts.record"]);
  assert.deepEqual(toggled(["accounts.view", "accounts.record", "customers.manage"], "accounts.view", false), ["customers.manage"]);
  assert.deepEqual(toggled(["accounts.view", "accounts.record"], "accounts.record", false), ["accounts.view"]);
  assert.deepEqual(toggled(["customers.manage"], "ratings.view", true), ["ratings.view", "customers.manage"]);
});

test("the menu leaves out what a person may not use, and empty headings", () => {
  const nav = [
    { heading: "Operations", items: [{ label: "Summary" }, { label: "Customers", perm: "customers.manage" }] },
    { heading: "Finance", items: [{ label: "Accounts", perm: "accounts.view" }, { label: "Shift reports", perm: "shift_reports.view" }] },
  ];
  const ops = visibleNav(nav, { role: "management", permissions: ["customers.manage", "shift_reports.view"] });
  assert.deepEqual(ops.map((g) => g.items.map((i) => i.label)), [["Summary", "Customers"], ["Shift reports"]]);
  const none = visibleNav(nav, { role: "management", permissions: [] });
  assert.deepEqual(none.map((g) => g.heading), ["Operations"]);
  assert.equal(visibleNav(nav, { role: "admin" }).length, 2);
});

test("roles with their holders counted", () => {
  const roles = [{ key: "general_manager" }, { key: "operations_manager" }, { key: "care" }];
  const people = [{ role: "management" }, { role: "management", staff_role: "operations_manager" }, { role: "management", staff_role: "operations_manager", disabled: true }, { role: "supervisor" }];
  assert.deepEqual(roleCounts(roles, people).map((r) => r.holders), [1, 1, 0]);
});

test("what the database refuses is explained", () => {
  assert.match(roleSaveMessage({ message: "name_taken" }), /already has that name/);
  assert.match(roleSaveMessage({ message: "role_in_use" }), /Someone still holds/);
  assert.match(roleSaveMessage({ message: "system_role" }), /ready-made/);
  assert.match(roleSaveMessage({ message: "new row violates row-level security policy" }), /Only an admin/);
});
