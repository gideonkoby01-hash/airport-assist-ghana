import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact } from "@/lib/finance";
import { AXIS } from "./theme";

function Readout({ active = false, payload = [], label = "", series = [], format = (v) => String(v) }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs min-w-[9rem]">
      <p className="text-muted-foreground mb-1.5">{label}</p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="inline-block w-3 h-0.5 rounded" style={{ background: s.colour }} />{s.label}
            </span>
            <span className="font-semibold text-foreground tabular">{(s.format || format)(p.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Columns by category (or by month). Columns are at most 24px wide with a 4px rounded top; stacked segments are
 * separated by a 2px gap in the surface colour. `series`: [{ key, label, colour, format? }].
 */
export default function ColumnChart({ data, xKey, series, stacked = false, format = (v) => String(v), height = 240, tickFormat = (v) => v, axisFormat = compact }) {
  return (
    <div style={{ height }} role="img" aria-label={`Column chart: ${series.map((s) => s.label).join(", ")}. Use the Table view for every value.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
          <XAxis dataKey={xKey} tickFormatter={tickFormat} tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFormat} width={44} allowDecimals={false} />
          <Tooltip cursor={{ fill: "hsl(var(--secondary))", opacity: 0.6 }} content={<Readout series={series} format={format} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.colour}
              stackId={stacked ? "a" : undefined}
              maxBarSize={24}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
              stroke={stacked ? "hsl(var(--card))" : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
