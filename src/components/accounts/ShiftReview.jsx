import React, { useMemo, useState } from "react";
import { CheckCircle2, Download, HelpCircle } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGHS } from "@/lib/packages";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError } from "@/lib/notify";
import { LoadState, Panel, Pill, fmtDate, useLoad } from "./shared";

const FILTERS = [["todo", "To check"], ["queried", "Queried"], ["accepted", "Accepted"], ["all", "All"]];
const n = (x) => Number(x) || 0;

function Variance({ value }) {
  const v = n(value);
  if (Math.abs(v) < 0.005) return <Pill tone="good">Exact</Pill>;
  return <Pill tone={v < 0 ? "bad" : "warn"}>{v < 0 ? "Short" : "Over"} {formatGHS(Math.abs(v))}</Pill>;
}

// Each supervisor's end-of-shift report: what they sold, the cash they should have and the cash they counted.
// The accountant accepts it, or queries it with a note the supervisor's manager can follow up.
export default function ShiftReview({ from, to }) {
  const { data, loading, error, reload } = useLoad(() => api.books.shiftReports(from, to), [from, to]);
  const [filter, setFilter] = useState("todo");
  const [querying, setQuerying] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);

  const counts = useMemo(() => ({
    todo: (data || []).filter((r) => !r.review_status).length,
    queried: (data || []).filter((r) => r.review_status === "queried").length,
    accepted: (data || []).filter((r) => r.review_status === "accepted").length,
    all: (data || []).length,
  }), [data]);
  const rows = (data || []).filter((r) => filter === "all" || (filter === "todo" ? !r.review_status : r.review_status === filter));
  const shown = rows.reduce((t, r) => ({ sales: t.sales + n(r.sales), expected: t.expected + n(r.cash_expected), counted: t.counted + n(r.cash_counted), variance: t.variance + n(r.variance) }), { sales: 0, expected: 0, counted: 0, variance: 0 });

  const review = async (id, status, text = null) => {
    setBusy(id);
    try {
      await api.books.reviewShift(id, status, text);
      setQuerying(null);
      setNote("");
      reload();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => downloadCsv(`shift_reports_${from}_to_${to}.csv`, toCsv(rows, [
    { key: "period", label: "Date" }, { key: "shift_type", label: "Shift" }, { key: "supervisor_name", label: "Supervisor" }, { key: "sales", label: "Sales (GHS)" },
    { key: "supervisor_commission", label: "Supervisor commission (GHS)" }, { key: "cash_expected", label: "Cash expected (GHS)" }, { key: "cash_counted", label: "Cash counted (GHS)" },
    { key: "variance", label: "Difference (GHS)" }, { key: "remarks", label: "Supervisor's remarks" }, { key: "review_status", label: "Review" }, { key: "reviewed_by_name", label: "Reviewed by" }, { key: "review_note", label: "Review note" },
  ]));

  return (
    <Panel
      title="Shift reports"
      note="Check the cash counted against the cash expected from the cash payments recorded in the shift. Query anything that does not add up."
      actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export</Button>}
    >
      <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Show">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`press px-3 py-1.5 rounded-full text-sm border transition-colors ${filter === k ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card border-border hover:border-accent"}`}>
            {l} <span className="tabular opacity-75">{counts[k]}</span>
          </button>
        ))}
      </div>
      <LoadState loading={loading} error={error} hasData={Boolean(data)}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{filter === "todo" ? "Every shift report in these dates has been checked." : "No shift reports here."}</p>
        ) : (
          <>
            <p className="text-sm mb-3 tabular">Sales <strong>{formatGHS(shown.sales)}</strong> · Cash expected <strong>{formatGHS(shown.expected)}</strong> · Counted <strong>{formatGHS(shown.counted)}</strong> · Difference <strong className={shown.variance < 0 ? "text-destructive" : ""}>{formatGHS(shown.variance)}</strong></p>
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <li key={r.id} className={`rounded-xl border p-3.5 ${n(r.variance) < -0.004 && !r.review_status ? "border-destructive/40" : "border-border"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.supervisor_name || "Supervisor"} <span className="text-muted-foreground font-normal">· {fmtDate(r.period)}, {r.shift_type} shift</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">Filed {r.submitted_at ? new Date(r.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.review_status === "accepted" && <Pill tone="good"><CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Accepted</Pill>}
                      {r.review_status === "queried" && <Pill tone="warn"><HelpCircle className="w-3 h-3" aria-hidden="true" /> Queried</Pill>}
                      <Variance value={r.variance} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Sales</dt><dd className="tabular font-medium">{formatGHS(r.sales)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Supervisor commission</dt><dd className="tabular">{formatGHS(r.supervisor_commission)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Cash expected</dt><dd className="tabular">{formatGHS(r.cash_expected)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Cash counted</dt><dd className="tabular font-medium">{formatGHS(r.cash_counted)}</dd></div>
                  </dl>
                  {r.remarks && <p className="text-sm mt-3"><span className="text-xs text-muted-foreground block">Supervisor's remarks</span>{r.remarks}</p>}
                  {r.review_status && <p className="text-xs text-muted-foreground mt-3">{r.review_status === "accepted" ? "Accepted" : "Queried"} by {r.reviewed_by_name || "—"}{r.reviewed_at ? `, ${new Date(r.reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}{r.review_note ? `: “${r.review_note}”` : ""}</p>}
                  {r.review_status !== "accepted" && (
                    querying === r.id ? (
                      <form className="flex flex-wrap gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); review(r.id, "queried", note.trim()); }}>
                        <Input aria-label="What needs explaining" className="flex-1 min-w-[14rem]" placeholder="What needs explaining?" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                        <Button type="submit" size="sm" disabled={busy === r.id || note.trim().length < 3}>Send query</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setQuerying(null)}>Back</Button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button size="sm" onClick={() => review(r.id, "accepted")} disabled={busy === r.id}><CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Accept</Button>
                        {r.review_status !== "queried" && <Button size="sm" variant="outline" onClick={() => { setQuerying(r.id); setNote(""); }}><HelpCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Query</Button>}
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </LoadState>
    </Panel>
  );
}
