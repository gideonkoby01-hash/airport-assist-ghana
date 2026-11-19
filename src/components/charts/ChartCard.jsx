import React, { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A card around one chart: a title that says what is plotted, a legend for two or more series, and a "Table" switch so
 * every value can be read without hovering. `columns` is [{ key, label, align?, render? }] and `rows` the table's rows.
 */
export default function ChartCard({ title, subtitle = undefined, legend = undefined, columns = undefined, rows = undefined, loading = false, className = "", children }) {
  const [table, setTable] = useState(false);
  const canTable = Boolean(columns && rows && rows.length);
  return (
    <section className={cn("bg-card rounded-2xl border border-border p-4 sm:p-5 flex flex-col", className)} aria-label={title}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {canTable && (
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md px-2 py-1 hover:bg-secondary"
          >
            {table ? <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" /> : <Table2 className="w-3.5 h-3.5" aria-hidden="true" />}
            {table ? "Chart" : "Table"}
          </button>
        )}
      </header>
      {legend && !table && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
      <div className={cn("mt-3 flex-1 transition-opacity", loading && "opacity-50")}>
        {table && canTable ? (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  {columns.map((c) => (<th key={c.key} className={cn("py-2 pr-3 font-medium", c.align === "right" && "text-right")}>{c.label}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {columns.map((c) => (<td key={c.key} className={cn("py-1.5 pr-3 tabular", c.align === "right" && "text-right")}>{c.render ? c.render(r) : r[c.key]}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** A legend key: a short line or a swatch, then the name in ordinary text. */
export function Key({ colour, label, line = false }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={line ? "inline-block w-4 h-0.5 rounded" : "inline-block w-2.5 h-2.5 rounded-sm"} style={{ background: colour }} />
      {label}
    </span>
  );
}
