import React from "react";

/**
 * One whole split into parts, as a thin segmented bar with a legend that carries each name, amount and share.
 * `parts`: [{ label, value, colour, display? }]. Parts at zero draw nothing.
 */
export default function SegmentedBar({ parts }) {
  const list = (parts || []).filter((p) => Number(p.value) > 0);
  const total = list.reduce((n, p) => n + Number(p.value), 0);
  if (!total) return <p className="text-sm text-muted-foreground py-6 text-center">Nothing in this period.</p>;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] rounded-full overflow-hidden" role="img" aria-label={list.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {list.map((p) => (<span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.colour }} title={`${p.label}: ${p.display ?? p.value}`} />))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {list.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-foreground min-w-0"><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.colour }} />{p.label}</span>
            <span className="tabular text-muted-foreground text-right">{p.display ?? p.value} <span className="text-xs">· {Math.round((p.value / total) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
