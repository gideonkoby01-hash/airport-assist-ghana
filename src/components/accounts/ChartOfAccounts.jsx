import React, { useState } from "react";
import { Loader2, Lock, Pencil, Plus } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError } from "@/lib/notify";
import { KIND_LABELS, KINDS } from "@/lib/books";
import { LoadState, Panel, Pill, useChart } from "./shared";

const KIND_HINT = { asset: "1000s", liability: "2000s", equity: "3000s", income: "4000s", expense: "5000s and 6000s" };

function Row({ a, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.name);
  const [busy, setBusy] = useState(false);
  const save = async (active) => {
    setBusy(true);
    try {
      await api.books.updateAccount(a.code, editing ? name.trim() : a.name, active);
      setEditing(false);
      onSaved();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className={`border-b border-border/60 ${a.active ? "" : "opacity-60"}`}>
      <td className="py-2 pr-3 font-mono text-xs w-20">{a.code}</td>
      <td className="py-2 pr-3">
        {editing ? (
          <form className="flex flex-wrap gap-1.5" onSubmit={(e) => { e.preventDefault(); save(a.active); }}>
            <Input aria-label={`Name of account ${a.code}`} className="h-8 max-w-xs" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Button size="sm" type="submit" disabled={busy || name.trim().length < 2}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setName(a.name); }}>Keep</Button>
          </form>
        ) : (
          <span className="inline-flex items-center gap-2">{a.name}{a.system && <Lock className="w-3 h-3 text-muted-foreground" aria-label="Used by the automatic entries" />}{!a.active && <Pill>Switched off</Pill>}</span>
        )}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {!editing && <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} aria-label={`Rename ${a.name}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>}
        {!a.system && !editing && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => save(!a.active)}>{a.active ? "Switch off" : "Switch on"}</Button>}
      </td>
    </tr>
  );
}

// The accounts the books are kept in. The locked ones are used by the automatic entries; more can be added for
// manual entries, for example a second bank account or a loan.
export default function ChartOfAccounts() {
  const { data, loading, error, reload } = useChart();
  const [form, setForm] = useState({ code: "", name: "", kind: "asset" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const add = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!/^\d{3,6}$/.test(form.code)) return setFormError("An account number is 3 to 6 digits.");
    if (form.name.trim().length < 2) return setFormError("Give the account a name.");
    setSaving(true);
    try {
      await api.books.addAccount(form.code, form.name.trim(), form.kind);
      setForm({ code: "", name: "", kind: form.kind });
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel title="Add an account" note="For example a second bank account, a loan, or a cost that needs its own line. New accounts are used in manual journal entries and transfers.">
        <form onSubmit={add} noValidate className="grid sm:grid-cols-12 gap-3 items-end">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="coa-code" className="text-xs">Number</Label><Input id="coa-code" inputMode="numeric" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="1040" /></div>
          <div className="space-y-1.5 sm:col-span-5"><Label htmlFor="coa-name" className="text-xs">Name</Label><Input id="coa-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. GCB current account" autoComplete="off" /></div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="coa-kind" className="text-xs">Type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger id="coa-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => (<SelectItem key={k} value={k}>{KIND_LABELS[k]} ({KIND_HINT[k]})</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />} Add</Button></div>
        </form>
        {formError && <p role="alert" className="text-sm text-destructive mt-3">{formError}</p>}
      </Panel>

      <Panel title="Chart of accounts" note="Accounts with a lock are used by the automatic entries: they can be renamed but not switched off.">
        <LoadState loading={loading} error={error} hasData={Boolean(data)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {KINDS.map((k) => {
                const list = (data || []).filter((a) => a.kind === k);
                if (!list.length) return null;
                return (
                  <tbody key={k}>
                    <tr><th colSpan={3} className="pt-4 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABELS[k]}</th></tr>
                    {list.map((a) => <Row key={`${a.code}:${a.name}:${a.active}`} a={a} onSaved={reload} />)}
                  </tbody>
                );
              })}
            </table>
          </div>
        </LoadState>
      </Panel>
    </div>
  );
}
