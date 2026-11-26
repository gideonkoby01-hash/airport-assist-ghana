import React, { useEffect, useState } from "react";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2, Pencil, X, Luggage, KeyRound, Copy, Check, Smartphone } from "lucide-react";

const normalizePhone = (p) => (p || "").replace(/[\s\-()]/g, "");

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

export default function PorterManager() {
  const [porters, setPorters] = useState([]);
  const [logins, setLogins] = useState({}); // porter_id -> { phone, disabled, must_change_password, last_login_at }
  const [issued, setIssued] = useState(null); // the temporary password just made, shown once
  const [copied, setCopied] = useState(false);
  const [busyLogin, setBusyLogin] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editErr, setEditErr] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.Porter.filter({}, { sort: "full_name" });
      setPorters(page.items || []);
      const { data } = await api.functions.invoke("managePorterLogin", { action: "list" });
      setLogins(Object.fromEntries((data?.logins || []).map((l) => [l.porter_id, l])));
    } catch (e) {
      setErr(e.message || "Failed to load porters.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setErr("");
    if (!name.trim() || !phone.trim()) {
      setErr("Full name and phone number are required.");
      return;
    }
    setSaving(true);
    try {
      const dup = await api.entities.Porter.filter({
        phone_number: normalizePhone(phone),
        active: true,
      });
      if ((dup.items || []).length > 0) {
        setErr("An active porter with this phone number already exists.");
        return;
      }
      await api.entities.Porter.create({
        full_name: name.trim(),
        phone_number: normalizePhone(phone),
        active: true,
      });
      setName("");
      setPhone("");
      load();
    } catch (e) {
      setErr(e.message || "Failed to add porter.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.full_name);
    setEditPhone(p.phone_number);
    setEditErr("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
    setEditErr("");
  };

  const saveEdit = async (p) => {
    setEditErr("");
    if (!editName.trim() || !editPhone.trim()) {
      setEditErr("Full name and phone number are required.");
      return;
    }
    const normalized = normalizePhone(editPhone);
    try {
      const dup = await api.entities.Porter.filter({
        phone_number: normalized,
        active: true,
      });
      const dupItem = (dup.items || []).find((d) => d.id !== p.id);
      if (dupItem) {
        setEditErr("Another active porter uses this phone number.");
        return;
      }
      await api.entities.Porter.update(p.id, {
        full_name: editName.trim(),
        phone_number: normalized,
      });
      cancelEdit();
      load();
    } catch (e) {
      setEditErr(e.message || "Failed to update porter.");
    }
  };

  // Gives a porter a login, resets it, switches it off or on, or removes it. A new temporary password is shown here once.
  const loginAction = async (p, action) => {
    setBusyLogin(p.id + action);
    try {
      const { data } = await api.functions.invoke("managePorterLogin", { action, porter_id: p.id });
      if (data?.temporary_password) {
        setIssued({ name: p.full_name, phone: data.phone, password: data.temporary_password });
        setCopied(false);
      }
      await load();
    } catch (e) {
      notifyError(e.message || "Could not change the login.");
    } finally {
      setBusyLogin("");
    }
  };

  const copyIssued = async () => {
    const text = `Airport Assist porter sign-in\nPage: ${window.location.origin}/login\nPhone number: ${issued.phone}\nTemporary password: ${issued.password}\nYou will choose your own password the first time you sign in.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      notifyError("Could not copy. Write the password down from the box instead.");
    }
  };

  const toggle = async (p) => {
    try {
      await api.entities.Porter.update(p.id, { active: !p.active });
      load();
    } catch (e) {
      notifyError(e.message || "Failed to update porter.");
    }
  };

  const remove = async (p) => {
    try {
      await api.entities.Porter.delete(p.id);
      load();
    } catch (e) {
      notifyError(e.message || "Failed to delete porter.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent" /> Add Porter
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kwame Mensah" />
          </div>
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 024 123 4567" />
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>
        {err && <p className="text-sm text-destructive mt-3">{err}</p>}
      </div>

      {issued && (
        <div role="status" className="rounded-2xl border border-accent/40 bg-accent/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-accent" /> Sign-in details for {issued.name}</h3>
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Phone number</dt><dd className="font-medium">{issued.phone}</dd>
            <dt className="text-muted-foreground">Temporary password</dt><dd className="font-mono font-semibold break-all select-all">{issued.password}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">This is shown only once. Give it to the porter now; they choose their own password the first time they sign in. Anything that was open on their phone is signed out.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={copyIssued}>{copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}{copied ? "Copied" : "Copy message to send"}</Button>
            <Button size="sm" variant="outline" onClick={() => setIssued(null)}>Done</Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Luggage className="w-4 h-4 text-accent" /> Porter Directory
        </h3>
        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {porters.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="border border-accent/40 rounded-lg p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2 items-end">
                    <div className="space-y-1 flex-1 w-full">
                      <Label className="text-xs">Full name</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="space-y-1 flex-1 w-full">
                      <Label className="text-xs">Phone number</Label>
                      <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(p)}>
                        <Save className="w-4 h-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {editErr && <p className="text-sm text-destructive">{editErr}</p>}
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.phone_number}</p>
                    <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground">
                      <Smartphone className="w-3 h-3" aria-hidden="true" />
                      {!logins[p.id] ? "No porter login" : logins[p.id].disabled ? "Login switched off" : logins[p.id].must_change_password ? "Login given, not used yet" : `Signs in${logins[p.id].last_login_at ? `, last ${when(logins[p.id].last_login_at)}` : ""}`}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {!logins[p.id] ? (
                        <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={!p.active || !!busyLogin} onClick={() => loginAction(p, "create")}>Give login</button>
                      ) : (
                        <>
                          <ConfirmAction title={`Reset ${p.full_name}'s password?`} description="A new temporary password is made and shown to you once. Their old password stops working and anything open on their phone is signed out." confirmLabel="Reset password" onConfirm={() => loginAction(p, "reset")}>
                            <button className="text-xs text-primary hover:underline">Reset password</button>
                          </ConfirmAction>
                          <button className="text-xs text-primary hover:underline" onClick={() => loginAction(p, logins[p.id].disabled ? "enable" : "disable")}>{logins[p.id].disabled ? "Switch login on" : "Switch login off"}</button>
                          <ConfirmAction title={`Remove ${p.full_name}'s login?`} description="They can no longer sign in. You can give them a new login later." confirmLabel="Remove login" destructive onConfirm={() => loginAction(p, "remove")}>
                            <button className="text-xs text-rose-600 hover:underline">Remove login</button>
                          </ConfirmAction>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={!!p.active} onCheckedChange={() => toggle(p)} />
                      {p.active ? "Active" : "Inactive"}
                    </label>
                    <button aria-label={`Edit porter ${p.full_name}`} onClick={() => startEdit(p)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <ConfirmAction title={`Delete porter "${p.full_name}"?`} description="They will be removed from the porter list. Past bookings and reports keep their name." confirmLabel="Delete porter" destructive onConfirm={() => remove(p)}>
                      <button aria-label={`Delete porter ${p.full_name}`} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </ConfirmAction>
                  </div>
                </div>
              )
            )}
            {porters.length === 0 && <p className="text-sm text-muted-foreground">No porters yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}