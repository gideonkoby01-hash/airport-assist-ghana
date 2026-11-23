import React, { useMemo, useState } from "react";
import { Download, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/api/db";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";
import { todayUtc } from "@/lib/bookingFormRules";
import { notifyError } from "@/lib/notify";
import { JOURNAL_CSV, SOURCE_LABELS, checkJournal, groupEntries } from "@/lib/books";
import { Amt, LoadState, Panel, fmtDate, useChart, useLoad } from "./shared";

const SHOWN = 100;
const blankLine = () => ({ account: "", debit: "", credit: "", memo: "" });

function AccountPicker({ id, value, onChange, accounts }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label="Account"><SelectValue placeholder="Choose an account" /></SelectTrigger>
      <SelectContent>
        {accounts.filter((a) => a.active).map((a) => (<SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

// A manual entry: opening balances, corrections, owner's money in or out. It must balance before it can be posted.
function NewEntry({ accounts, onDone, onCancel }) {
  const [date, setDate] = useState(todayUtc());
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const check = checkJournal(rows);
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === "debit" && v ? { credit: "" } : {}), ...(k === "credit" && v ? { debit: "" } : {}) } : r)));

  const post = async (e) => {
    e.preventDefault();
    setError("");
    if (memo.trim().length < 3) return setError("Say what the entry is for.");
    if (check.error) return setError(check.error);
    setSaving(true);
    try {
      await api.books.postJournal(date, memo.trim(), reference.trim() || null, check.lines);
      onDone();
    } catch (err) {
      setError(err.message || "The entry could not be posted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="New journal entry" note="For what the automatic entries do not cover: opening balances, the owner putting money in or taking it out, corrections. Debits must equal credits." actions={<Button variant="ghost" size="sm" onClick={onCancel}><X className="w-4 h-4 mr-1" aria-hidden="true" /> Close</Button>}>
      <form onSubmit={post} noValidate className="space-y-4">
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="je-date" className="text-xs">Date</Label><Input id="je-date" type="date" value={date} max={todayUtc()} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-6"><Label htmlFor="je-memo" className="text-xs">What is it for?</Label><Input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Opening bank balance" autoComplete="off" /></div>
          <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="je-ref" className="text-xs">Reference <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="je-ref" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" /></div>
        </div>
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-0.5"><span className="col-span-5">Account</span><span className="col-span-2 text-right">Debit</span><span className="col-span-2 text-right">Credit</span><span className="col-span-3">Line note</span></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center rounded-xl sm:rounded-none border sm:border-0 border-border p-2.5 sm:p-0">
              <div className="col-span-2 sm:col-span-5"><AccountPicker id={`je-acc-${i}`} value={r.account} onChange={(v) => setRow(i, "account", v)} accounts={accounts} /></div>
              <Input aria-label={`Debit, line ${i + 1}`} placeholder="Debit" className="sm:col-span-2 text-right tabular" type="number" min={0} step="0.01" inputMode="decimal" value={r.debit} onChange={(e) => setRow(i, "debit", e.target.value)} />
              <Input aria-label={`Credit, line ${i + 1}`} placeholder="Credit" className="sm:col-span-2 text-right tabular" type="number" min={0} step="0.01" inputMode="decimal" value={r.credit} onChange={(e) => setRow(i, "credit", e.target.value)} />
              <div className="col-span-2 sm:col-span-3 flex gap-1.5">
                <Input aria-label={`Note, line ${i + 1}`} value={r.memo} onChange={(e) => setRow(i, "memo", e.target.value)} autoComplete="off" />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" aria-hidden="true" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankLine()])} disabled={rows.length >= 40}><Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add a line</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-sm tabular" aria-live="polite">
            Debits <strong>{check.debit.toFixed(2)}</strong> · Credits <strong>{check.credit.toFixed(2)}</strong>
            {check.lines.length >= 2 && (check.difference === 0 ? <span className="ml-2 text-emerald-700 dark:text-emerald-300">Balanced</span> : <span className="ml-2 text-destructive">Out by {Math.abs(check.difference).toFixed(2)}</span>)}
          </p>
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Post entry</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </Panel>
  );
}

// Every entry in the books for the period: the automatic ones from the day's records and the manual ones.
export default function Journal({ from, to }) {
  const canRecord = useCan()("accounts.record");
  const chart = useChart();
  const { data, loading, error, reload } = useLoad(() => api.books.journal(from, to), [from, to]);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(SHOWN);
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState("");

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupEntries(data).filter((e) => (source === "all" || e.source === source)
      && (!q || [e.reference, e.memo, ...e.lines.map((l) => `${l.account_code} ${l.account_name}`)].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [data, source, search]);
  const totals = entries.reduce((t, e) => ({ dr: t.dr + e.debit, cr: t.cr + e.credit }), { dr: 0, cr: 0 });

  const confirmVoid = async () => {
    try {
      await api.books.voidJournal(voiding, reason.trim());
      setVoiding(null);
      setReason("");
      reload();
    } catch (err) {
      notifyError(err.message);
    }
  };

  const exportCsv = () => downloadCsv(`journal_${from}_to_${to}.csv`, toCsv(entries.flatMap((e) => e.lines), JOURNAL_CSV));

  return (
    <div className="space-y-5">
      {adding && chart.data && <NewEntry accounts={chart.data} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      <Panel
        title="Journal"
        note="Payments, refunds, expenses, commission, payouts and transfers become entries on their own. Only manual entries can be cancelled here; the others are corrected where they were recorded."
        actions={
          <div className="flex flex-wrap gap-2">
            {canRecord && !adding && <Button size="sm" onClick={() => setAdding(true)} disabled={!chart.data}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> New entry</Button>}
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!entries.length}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export</Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search the journal" className="pl-9" placeholder="Reference, description or account" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full sm:w-60" aria-label="Type of entry"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All entries</SelectItem>{Object.entries(SOURCE_LABELS).map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <LoadState loading={loading} error={error} hasData={Boolean(data)}>
          <p className="text-sm mb-3 tabular">{entries.length} entr{entries.length === 1 ? "y" : "ies"} · Debits <strong>{totals.dr.toFixed(2)}</strong> · Credits <strong>{totals.cr.toFixed(2)}</strong></p>
          {entries.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No entries in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Entry</th><th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 pr-3 text-right font-medium">Debit</th><th className="py-2 pr-3 text-right font-medium">Credit</th>
                </tr></thead>
                {entries.slice(0, limit).map((e) => (
                  <tbody key={e.key} className="border-b border-border last:border-0">
                    {e.lines.map((l, i) => (
                      <tr key={i} className="align-top">
                        {i === 0 && (
                          <>
                            <td rowSpan={e.lines.length} className="py-2 pr-3 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                            <td rowSpan={e.lines.length} className="py-2 pr-3 min-w-[12rem]">
                              <span className="block font-medium">{SOURCE_LABELS[e.source] || e.source}{e.reference ? <span className="font-mono text-xs text-muted-foreground"> · {e.reference}</span> : null}</span>
                              <span className="block text-xs text-muted-foreground">{e.memo}</span>
                              {canRecord && e.source === "journal" && (voiding === e.source_id ? (
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  <Input aria-label="Reason for cancelling" className="h-8 w-44" placeholder="Why cancel it?" value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus />
                                  <Button size="sm" variant="destructive" onClick={confirmVoid}>Cancel entry</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>Keep</Button>
                                </span>
                              ) : <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-destructive" onClick={() => { setVoiding(e.source_id); setReason(""); }}>Cancel</Button>)}
                            </td>
                          </>
                        )}
                        <td className={`py-2 pr-3 ${Number(l.credit) > 0 ? "pl-6" : ""}`}><span className="font-mono text-xs text-muted-foreground">{l.account_code}</span> {l.account_name}</td>
                        <td className="py-2 pr-3 text-right"><Amt value={l.debit} /></td>
                        <td className="py-2 pr-3 text-right"><Amt value={l.credit} /></td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              {entries.length > limit && <div className="text-center pt-3"><Button variant="outline" size="sm" onClick={() => setLimit((l) => l + SHOWN)}>Show more ({entries.length - limit} left)</Button></div>}
            </div>
          )}
        </LoadState>
      </Panel>
    </div>
  );
}
