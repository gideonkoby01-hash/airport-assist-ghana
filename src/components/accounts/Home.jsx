import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Landmark, Lock, ReceiptText, Users } from "lucide-react";
import { api } from "@/api/db";
import { formatGHS } from "@/lib/packages";
import { LoadState, Panel, fmtMonth, useLoad } from "./shared";

const n = (x) => Number(x) || 0;

function Balance({ label, value, sub = undefined, onClick }) {
  return (
    <button type="button" onClick={onClick} className="press text-left rounded-xl border border-border bg-card p-3.5 hover:border-accent transition-colors">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className={`block text-base xl:text-lg font-semibold tabular whitespace-nowrap mt-1 ${n(value) < 0 ? "text-destructive" : "text-foreground"}`}>{formatGHS(value)}</span>
      {sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}
    </button>
  );
}

// The accountant's first screen: where the money is, what is owed, and what needs doing next.
export default function Home({ onGo }) {
  const { data: h, loading, error } = useLoad(() => api.books.home(), []);

  const todos = !h ? [] : [
    n(h.shift_reports_to_review) > 0 && {
      icon: ClipboardCheck, tone: n(h.cash_shortages_unreviewed) > 0 ? "bad" : "warn", go: "shifts",
      title: `Check ${h.shift_reports_to_review} shift report${n(h.shift_reports_to_review) === 1 ? "" : "s"}`,
      body: n(h.cash_shortages_unreviewed) > 0 ? `${h.cash_shortages_unreviewed} of them ${n(h.cash_shortages_unreviewed) === 1 ? "is" : "are"} short of cash.` : "Compare the cash counted with the cash expected, then accept or query.",
    },
    n(h.shift_reports_queried) > 0 && {
      icon: ClipboardCheck, tone: "warn", go: "shifts",
      title: `${h.shift_reports_queried} shift report${n(h.shift_reports_queried) === 1 ? " is" : "s are"} queried`, body: "Accept each one once the supervisor has explained it.",
    },
    n(h.cash_on_hand) > 0 && {
      icon: Landmark, tone: "neutral", go: "banking",
      title: `${formatGHS(h.cash_on_hand)} cash on hand`, body: "Record it when it is banked, so the books match the bank.",
    },
    n(h.card_to_settle) > 0 && {
      icon: Landmark, tone: "neutral", go: "banking",
      title: `${formatGHS(h.card_to_settle)} card takings not yet settled`, body: "Record the settlement when it reaches the bank.",
    },
    n(h.supervisors_owed) > 0 && {
      icon: Users, tone: "neutral", go: "payables",
      title: `Supervisors are owed ${formatGHS(h.supervisors_owed)} commission`, body: "Record what is paid, including commission kept from takings.",
    },
    n(h.customers_overdue) > 0 && {
      icon: ReceiptText, tone: "warn", go: "receivables",
      title: `${h.customers_overdue} booking${n(h.customers_overdue) === 1 ? "" : "s"} unpaid more than a week after the flight`, body: `Customers owe ${formatGHS(h.customers_owe)} in all.`,
    },
    h.previous_month && !h.previous_month_closed && {
      icon: Lock, tone: "warn", go: "close",
      title: `Close ${fmtMonth(h.previous_month)}`, body: "Check the month, export the pack, then close it so nothing can change.",
    },
  ].filter(Boolean);

  return (
    <LoadState loading={loading} error={error} hasData={Boolean(h)}>
      {h && (
        <div className="space-y-5">
          <Panel title="Where the money is" note="Balances today, from every payment, expense, payout and transfer recorded.">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
              <Balance label="Cash on hand" value={h.cash_on_hand} onClick={() => onGo("banking")} />
              <Balance label="Mobile money" value={h.mobile_money} onClick={() => onGo("banking")} />
              <Balance label="Card, to be settled" value={h.card_to_settle} onClick={() => onGo("banking")} />
              <Balance label="Bank" value={h.bank} onClick={() => onGo("banking")} />
              <Balance label="Corporate customers owe" value={h.corporate_receivable} onClick={() => onGo("receivables")} />
            </div>
          </Panel>

          <div className="grid lg:grid-cols-5 gap-5">
            <Panel title="To do" className="lg:col-span-3">
              {todos.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Nothing waiting. The books are up to date.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {todos.map((t) => (
                    <li key={t.title}>
                      <button type="button" onClick={() => onGo(t.go)} className="w-full flex items-start gap-3 py-3 text-left group">
                        <span className={`mt-0.5 grid place-items-center w-8 h-8 rounded-lg shrink-0 ${t.tone === "bad" ? "bg-destructive/10 text-destructive" : t.tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-secondary text-muted-foreground"}`}>
                          {t.tone === "bad" ? <AlertTriangle className="w-4 h-4" aria-hidden="true" /> : <t.icon className="w-4 h-4" aria-hidden="true" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-foreground">{t.title}</span>
                          <span className="block text-xs text-muted-foreground">{t.body}</span>
                        </span>
                        <ArrowRight className="w-4 h-4 mt-2 text-muted-foreground group-hover:text-foreground shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Owed" className="lg:col-span-2 self-start">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Customers owe us</dt><dd className="tabular font-semibold">{formatGHS(h.customers_owe)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">We owe porters</dt><dd className="tabular font-semibold">{formatGHS(h.porters_owed)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">We owe supervisors</dt><dd className="tabular font-semibold">{formatGHS(h.supervisors_owed)}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                {h.last_closed_month ? <>Books closed up to the end of <strong className="text-foreground">{fmtMonth(h.last_closed_month)}</strong>.</> : "No month has been closed yet."}
              </p>
            </Panel>
          </div>
        </div>
      )}
    </LoadState>
  );
}
