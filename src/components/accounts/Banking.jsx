import React, { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Plus } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGHS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import { notifyError } from "@/lib/notify";
import { TRANSFER_PRESETS, reconcile } from "@/lib/books";
import { LoadState, Panel, Pill, fmtDate, useChart, useLoad } from "./shared";

const blank = () => ({ preset: "bank_cash", from: "1000", to: "1030", date: todayUtc(), amount: "", reference: "", note: "" });

function TransferForm({ accounts, onDone }) {
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const money = accounts.filter((a) => a.kind === "asset" && a.active);
  const name = (code) => money.find((a) => a.code === code)?.name || code;
  const choose = (key) => {
    const p = TRANSFER_PRESETS.find((x) => x.key === key);
    setF((s) => ({ ...s, preset: key, from: p.from || s.from, to: p.to || s.to }));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.from || !f.to || f.from === f.to) return setError("Choose two different accounts.");
    if (!(Number(f.amount) > 0)) return setError("Enter an amount above zero.");
    setSaving(true);
    try {
      const preset = TRANSFER_PRESETS.find((x) => x.key === f.preset);
      await api.books.recordTransfer({ ...f, amount: Math.round(Number(f.amount) * 100) / 100, note: f.note.trim() || (preset && preset.key !== "custom" ? preset.label : "") });
      setF({ ...blank(), date: f.date, preset: f.preset, from: f.from, to: f.to });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What happened">
        {TRANSFER_PRESETS.map((p) => (
          <button key={p.key} type="button" aria-pressed={f.preset === p.key} onClick={() => choose(p.key)}
            className={`press px-3 py-1.5 rounded-full text-sm border transition-colors ${f.preset === p.key ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card border-border hover:border-accent"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-12 gap-3 items-end">
        {f.preset === "custom" ? (
          <>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tr-from" className="text-xs">From</Label>
              <Select value={f.from} onValueChange={(v) => setF({ ...f, from: v })}><SelectTrigger id="tr-from"><SelectValue /></SelectTrigger>
                <SelectContent>{money.map((a) => (<SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>))}</SelectContent></Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="tr-to" className="text-xs">To</Label>
              <Select value={f.to} onValueChange={(v) => setF({ ...f, to: v })}><SelectTrigger id="tr-to"><SelectValue /></SelectTrigger>
                <SelectContent>{money.map((a) => (<SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>))}</SelectContent></Select>
            </div>
          </>
        ) : (
          <p className="sm:col-span-6 text-sm flex items-center gap-2 h-10"><span className="font-medium">{name(f.from)}</span><ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span className="font-medium">{name(f.to)}</span></p>
        )}
        <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="tr-date" className="text-xs">Date</Label><Input id="tr-date" type="date" max={todayUtc()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="tr-amount" className="text-xs">Amount (GHS)</Label><Input id="tr-amount" type="number" min={0} step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-4"><Label htmlFor="tr-ref" className="text-xs">Deposit slip or reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="tr-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} autoComplete="off" /></div>
        <div className="space-y-1.5 sm:col-span-5"><Label htmlFor="tr-note" className="text-xs">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="tr-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} autoComplete="off" /></div>
        <div className="sm:col-span-3"><Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />} Record transfer</Button></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

// Money accounts: their balances, moving money between them, and checking each against its statement.
export default function Banking({ from, to }) {
  const chart = useChart();
  const tb = useLoad(() => api.books.trialBalance(from, to), [from, to]);
  const transfers = useLoad(() => api.books.transfers(from, to), [from, to]);
  const [statement, setStatement] = useState({});
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState("");
  const reloadAll = () => { tb.reload(); transfers.reload(); };
  const moneyRows = (tb.data || []).filter((r) => r.kind === "asset");
  const name = (code) => (chart.data || []).find((a) => a.code === code)?.name || code;

  const confirmVoid = async () => {
    try {
      await api.books.voidTransfer(voiding, reason.trim());
      setVoiding(null);
      setReason("");
      reloadAll();
    } catch (err) {
      notifyError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <Panel title="Move money" note="Record cash taken to the bank, card and mobile money settlements, and corporate customers paying. Card takings sit in “to be settled” until the settlement is recorded.">
        {chart.data ? <TransferForm accounts={chart.data} onDone={reloadAll} /> : <LoadState loading={chart.loading} error={chart.error} hasData={false}>{null}</LoadState>}
      </Panel>

      <Panel title={`Reconcile at ${fmtDate(to)}`} note="Type the balance on the bank statement, the mobile money wallet or the cash count. Any difference is something missing from the books, or from the statement.">
        <LoadState loading={tb.loading} error={tb.error} hasData={Boolean(tb.data)}>
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_8rem_9rem_7rem] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
            <span>Account</span><span className="text-right">In the books</span><span className="text-right">Statement or count</span><span className="text-right">Difference</span>
          </div>
          <ul className="divide-y divide-border/60">
            {moneyRows.map((r) => {
              const rec = reconcile(r.closing, statement[r.code]);
              return (
                <li key={r.code} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_7rem] gap-x-3 gap-y-2 py-2.5 items-center text-sm">
                  <span className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</span>
                  <span className={`text-right tabular font-medium whitespace-nowrap ${Number(r.closing) < 0 ? "text-destructive" : ""}`}>{formatGHS(r.closing)}</span>
                  <Input aria-label={`Statement balance for ${r.name}`} placeholder="Statement" className="h-9 text-right tabular" type="number" step="0.01" inputMode="decimal" value={statement[r.code] ?? ""} onChange={(e) => setStatement((st) => ({ ...st, [r.code]: e.target.value }))} />
                  <span className="text-right">
                    {rec === null ? <span className="text-muted-foreground/50">—</span> : rec.matched
                      ? <Pill tone="good"><CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Matches</Pill>
                      : <Pill tone="bad">{rec.difference > 0 ? "+" : ""}{rec.difference.toFixed(2)}</Pill>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">A positive difference means the statement has more than the books (money in not yet recorded); a negative one means less (a cost, a charge or a shortage not yet recorded). Bank charges are entered as an expense or a journal entry.</p>
        </LoadState>
      </Panel>

      <Panel title="Transfers" note="In the selected dates, newest first.">
        <LoadState loading={transfers.loading} error={transfers.error} hasData={Boolean(transfers.data)}>
          {(transfers.data || []).length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No transfers in this period.</p> : (
            <ul className="divide-y divide-border/60">
              {transfers.data.map((t) => (
                <li key={t.id} className={`py-3 text-sm ${t.voided ? "opacity-55" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-medium">{name(t.from_account)} → {name(t.to_account)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(t.transfer_date)}{t.note ? ` · ${t.note}` : ""}{t.reference ? ` · ${t.reference}` : ""} · {t.created_by_name || "—"}{t.voided ? ` · Cancelled: ${t.void_reason}` : ""}</p>
                    </div>
                    <span className={`tabular font-semibold whitespace-nowrap ${t.voided ? "line-through" : ""}`}>{formatGHS(t.amount)}</span>
                  </div>
                  {!t.voided && (voiding === t.id ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Input aria-label="Reason for cancelling" className="h-8 w-full sm:w-56" placeholder="Why cancel it?" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                      <Button size="sm" variant="destructive" onClick={confirmVoid}>Cancel transfer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>Keep</Button>
                    </div>
                  ) : <Button size="sm" variant="ghost" className="h-7 px-2 mt-1 -ml-2 text-destructive" onClick={() => { setVoiding(t.id); setReason(""); }}>Cancel</Button>)}
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Panel>
    </div>
  );
}
