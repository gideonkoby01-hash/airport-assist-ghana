import React, { useEffect, useState } from "react";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { roleLabel } from "@/lib/packages";
import ConfirmAction from "@/components/ConfirmAction";
import StaffCreate from "@/components/StaffCreate";

// Passengers do not have accounts any more, so "Passenger" is not a role to choose.
const ROLES = ["supervisor", "management", "accounts", "admin"];

export default function StaffManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [reset, setReset] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const items = await api.entities.User.filter({});
      setUsers((items || []).sort((a, b) => (a.email || "").localeCompare(b.email || "")));
    } catch (e) {
      setErr(e.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // A new temporary password for a staff member who forgot theirs. Shown once; they must replace it when they sign in.
  // Accounts from before passengers stopped signing in: listed apart, with nothing to do but remove their personal data.
  const isOldPassenger = (u) => !u.role || u.role === "passenger" || u.role === "user";
  const staffUsers = users.filter((u) => !isOldPassenger(u));
  const oldPassengers = users.filter(isOldPassenger);

  const resetPassword = async (u) => {
    try {
      const res = await api.functions.invoke("resetStaffPassword", { user_id: u.id });
      if (res?.data?.error) throw new Error(res.data.error);
      setReset(res.data);
      setCopied(false);
    } catch (e) {
      notifyError(e.response?.data?.error || e.message || "Could not reset that password.");
    }
  };

  const copyReset = async () => {
    try {
      await navigator.clipboard.writeText(reset.temporary_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the password is on screen to read out or copy by hand.
    }
  };

  const changeRole = async (id, newRole) => {
    try {
      await api.entities.User.update(id, { role: newRole });
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    } catch (e) {
      notifyError(/last_admin/.test(e.message || "")
        ? "That is the only active admin. Make someone else an admin first."
        : e.message || "Failed to update role.");
      load();
    }
  };

  // Turn a person's access off (someone who left) or back on. History is kept.
  const setDisabled = async (u, disabled) => {
    try {
      await api.functions.invoke("disableUser", { user_id: u.id, disabled });
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, disabled } : x)));
    } catch (e) {
      notifyError(e.message || "Could not change that account.");
    }
  };

  // Honour a request to delete a person's data. Cannot be undone.
  const eraseData = async (u) => {
    try {
      await api.functions.invoke("anonymiseUser", { user_id: u.id, confirm: true });
      setUsers((us) => us.filter((x) => x.id !== u.id));
    } catch (e) {
      notifyError(e.message || "Could not delete that person's data.");
    }
  };

  return (
    <div className="space-y-5">
      <StaffCreate onCreated={load} />

      {reset && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <p className="text-sm font-medium text-emerald-900">New temporary password for {reset.full_name || reset.email}.</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <code className="font-mono text-base tracking-wide bg-white border border-emerald-200 rounded px-2 py-1 select-all">{reset.temporary_password}</code>
            <Button type="button" size="sm" variant="outline" onClick={copyReset}>
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-emerald-900/80 mt-2">
            Shown only once. Give it to them in person or by phone. They sign in with {reset.email} and must choose their own password straight away.
          </p>
          <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => setReset(null)}>Done</Button>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" /> User Accounts
        </h3>
        {err && <p role="alert" className="text-sm text-destructive mb-3">{err}</p>}
        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-6">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading users…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2">Access</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium">{u.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{u.full_name || "—"}</td>
                    <td className="py-2 pr-4 w-44">
                      <Select value={u.role} onValueChange={(r) => changeRole(u.id, r)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {["supervisor", "management", "accounts"].includes(u.role) && !u.disabled && (
                        <ConfirmAction
                          title={`Reset the password for ${u.email}?`}
                          description="Their current password stops working and a new temporary one is shown to you once. They must choose their own at next sign-in."
                          confirmLabel="Reset password"
                          onConfirm={() => resetPassword(u)}
                        >
                          <Button size="sm" variant="ghost">Reset password</Button>
                        </ConfirmAction>
                      )}
                      {u.disabled ? (
                        <Button size="sm" variant="outline" onClick={() => setDisabled(u, false)}>Enable</Button>
                      ) : (
                        <ConfirmAction
                          title={`Disable ${u.email}?`}
                          description="They will be signed out and lose access straight away. Their history is kept, and you can enable the account again."
                          confirmLabel="Disable account"
                          destructive
                          onConfirm={() => setDisabled(u, true)}
                        >
                          <Button size="sm" variant="outline">Disable</Button>
                        </ConfirmAction>
                      )}
                      <ConfirmAction
                        title={`Delete the personal data of ${u.email}?`}
                        description="Their name, contact details, ID photos, notifications and login are removed. Payment records stay but no longer name them. This cannot be undone."
                        confirmLabel="Delete personal data"
                        destructive
                        onConfirm={() => eraseData(u)}
                      >
                        <Button size="sm" variant="ghost" className="text-destructive">Erase</Button>
                      </ConfirmAction>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {staffUsers.length === 0 && <p className="text-sm text-muted-foreground py-4">No staff accounts found.</p>}
          </div>
        )}
      </div>

      {oldPassengers.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground">Old passenger accounts ({oldPassengers.length})</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Passengers no longer sign in, so these accounts are not used. Erase them to remove the personal data they hold; their bookings and payment records stay.
          </p>
          <ul className="divide-y divide-border text-sm">
            {oldPassengers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium break-all">{u.email}</span>
                <ConfirmAction
                  title={`Delete the personal data of ${u.email}?`}
                  description="Their name, contact details, ID photos, notifications and login are removed. Payment records stay but no longer name them. This cannot be undone."
                  confirmLabel="Delete personal data"
                  destructive
                  onConfirm={() => eraseData(u)}
                >
                  <Button size="sm" variant="ghost" className="text-destructive">Erase</Button>
                </ConfirmAction>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}