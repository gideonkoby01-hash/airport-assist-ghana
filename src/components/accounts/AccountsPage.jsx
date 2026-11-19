import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpenCheck, FileSpreadsheet, HandCoins, LayoutGrid, ReceiptText, Scale, Wallet } from "lucide-react";
import { todayUtc } from "@/lib/bookingFormRules";
import { rangeForPreset } from "@/lib/finance";
import PeriodPicker from "@/components/charts/PeriodPicker";
import Overview from "./Overview";
import Ledger from "./Ledger";
import Receivables from "./Receivables";
import CashBook from "./CashBook";
import Expenses from "./Expenses";
import ProfitLoss from "./ProfitLoss";
import Payables from "./Payables";

const SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutGrid, ranged: true },
  { key: "ledger", label: "Ledger", icon: BookOpenCheck, ranged: true },
  { key: "receivables", label: "Receivables", icon: ReceiptText, ranged: false },
  { key: "cashbook", label: "Cash book", icon: Wallet, ranged: true },
  { key: "expenses", label: "Expenses", icon: FileSpreadsheet, ranged: true },
  { key: "pl", label: "Profit and loss", icon: Scale, ranged: true },
  { key: "payables", label: "Payables", icon: HandCoins, ranged: true },
];

// Finance and accounting for admin and management: what came in, what went out, who owes what, and the profit.
export default function AccountsPage() {
  const [params, setParams] = useSearchParams();
  const today = todayUtc();
  const [period, setPeriod] = useState({ preset: "mtd", ...rangeForPreset("mtd", today) });
  const requested = params.get("sub");
  const sub = SECTIONS.some((s) => s.key === requested) ? requested : "overview";
  const section = SECTIONS.find((s) => s.key === sub);
  const go = (key) => {
    const next = new URLSearchParams(params);
    next.set("sub", key);
    setParams(next, { replace: true });
  };
  const range = { from: period.from, to: period.to };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Accounts</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Finance and accounting. Money counts on the day it was recorded, in Ghana cedis.</p>
      </div>
      <nav aria-label="Accounts sections" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.key)}
            aria-current={sub === s.key ? "page" : undefined}
            className={`shrink-0 inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${sub === s.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <s.icon className="w-4 h-4" aria-hidden="true" /> {s.label}
          </button>
        ))}
      </nav>
      {section.ranged && (
        <PeriodPicker
          value={period}
          onPreset={(preset) => setPeriod({ preset, ...rangeForPreset(preset, today) })}
          onCustom={(from, to) => setPeriod({ preset: "custom", from, to })}
          max={sub === "cashbook" ? 400 : 800}
        />
      )}
      {sub === "overview" && <Overview {...range} />}
      {sub === "ledger" && <Ledger {...range} />}
      {sub === "receivables" && <Receivables />}
      {sub === "cashbook" && <CashBook {...range} />}
      {sub === "expenses" && <Expenses {...range} />}
      {sub === "pl" && <ProfitLoss {...range} />}
      {sub === "payables" && <Payables {...range} />}
    </div>
  );
}
