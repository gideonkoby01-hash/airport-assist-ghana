import React, { useEffect, useState } from "react";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, ShieldCheck } from "lucide-react";
import { roleLabel } from "@/lib/packages";
import ConfirmAction from "@/components/ConfirmAction";

const ROLES = ["passenger", "supervisor", "management", "admin"];

function inviteMessage(state, email, role) {
  if (state === "role_applied") return `${email} already has an account. They are now ${roleLabel(role)}.`;
  if (state === "reset_sent") return `${email} is already active. A password reset link was sent to them.`;
  if (state === "invite_resent") return `A new invitation was sent to ${email}.`;
  return `Invitation sent to ${email} as ${roleLabel(role)}. The link lets them choose a password.`;
}

export default function StaffManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

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

  const invite = async () => {
    setErr("");
    setMsg("");
    if (!email.trim()) return setErr("Enter an email address.");
    setInviting(true);
    try {
      // The inviteStaff function emails the invitation and records the role to apply:
      // immediately for someone who already has an account, at signup otherwise.
      const res = await api.functions.invoke("inviteStaff", { email: email.trim(), role });
      if (res?.data?.error) throw new Error(res.data.error);
      setMsg(inviteMessage(res?.data?.state, email.trim(), role));
      setEmail("");
      load();
    } catch (e) {
      setErr(e.message || "Failed to invite user.");
    } finally {
      setInviting(false);
    }
  };

  // Staff who never accepted get a fresh invitation; staff who are active get a password reset link.
  const resendAccess = async (u) => {
    try {
      const res = await api.functions.invoke("inviteStaff", { email: u.email, role: u.role, resend: true });
      if (res?.data?.error) throw new Error(res.data.error);
      setErr("");
      setMsg(inviteMessage(res?.data?.state, u.email, u.role));
    } catch (e) {
      setMsg("");
      setErr(e.message || "Could not send the email.");
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
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-accent" /> Invite Staff Member
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" />
          </div>
          <div className="space-y-1.5 w-full sm:w-48">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="management">Management</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={invite} disabled={inviting}>
            {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Send invite
          </Button>
        </div>
        {msg && <p className="text-sm text-emerald-600 mt-3">{msg}</p>}
        {err && <p className="text-sm text-destructive mt-3">{err}</p>}
        <p className="text-xs text-muted-foreground mt-2">
          Only Admin can create Supervisor and Management accounts. They choose their own password from the emailed link. Public sign-ups always become Passengers.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" /> User Accounts
        </h3>
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
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium">{u.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{u.full_name || "—"}</td>
                    <td className="py-2 pr-4 w-44">
                      <Select value={u.role || "passenger"} onValueChange={(r) => changeRole(u.id, r)}>
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
                      {["supervisor", "management"].includes(u.role) && !u.disabled && (
                        <Button size="sm" variant="ghost" onClick={() => resendAccess(u)}>Resend access email</Button>
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
            {users.length === 0 && <p className="text-sm text-muted-foreground py-4">No users found.</p>}
          </div>
        )}
      </div>
    </div>
  );
}