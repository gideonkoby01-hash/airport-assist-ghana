import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen, BookOpenCheck, ClipboardCheck, FileSpreadsheet, HandCoins, Home as HomeIcon, Landmark, LayoutGrid, ListTree, Lock,
  ReceiptText, Scale, Scale3d, Wallet, NotebookPen,
} from "lucide-react";
import { todayUtc } from "@/lib/bookingFormRules";
import { rangeForPreset } from "@/lib/finance";
import PeriodPicker from "@/components/charts/PeriodPicker";
import { useCan } from "@/hooks/use-can";
import Home from "./Home";
import Journal from "./Journal";
import GeneralLedger from "./GeneralLedger";
import TrialBalance from "./TrialBalance";
import ChartOfAccounts from "./ChartOfAccounts";
import BalanceSheet from "./BalanceSheet";
import Banking from "./Banking";
import ShiftReview from "./ShiftReview";
import CloseMonth from "./CloseMonth";
import Overview from "./Overview";
import Ledger from "./Ledger";
import Receivables from "./Receivables";
import CashBook from "./CashBook";
import Expenses from "./Expenses";
import ProfitLoss from "./ProfitLoss";
import Payables from "./Payables";

// ranged: the page follows the date range. asOf: it uses only the last day of the range.
const GROUPS = [
  { label: null, items: [{ key: "home", label: "Home", icon: HomeIcon }] },
  { label: "Books", items: [
    { key: "journal", label: "Journal", icon: NotebookPen, ranged: true },
    { key: "gl", label: "General ledger", icon: BookOpen, ranged: true },
    { key: "trial", label: "Trial balance", icon: Scale3d, ranged: true },
    { key: "chart", label: "Chart of accounts", icon: ListTree },
  ] },
  { label: "Statements", items: [
    { key: "overview", label: "Overview", icon: LayoutGrid, ranged: true },
    { key: "pl", label: "Profit and loss", icon: Scale, ranged: true },
    { key: "bs", label: "Balance sheet", icon: FileSpreadsheet, ranged: true, asOf: true },
  ] },
  { label: "Money", items: [
    { key: "banking", label: "Banking", icon: Landmark, ranged: true },
    { key: "shifts", label: "Shift reports", icon: ClipboardCheck, ranged: true },
    { key: "cashbook", label: "Cash book", icon: Wallet, ranged: true, max: 400 },
    { key: "ledger", label: "Payments", icon: BookOpenCheck, ranged: true },
  ] },
  { label: "Owed and spent", items: [
    { key: "receivables", label: "Receivables", icon: ReceiptText },
    { key: "payables", label: "Payables", icon: HandCoins, ranged: true },
    { key: "expenses", label: "Expenses", icon: FileSpreadsheet, ranged: true },
  ] },
  { label: "Month end", items: [{ key: "close", label: "Close month", icon: Lock }] },
];
const SECTIONS = GROUPS.flatMap((g) => g.items);

// Finance and accounting: the accountant's home, the double-entry books, statements, banking and month-end close.
export default function AccountsPage() {
  const canRecord = useCan()("accounts.record");
  const [params, setParams] = useSearchParams();
  const today = todayUtc();
  const [period, setPeriod] = useState({ preset: "mtd", ...rangeForPreset("mtd", today) });
  const [ledgerCode, setLedgerCode] = useState("1000");
  const requested = params.get("sub");
  const sub = SECTIONS.some((s) => s.key === requested) ? requested : "home";
  const section = SECTIONS.find((s) => s.key === sub);
  const go = (key) => {
    const next = new URLSearchParams(params);
    next.set("sub", key);
    setParams(next, { replace: false });
    window.scrollTo({ top: 0 });
  };
  const openAccount = (code) => {
    setLedgerCode(code);
    go("gl");
  };
  const range = { from: period.from, to: period.to };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Accounts</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Double-entry books kept automatically from every payment, expense, payout and transfer. Amounts in Ghana cedis.</p>
      </div>

      {!canRecord && (
        <p role="status" className="rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-sm text-muted-foreground">
          You can look at the accounts but not change them. Ask an admin if you need to record something.
        </p>
      )}

      {/* Phone: one picker. Wider screens: the sections down the side. */}
      <div className="lg:hidden">
        <label htmlFor="accounts-section" className="sr-only">Section</label>
        <select id="accounts-section" value={sub} onChange={(e) => go(e.target.value)}
          className="w-full h-11 rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground">
          {GROUPS.map((g) => g.label
            ? <optgroup key={g.label} label={g.label}>{g.items.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>
            : g.items.map((s) => <option key={s.key} value={s.key}>{s.label}</option>))}
        </select>
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Accounts sections" className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {GROUPS.map((g, i) => (
              <div key={g.label || i}>
                {g.label && <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>}
                <ul className="space-y-0.5">
                  {g.items.map((s) => (
                    <li key={s.key}>
                      <button type="button" onClick={() => go(s.key)} aria-current={sub === s.key ? "page" : undefined}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${sub === s.key ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                        <s.icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {section.ranged && (
            <PeriodPicker
              value={period}
              onPreset={(preset) => setPeriod({ preset, ...rangeForPreset(preset, today) })}
              onCustom={(from, to) => setPeriod({ preset: "custom", from, to })}
              max={section.max || 800}
            />
          )}
          {sub === "home" && <Home onGo={go} />}
          {sub === "journal" && <Journal {...range} />}
          {sub === "gl" && <GeneralLedger key={ledgerCode} {...range} initialCode={ledgerCode} />}
          {sub === "trial" && <TrialBalance {...range} onOpenAccount={openAccount} />}
          {sub === "chart" && <ChartOfAccounts />}
          {sub === "overview" && <Overview {...range} />}
          {sub === "pl" && <ProfitLoss {...range} />}
          {sub === "bs" && <BalanceSheet to={period.to} />}
          {sub === "banking" && <Banking {...range} />}
          {sub === "shifts" && <ShiftReview {...range} />}
          {sub === "cashbook" && <CashBook {...range} />}
          {sub === "ledger" && <Ledger {...range} />}
          {sub === "receivables" && <Receivables />}
          {sub === "payables" && <Payables {...range} />}
          {sub === "expenses" && <Expenses {...range} />}
          {sub === "close" && <CloseMonth onGo={go} />}
        </div>
      </div>
    </div>
  );
}
