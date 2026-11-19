import React from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/db";
import { formatGHS } from "@/lib/packages";
import { compact, profitAndLoss, share } from "@/lib/finance";
import KpiTile from "@/components/charts/KpiTile";
import ChartCard, { Key } from "@/components/charts/ChartCard";
import TrendChart from "@/components/charts/TrendChart";
import ColumnChart from "@/components/charts/ColumnChart";
import RankedBars from "@/components/charts/RankedBars";
import SegmentedBar from "@/components/charts/SegmentedBar";
import { BAD, METHOD_COLOURS, NEUTRAL, SERIES } from "@/components/charts/theme";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import { LoadState, fmtDate, fmtMonth, methodLabel, useLoad } from "./shared";

const n = (x) => Number(x) || 0;

export default function Overview({ from, to }) {
  const { data, loading, error } = useLoad(() => api.finance.summary(from, to), [from, to]);
  const pl = data ? profitAndLoss(data) : null;
  const daily = (data?.daily || []).map((d) => ({ ...d, net_received: n(d.collected) - n(d.refunds) }));
  return (
    <LoadState loading={loading} error={error} hasData={Boolean(data)}>
      {data && pl && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile accent label="Net profit (cash basis)" value={formatGHS(pl.netProfit)} sub={pl.margin === null ? "No income yet" : `${Math.round(pl.margin * 100)}% of income`} />
            <KpiTile label="Money received" value={formatGHS(data.collected)} sub={`${formatGHS(data.refunds)} refunded`} trend={daily.map((d) => d.collected)} />
            <KpiTile label="Commissions" value={formatGHS(pl.commissions)} sub={`Porters ${formatGHS(data.porter_commission)}, supervisors ${formatGHS(data.supervisor_commission)}`} />
            <KpiTile label="Expenses" value={formatGHS(data.expenses)} trend={daily.map((d) => d.expenses)} />
            <KpiTile label="Billed (service value)" value={formatGHS(data.billed)} sub={`${formatGHS(data.discounts)} in discounts`} />
            <KpiTile label="Owed on these bookings" value={formatGHS(data.outstanding_in_range)} sub={`${share(data.outstanding_in_range, data.billed)} of billed`} />
            <KpiTile label="Owed in total, all dates" value={formatGHS(data.outstanding_now)} sub="Every open balance" />
            <KpiTile label="Written off" value={formatGHS(data.write_offs)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard
              title="Money in and money out, by day"
              subtitle="Received (net of refunds), commissions and expenses."
              legend={<><Key line colour={SERIES[0]} label="Received (net)" /><Key line colour={SERIES[1]} label="Commissions" /><Key line colour={SERIES[7]} label="Expenses" /></>}
              columns={[{ key: "date", label: "Day", render: (r) => fmtDate(r.date) }, { key: "net_received", label: "Received", align: "right", render: (r) => formatGHS(r.net_received) },
                { key: "commissions", label: "Commissions", align: "right", render: (r) => formatGHS(n(r.porter_commission) + n(r.supervisor_commission)) }, { key: "expenses", label: "Expenses", align: "right", render: (r) => formatGHS(r.expenses) }]}
              rows={daily}
            >
              <TrendChart
                data={daily.map((d) => ({ ...d, commissions: n(d.porter_commission) + n(d.supervisor_commission) }))}
                tickFormat={(v) => fmtDate(v).slice(0, 6)} labelFormat={fmtDate} format={formatGHS}
                series={[{ key: "net_received", label: "Received (net)", colour: SERIES[0] }, { key: "commissions", label: "Commissions", colour: SERIES[1] }, { key: "expenses", label: "Expenses", colour: SERIES[7] }]}
              />
            </ChartCard>
            <ChartCard
              title="Profit by month"
              subtitle="Last 12 months: received less refunds, commissions and expenses."
              columns={[{ key: "month", label: "Month", render: (r) => fmtMonth(r.month) }, { key: "net", label: "Profit", align: "right", render: (r) => formatGHS(r.net) }]}
              rows={data.monthly}
            >
              <ColumnChart xKey="label" height={240} format={formatGHS} series={[{ key: "net", label: "Profit", colour: SERIES[2] }]}
                data={(data.monthly || []).map((m) => ({ ...m, label: fmtMonth(m.month).slice(0, 3) }))} />
            </ChartCard>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <ChartCard title="By payment method" subtitle="Net of refunds."
              columns={[{ key: "method", label: "Method", render: (r) => methodLabel(r.method) }, { key: "collected", label: "In", align: "right", render: (r) => formatGHS(r.collected) }, { key: "refunds", label: "Refunds", align: "right", render: (r) => formatGHS(r.refunds) }, { key: "net", label: "Net", align: "right", render: (r) => formatGHS(r.net) }]}
              rows={data.by_method}>
              <SegmentedBar parts={(data.by_method || []).map((m) => ({ label: methodLabel(m.method), value: n(m.net), display: formatGHS(m.net), colour: METHOD_COLOURS[m.method] || NEUTRAL }))} />
            </ChartCard>
            <ChartCard title="Expenses by category"
              columns={[{ key: "category", label: "Category", render: (r) => EXPENSE_CATEGORY_LABELS[r.category] || r.category }, { key: "amount", label: "Amount", align: "right", render: (r) => formatGHS(r.amount) }]}
              rows={data.expenses_by_category}>
              <RankedBars colour={BAD} items={(data.expenses_by_category || []).map((c) => ({ label: EXPENSE_CATEGORY_LABELS[c.category] || c.category, value: n(c.amount), display: formatGHS(c.amount) }))} empty="No expenses recorded in this period." />
            </ChartCard>
            <ChartCard title="Where the money goes" subtitle="Each GHS 100 received.">
              <RankedBars items={[
                { label: "Commissions", value: pl.netIncome > 0 ? (pl.commissions / pl.netIncome) * 100 : 0, display: `GHS ${pl.netIncome > 0 ? (pl.commissions / pl.netIncome * 100).toFixed(1) : "0.0"}`, colour: SERIES[1] },
                { label: "Expenses", value: pl.netIncome > 0 ? (pl.operating / pl.netIncome) * 100 : 0, display: `GHS ${pl.netIncome > 0 ? (pl.operating / pl.netIncome * 100).toFixed(1) : "0.0"}`, colour: SERIES[7] },
                { label: "Profit kept", value: pl.netIncome > 0 ? Math.max(0, (pl.netProfit / pl.netIncome) * 100) : 0, display: `GHS ${pl.netIncome > 0 ? (pl.netProfit / pl.netIncome * 100).toFixed(1) : "0.0"}`, colour: SERIES[2] },
              ]} empty="Nothing received yet in this period." />
            </ChartCard>
          </div>

          <p className="text-xs text-muted-foreground">
            Cash basis: money counts on the day it was recorded. Commissions are what porters and supervisors earned on the same days. For the full statement see{" "}
            <Link to="?tab=accounts&sub=pl" className="underline">Profit and loss</Link>. Axis figures are shortened (for example {compact(12900)}).
          </p>
        </div>
      )}
    </LoadState>
  );
}
