import React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact } from "@/lib/finance";
import { AXIS } from "./theme";

function Readout({ active = false, payload = [], label = "", series = [], format = (v) => String(v), labelFormat = undefined }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs min-w-[10rem]">
      <p className="text-muted-foreground mb-1.5">{labelFormat ? labelFormat(label) : label}</p>
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
 * Change over time. One series is drawn as an area (a 10% wash under a 2px line); two or more as lines.
 * `series`: [{ key, label, colour, format? }]. A vertical hairline follows the pointer and the tooltip lists every series.
 */
export default function TrendChart({ data, xKey = "date", series, format = (v) => String(v), height = 240, tickFormat = (v) => v, labelFormat = undefined, axisFormat = compact }) {
  const ChartType = series.length === 1 ? AreaChart : LineChart;
  const ticks = Math.max(2, Math.min(8, Math.floor((data?.length || 0) / 2)));
  return (
    <div style={{ height }} role="img" aria-label={`Trend chart: ${series.map((s) => s.label).join(", ")}. Use the Table view for every value.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartType data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
          <XAxis dataKey={xKey} tickFormatter={tickFormat} tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={Math.max(0, Math.ceil((data?.length || 1) / ticks) - 1)} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFormat} width={44} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            content={<Readout series={series} format={format} labelFormat={labelFormat} />}
          />
          {series.map((s) =>
            series.length === 1 ? (
              <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.colour} strokeWidth={2} fill={s.colour} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2, fill: s.colour }} isAnimationActive={false} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.colour} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2, fill: s.colour }} isAnimationActive={false} />
            )
          )}
        </ChartType>
      </ResponsiveContainer>
    </div>
  );
}
