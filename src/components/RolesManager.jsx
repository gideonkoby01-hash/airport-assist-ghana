import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, LockKeyhole, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { ADMIN_ONLY_AREAS, PERMISSIONS, PERMISSION_GROUPS, roleCounts, roleSaveMessage, staffRoleKeyOf, toggled } from "@/lib/permissions";
import { useStaffRoles } from "@/hooks/use-staff-roles";

const NEW = "__new";
const ADMIN = "__admin";
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Admin creates roles and chooses the tasks each may perform. A person with a role sees only the screens its tasks allow, and the
// database refuses anything else. Changes take effect the next time the person opens a screen.
export default function RolesManager() {
  const { roles, ready, loading, error, reload } = useStaffRoles();
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState("general_manager");
  const [draft, setDraft] = useState({ name: "", description: "", permissions: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [giveTo, setGiveTo] = useState("");

  const loadPeople = () => api.entities.User.filter({}).then((items) => setPeople(items || [])).catch(() => {});
  useEffect(() => {
    loadPeople();
  }, []);

  const withCounts = useMemo(() => roleCounts(roles, people), [roles, people]);
  const current = withCounts.find((r) => r.key === selected);

  // Choosing another role clears the messages; the editor starts from the chosen role (or empty, for a new one).
  useEffect(() => {
    setMessage("");
    setFormError("");
    setGiveTo("");
  }, [selected]);
  useEffect(() => {
    if (selected === NEW) setDraft({ name: "", description: "", permissions: [] });
    else if (current) setDraft({ name: current.name, description: current.description || "", permissions: [...current.permissions] });
  }, [selected, current?.key, roles]);

  const dirty = selected === NEW
    ? draft.name.trim().length > 0
    : Boolean(current) && (draft.name.trim() !== current.name || draft.description.trim() !== (current.description || "") || !same(draft.permissions, current.permissions));

  const holders = people.filter((p) => !p.disabled && current && staffRoleKeyOf(p) === current.key);
  const candidates = people.filter((p) => !p.disabled && ["supervisor", "management", "accounts"].includes(p.role) && current && staffRoleKeyOf(p) !== current.key);

  const save = async () => {
    setFormError("");
    setMessage("");
    if (draft.name.trim().length < 2) return setFormError("Give the role a name.");
    setSaving(true);
    try {
      if (selected === NEW) {
        const key = await api.roles.create(draft.name.trim(), draft.description.trim(), draft.permissions);
        await reload();
        setSelected(key);
        setMessage(`${draft.name.trim()} is created. Give it to a person below, or under Staff accounts.`);
      } else {
        await api.roles.update(selected, draft.name.trim(), draft.description.trim(), draft.permissions);
        await reload();
        setMessage("Saved. People with this role see the change the next time they open a screen.");
      }
    } catch (e) {
      setFormError(roleSaveMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.roles.remove(selected);
      await reload();
      setSelected("general_manager");
    } catch (e) {
      notifyError(roleSaveMessage(e));
    }
  };

  const give = async () => {
    if (!giveTo) return;
    try {
      await api.roles.assign(giveTo, selected);
      await loadPeople();
      setGiveTo("");
      setMessage("Done. They have this role now.");
    } catch (e) {
      notifyError(roleSaveMessage(e));
    }
  };

  if (loading && !roles.length) {
    return <div className="flex items-center text-muted-foreground text-sm py-6"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading roles…</div>;
  }

  if (!ready) {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Roles and tasks</h2>
        <p className="text-sm text-muted-foreground mt-2">The roles update has not been applied to the database yet. Run the latest database update (the file ending <span className="font-mono">staff_roles_permissions.sql</span>) in the Supabase SQL Editor, then refresh this page.</p>
        {error && <p className="text-xs text-muted-foreground mt-3">{error}</p>}
      </div>
    );
  }

  const isNew = selected === NEW;
  const editing = isNew || (current && selected !== ADMIN);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Roles and tasks</h2>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">Create a role, choose the tasks it may perform, and give it to people under Staff accounts. They see only what their tasks allow, and the system refuses anything else.</p>
      </div>

      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)] gap-5 items-start">
        {/* The roles */}
        <nav aria-label="Roles" className="space-y-1.5">
          <button type="button" onClick={() => setSelected(ADMIN)} aria-current={selected === ADMIN ? "true" : undefined}
            className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected === ADMIN ? "border-accent bg-accent/5" : "border-border bg-card hover:border-accent/60"}`}>
            <LockKeyhole className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">Admin</span><span className="block text-xs text-muted-foreground">Everything. Cannot be changed.</span></span>
          </button>
          {withCounts.map((r) => (
            <button key={r.key} type="button" onClick={() => setSelected(r.key)} aria-current={selected === r.key ? "true" : undefined}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected === r.key ? "border-accent bg-accent/5" : "border-border bg-card hover:border-accent/60"}`}>
              <ShieldCheck className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground truncate">{r.name}</span>
                <span className="block text-xs text-muted-foreground">{r.permissions.length} task{r.permissions.length === 1 ? "" : "s"} · {r.holders} {r.holders === 1 ? "person" : "people"}{r.system ? " · ready-made" : ""}</span>
              </span>
            </button>
          ))}
          <Button variant={isNew ? "default" : "outline"} className="w-full justify-start" onClick={() => setSelected(NEW)}><Plus className="w-4 h-4 mr-2" aria-hidden="true" /> New role</Button>
        </nav>

        {/* The editor */}
        <div className="space-y-4 min-w-0">
          {selected === ADMIN && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">Admin</h3>
              <p className="text-sm text-muted-foreground mt-1">An admin can do every task, and only an admin can use these:</p>
              <ul className="mt-3 flex flex-wrap gap-2">{ADMIN_ONLY_AREAS.map((a) => <li key={a} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground">{a}</li>)}</ul>
              <p className="text-xs text-muted-foreground mt-4">Admin accounts have two-step verification and are created and changed by other admins.</p>
            </section>
          )}

          {editing && (
            <section className="rounded-2xl border border-border bg-card p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="role-name" className="text-xs">Role name</Label>
                  <Input id="role-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Customer Care Lead" maxLength={60} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role-desc" className="text-xs">What the role is for <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="role-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={200} autoComplete="off" />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground">Tasks this role may perform</h3>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, permissions: PERMISSIONS.map((p) => p.key) })}>All</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, permissions: [] })}>None</Button>
                  </div>
                </div>
                <div className="space-y-5">
                  {PERMISSION_GROUPS.map((group) => (
                    <fieldset key={group}>
                      <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{group}</legend>
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {PERMISSIONS.filter((p) => p.group === group).map((p) => {
                          const on = draft.permissions.includes(p.key);
                          return (
                            <li key={p.key} className="flex items-start gap-3 px-3.5 py-3">
                              <Switch id={`perm-${p.key}`} checked={on} onCheckedChange={(v) => setDraft({ ...draft, permissions: toggled(draft.permissions, p.key, v) })} className="mt-0.5" />
                              <label htmlFor={`perm-${p.key}`} className="min-w-0 flex-1 cursor-pointer">
                                <span className="block text-sm font-medium text-foreground">{p.label}</span>
                                <span className="block text-xs text-muted-foreground">{p.help}{p.requires && " Includes looking at the Accounts."}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Everyone with a role can use bookings, notifications and the supervisor list. Settings, Staff accounts, Service packages, Lounges, Discounts, Email and the porter register are admin only.</p>
              </div>

              {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              {message && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {message}</p>}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  {!isNew && current && !current.system && (
                    current.holders > 0
                      ? <p className="text-xs text-muted-foreground">To delete this role, first give its {current.holders === 1 ? "holder" : "holders"} another role.</p>
                      : (
                        <ConfirmAction title={`Delete the role ${current.name}?`} description="Nobody holds it. It is removed for good." confirmLabel="Delete role" destructive onConfirm={remove}>
                          <Button type="button" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Delete role</Button>
                        </ConfirmAction>
                      )
                  )}
                </div>
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : isNew ? <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                  {isNew ? "Create role" : "Save changes"}
                </Button>
              </div>
            </section>
          )}

          {editing && !isNew && current && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-accent" aria-hidden="true" /> People with this role</h3>
              {holders.length === 0 ? <p className="text-sm text-muted-foreground mt-2">Nobody yet.</p> : (
                <ul className="mt-2 divide-y divide-border text-sm">
                  {holders.map((p) => <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2"><span className="font-medium">{p.full_name || p.email}</span><span className="text-muted-foreground">{p.email}</span></li>)}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                <div className="space-y-1.5 flex-1 min-w-[14rem]">
                  <Label htmlFor="give-to" className="text-xs">Give this role to</Label>
                  <Select value={giveTo || undefined} onValueChange={setGiveTo}>
                    <SelectTrigger id="give-to"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                    <SelectContent>
                      {candidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email} ({p.role === "supervisor" ? "Supervisor" : roles.find((r) => r.key === staffRoleKeyOf(p))?.name || p.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={give} disabled={!giveTo}>Give role</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">Giving someone a role replaces the role they had. New people are created with a role under Staff accounts.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
