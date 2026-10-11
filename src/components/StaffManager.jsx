import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, ShieldCheck } from "lucide-react";
import { roleLabel } from "@/lib/packages";

const ROLES = ["passenger", "supervisor", "management", "admin"];

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
      const items = await base44.entities.User.filter({});
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
      // The platform only accepts "user" or "admin" as an invite role, so invite
      // with the closest platform role, then set the app-specific role on the
      // newly created user record.
      const platformRole = role === "admin" ? "admin" : "user";
      const result = await base44.users.inviteUser(email.trim(), platformRole);
      if (role !== platformRole) {
        let targetId = result?.id || result?._id;
        if (!targetId) {
          const items = await base44.entities.User.filter({});
          const target = (items || []).find(
            (u) => (u.email || "").toLowerCase() === email.trim().toLowerCase()
          );
          targetId = target?.id;
        }
        if (targetId) {
          await base44.entities.User.update(targetId, { role });
        }
      }
      setMsg(`Invitation sent to ${email.trim()} as ${roleLabel(role)}.`);
      setEmail("");
      load();
    } catch (e) {
      setErr(e.message || "Failed to invite user.");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id, newRole) => {
    try {
      await base44.entities.User.update(id, { role: newRole });
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    } catch (e) {
      alert(e.message || "Failed to update role.");
      load();
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
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="passenger">Passenger</SelectItem>
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
          Only Admin can create Supervisor and Management accounts. Public sign-ups always become Passengers.
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
                  <th className="py-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium">{u.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{u.full_name || "—"}</td>
                    <td className="py-2 w-44">
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