import React, { useMemo, useState } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { api, BOOKS_ERRORS } from "@/api/db";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGHS } from "@/lib/packages";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_METHODS } from "@/lib/finance";
import { downloadCsv, toCsv } from "@/lib/csv";
import { todayUtc } from "@/lib/bookingFormRules";
import { notifyError } from "@/lib/notify";
import { LoadState, Panel, fmtDate, methodLabel, useLoad } from "./shared";

// A closed month refuses changes; say so in words.
const say = (err, fallback) => (/period_closed/.test(err?.message || "") ? BOOKS_ERRORS.period_closed : err?.message || fallback);

const blank = () => ({ expense_date: todayUtc(), category: "supplies", description: "", payee: "", method: "cash", reference: "", amount: "" });

export default function Expenses({ from, to }) {
  const canRecord = useCan()("accounts.record");
  const { data, loading, error, reload } = useLoad(async () => (await api.entities.Expense.filter({ expense_date: { $gte: from, $lte: to } }, { sort: "-expense_date", limit: 2000 })).items || [], [from, to]);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [category, setCategory] = useState("all");
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const live = useMemo(() => (data || []).filter((e) => !e.voided && (category === "all" || e.category === category)), [data, category]);
  const total = live.reduce((t, e) => t + Number(e.amount), 0);

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    const amount = Number(form.amount);
    if (form.description.trim().length < 2) return setFormError("Say what the money was spent on.");
    if (!(amount > 0)) return setFormError("Enter an amount above zero.");
    if (!form.expense_date) return setFormError("Choose the date it was spent.");
    setSaving(true);
    try {
      await api.entities.Expense.create({
        expense_date: form.expense_date, category: form.category, description: form.description.trim(), amount: Math.round(amount * 100) / 100,
        payee: form.payee.trim() || null, method: form.method || null, reference: form.reference.trim() || null,
      });
      setForm({ ...blank(), expense_date: form.expense_date, category: form.category });
      reload();
    } catch (err) {
      setFormError(say(err, "The expense could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const confirmVoid = async () => {
    if (reason.trim().length < 3) return notifyError("Give a reason so the record shows why it was cancelled.");
    try {
      await api.entities.Expense.update(voiding.id, { voided: true, void_reason: reason.trim() });
      setVoiding(null);
      setReason("");
      reload();
    } catch (err) {
      notifyError(say(err, "Could not cancel that expense."));
    }
  };

  const exportCsv = () => downloadCsv(`expenses_${from}_to_${to}.csv`, toCsv((data || []).filter((e) => !e.voided), [
    { key: "expense_date", label: "Date" }, { key: "category", label: "Category", value: (e) => EXPENSE_CATEGORY_LABELS[e.category] || e.category }, { key: "description", label: "Description" },
    { key: "payee", label: "Paid to" }, { key: "method", label: "Method", value: (e) => methodLabel(e.method) }, { key: "reference", label: "Reference" }, { key: "amount", label: "Amount (GHS)" }, { key: "created_by_name", label: "Recorded by" },
  ]));

  return (
    <div className="space-y-5">
      {canRecord && (<Panel title="Record an expense" note="Rent, salaries, fuel and the other costs of running the business. An expense is never deleted; if one is wrong, cancel it with a reason and enter it again.">
        <form onSubmit={save} noValidate className="grid sm:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
          <div className="space-y-1.5 xl:col-span-2"><Label htmlFor="ex-date" className="text-xs">Date</Label><Input id="ex-date" type="date" value={form.expense_date} max={todayUtc()} onChange={(e) => set("expense_date", e.target.value)} /></div>
          <div className="space-y-1.5 xl:col-span-3">
            <Label htmlFor="ex-cat" className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="ex-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 xl:col-span-4"><Label htmlFor="ex-desc" className="text-xs">What was it for?</Label><Input id="ex-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Office rent, November" autoComplete="off" /></div>
          <div className="space-y-1.5 xl:col-span-3"><Label htmlFor="ex-amount" className="text-xs">Amount (GHS)</Label><Input id="ex-amount" type="number" min={0} step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
          <div className="space-y-1.5 xl:col-span-3"><Label htmlFor="ex-payee" className="text-xs">Paid to <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="ex-payee" value={form.payee} onChange={(e) => set("payee", e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1.5 xl:col-span-3">
            <Label htmlFor="ex-method" className="text-xs">Paid by</Label>
            <Select value={form.method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger id="ex-method"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_METHODS.map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 xl:col-span-3"><Label htmlFor="ex-ref" className="text-xs">Receipt or reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="ex-ref" value={form.reference} onChange={(e) => set("reference", e.target.value)} autoComplete="off" /></div>
          <div className="xl:col-span-3"><Button type="submit" className="w-full whitespace-nowrap" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />} Add expense</Button></div>
        </form>
        {formError && <p role="alert" className="text-sm text-destructive mt-3">{formError}</p>}
      </Panel>)}

      <Panel
        title="Expenses"
        note="Entries in the selected dates."
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All categories</SelectItem>{EXPENSE_CATEGORIES.map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!live.length}><Download className="w-4 h-4 mr-1.5" /> Export</Button>
          </div>
        }
      >
        <LoadState loading={loading} error={error} hasData={Boolean(data)}>
          <p className="text-sm mb-3">Total: <strong className="tabular">{formatGHS(total)}</strong> <span className="text-muted-foreground">on {live.length} expense{live.length === 1 ? "" : "s"}</span></p>
          {live.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No expenses recorded in this period.</p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Category</th><th className="py-2 pr-3 font-medium">Description</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 font-medium">Recorded by</th><th className="py-2"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {live.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                      <td className="py-2 pr-3">{EXPENSE_CATEGORY_LABELS[e.category] || e.category}</td>
                      <td className="py-2 pr-3">{e.description}<span className="block text-xs text-muted-foreground">{[e.payee, methodLabel(e.method), e.reference].filter((v) => v && v !== "—").join(" · ")}</span></td>
                      <td className="py-2 pr-3 text-right tabular font-medium">{formatGHS(e.amount)}</td>
                      <td className="py-2 pr-3">{e.created_by_name || "—"}</td>
                      <td className="py-2 text-right">
                        {voiding?.id === e.id ? (
                          <div className="flex flex-wrap items-center gap-2 justify-end">
                            <Input aria-label="Reason for cancelling" className="h-8 w-48" placeholder="Why is it cancelled?" value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus />
                            <Button size="sm" variant="destructive" onClick={confirmVoid}>Cancel expense</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setVoiding(null); setReason(""); }}>Keep</Button>
                          </div>
                        ) : (canRecord && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setVoiding(e); setReason(""); }}>Cancel</Button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(data || []).some((e) => e.voided) && <p className="text-xs text-muted-foreground mt-3">{(data || []).filter((e) => e.voided).length} cancelled expense{(data || []).filter((e) => e.voided).length === 1 ? " is" : "s are"} kept on record and not counted.</p>}
        </LoadState>
      </Panel>
    </div>
  );
}
