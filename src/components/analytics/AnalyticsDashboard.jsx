import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpRight, Loader2, RefreshCw, Star } from "lucide-react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { formatGHS, PAYMENT_METHOD_LABELS } from "@/lib/packages";
import { todayUtc } from "@/lib/bookingFormRules";
import { compact, rangeForPreset, receivedByChannel, share } from "@/lib/finance";
import PeriodPicker from "@/components/charts/PeriodPicker";
import KpiTile from "@/components/charts/KpiTile";
import ChartCard, { Key } from "@/components/charts/ChartCard";
import TrendChart from "@/components/charts/TrendChart";
import ColumnChart from "@/components/charts/ColumnChart";
import RankedBars from "@/components/charts/RankedBars";
import SegmentedBar from "@/components/charts/SegmentedBar";
import Heatmap from "@/components/charts/Heatmap";
import { CHANNEL_COLOURS, DIRECTION_COLOURS, METHOD_COLOURS, PACKAGE_COLOURS, SERIES, STATUS_COLOURS, NEUTRAL } from "@/components/charts/theme";

const STATUS_LABELS = { confirmed: "Confirmed", assigned: "Assigned", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const n = (x) => Number(x) || 0;
const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (part, whole) => (n(whole) === 0 ? 0 : n(part) / n(whole));
const pctLabel = (f) => `${Math.round(f * 100)}%`;

function Section({ title, children, note = undefined }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  );
}

// The dashboard's analytics: one date range scopes every figure and chart below it, and every figure compares with the range just before.
export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const canOpenCustomers = user?.role === "admin" || user?.role === "management";
  const today = todayUtc();
  const [period, setPeriod] = useState({ preset: "30d", ...rangeForPreset("30d", today) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.finance.dashboard(period.from, period.to));
    } catch (e) {
      setError(e.message || "Could not load the analytics.");
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);
  useEffect(() => {
    load();
  }, [load]);

  const cur = data?.current;
  const prev = data?.previous;
  const daily = data?.daily || [];

  const derived = useMemo(() => {
    if (!cur) return null;
    const net = (k) => n(k.collected) - n(k.porter_commission) - n(k.supervisor_commission) - n(k.expenses);
    const rate = (k, field) => pct(k[field], k.bookings);
    return {
      net: net(cur), prevNet: net(prev || {}),
      completion: rate(cur, "completed"), prevCompletion: rate(prev || {}, "completed"),
      cancel: rate(cur, "cancelled"), prevCancel: rate(prev || {}, "cancelled"),
      noShow: rate(cur, "no_show"), prevNoShow: rate(prev || {}, "no_show"),
      online: pct(cur.online_bookings, cur.live_bookings), prevOnline: pct(prev?.online_bookings, prev?.live_bookings),
    };
  }, [cur, prev]);

  const got = useMemo(() => receivedByChannel(data?.by_method), [data]);
  const avg = (k) => (n(k?.live_bookings) === 0 ? 0 : n(k.billed) / n(k.live_bookings));
  const spark = (key) => daily.map((d) => d[key]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data ? `${day(data.range.from)} to ${day(data.range.to)} (${data.range.days} day${data.range.days === 1 ? "" : "s"}), compared with ${day(data.range.previous_from)} to ${day(data.range.previous_to)}.` : "Loading…"}
              {" "}Volumes are by flight date; money is by the day it was recorded.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />} Refresh
          </Button>
        </div>
        <PeriodPicker
          value={period}
          onPreset={(preset) => setPeriod({ preset, ...rangeForPreset(preset, today) })}
          onCustom={(from, to) => setPeriod({ preset: "custom", from, to })}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">The analytics could not be loaded.</p>
            <p className="text-xs mt-0.5">{error} If this is new, the Accounts database update may not have been run yet.</p>
          </div>
        </div>
      )}

      {!data && loading && <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading the analytics…</div>}

      {data && cur && derived && (
        <div className={loading ? "opacity-60 transition-opacity space-y-8" : "space-y-8 transition-opacity"}>
          <Section title="The headline figures">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile accent label="Billed (service value)" value={formatGHS(cur.billed)} current={cur.billed} previous={prev.billed} trend={spark("billed")} sub={`${n(cur.live_bookings)} bookings, ${n(cur.passengers)} passengers`} />
              <KpiTile label="Money received (net of refunds)" value={formatGHS(cur.collected)} current={cur.collected} previous={prev.collected} trend={spark("collected")} />
              <KpiTile label="Still owed on these bookings" value={formatGHS(cur.outstanding)} current={cur.outstanding} previous={prev.outstanding} upIsGood={false} sub={`${share(cur.outstanding, cur.billed)} of billed`} />
              <KpiTile label="Profit after commissions and expenses" value={formatGHS(derived.net)} current={derived.net} previous={derived.prevNet} sub="Cash basis" />
              <KpiTile label="Bookings" value={n(cur.live_bookings).toLocaleString("en-GB")} current={cur.live_bookings} previous={prev.live_bookings} trend={spark("bookings")} />
              <KpiTile label="Passengers" value={n(cur.passengers).toLocaleString("en-GB")} current={cur.passengers} previous={prev.passengers} trend={spark("passengers")} />
              <KpiTile label="Average booking value" value={formatGHS(avg(cur))} current={avg(cur)} previous={avg(prev)} />
              <KpiTile label="New customers" value={n(cur.new_customers).toLocaleString("en-GB")} current={cur.new_customers} previous={prev.new_customers} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Money received, by how it was paid">
              <KpiTile label="Received in cash" value={formatGHS(got.cash)} sub={`${share(got.cash, got.total)} of money received`} />
              <KpiTile label="Received by POS" value={formatGHS(got.pos)} sub={`Mobile money ${formatGHS(got.mobile)}, card ${formatGHS(got.card)}`} />
              <KpiTile label="Paid on account" value={formatGHS(got.account)} sub="Corporate accounts" />
              <KpiTile label="Total received (net of refunds)" value={formatGHS(got.total)} sub="Cash + POS + on account" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Completed" value={pctLabel(derived.completion)} current={derived.completion} previous={derived.prevCompletion} sub={`${n(cur.completed)} of ${n(cur.bookings)}`} />
              <KpiTile label="Cancelled" value={pctLabel(derived.cancel)} current={derived.cancel} previous={derived.prevCancel} upIsGood={false} sub={`${n(cur.cancelled)} bookings`} />
              <KpiTile label="No-shows" value={pctLabel(derived.noShow)} current={derived.noShow} previous={derived.prevNoShow} upIsGood={false} sub={`${n(cur.no_show)} bookings`} />
              <KpiTile label="Booked on the website" value={pctLabel(derived.online)} current={derived.online} previous={derived.prevOnline} sub={`${n(cur.online_bookings)} online, ${n(cur.walk_in_bookings)} at the desk`} />
              <KpiTile label="Discounts given" value={formatGHS(cur.discounts)} current={cur.discounts} previous={prev.discounts} upIsGood={false} />
              <KpiTile label="Refunds" value={formatGHS(cur.refunds)} current={cur.refunds} previous={prev.refunds} upIsGood={false} />
              <KpiTile label="Porter and supervisor commission" value={formatGHS(n(cur.porter_commission) + n(cur.supervisor_commission))} current={n(cur.porter_commission) + n(cur.supervisor_commission)} previous={n(prev.porter_commission) + n(prev.supervisor_commission)} upIsGood={false} sub={`Porters ${formatGHS(cur.porter_commission)}, supervisors ${formatGHS(cur.supervisor_commission)}`} />
              <KpiTile label="Expenses" value={formatGHS(cur.expenses)} current={cur.expenses} previous={prev.expenses} upIsGood={false} sub={<Link to="?tab=accounts&sub=expenses" className="underline">Open accounts</Link>} />
            </div>
          </Section>

          <Section title="Trends">
            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard
                title="Billed and received, by day"
                subtitle="What was booked for each flight day, and the money recorded that day."
                legend={<><Key line colour={SERIES[0]} label="Billed" /><Key line colour={SERIES[1]} label="Received (net)" /></>}
                columns={[{ key: "date", label: "Day", render: (r) => day(r.date) }, { key: "billed", label: "Billed", align: "right", render: (r) => formatGHS(r.billed) }, { key: "collected", label: "Received", align: "right", render: (r) => formatGHS(r.collected) }]}
                rows={daily}
              >
                <TrendChart data={daily} tickFormat={day} labelFormat={day} format={formatGHS} series={[{ key: "billed", label: "Billed", colour: SERIES[0] }, { key: "collected", label: "Received (net)", colour: SERIES[1] }]} />
              </ChartCard>
              <ChartCard
                title="Bookings and passengers, by day"
                legend={<><Key line colour={SERIES[0]} label="Bookings" /><Key line colour={SERIES[2]} label="Passengers" /></>}
                columns={[{ key: "date", label: "Day", render: (r) => day(r.date) }, { key: "bookings", label: "Bookings", align: "right" }, { key: "passengers", label: "Passengers", align: "right" }]}
                rows={daily}
              >
                <TrendChart data={daily} tickFormat={day} labelFormat={day} series={[{ key: "bookings", label: "Bookings", colour: SERIES[0] }, { key: "passengers", label: "Passengers", colour: SERIES[2] }]} />
              </ChartCard>
            </div>
          </Section>

          <Section title="What sells, and how people pay">
            <div className="grid lg:grid-cols-3 gap-4">
              <ChartCard title="Revenue by service" subtitle="Billed value, largest first."
                columns={[{ key: "name", label: "Service" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "passengers", label: "Passengers", align: "right" }, { key: "billed", label: "Billed", align: "right", render: (r) => formatGHS(r.billed) }]} rows={data.by_package}>
                <RankedBars items={(data.by_package || []).map((p) => ({ label: p.name, value: n(p.billed), display: formatGHS(p.billed), sub: `${p.bookings} booking${p.bookings === 1 ? "" : "s"}, ${p.passengers} passengers`, colour: PACKAGE_COLOURS[p.code] }))} />
              </ChartCard>
              <ChartCard title="How people pay" subtitle="Money received, net of refunds."
                columns={[{ key: "method", label: "Method", render: (r) => PAYMENT_METHOD_LABELS[r.method] || r.method }, { key: "count", label: "Payments", align: "right" }, { key: "net", label: "Net", align: "right", render: (r) => formatGHS(r.net) }]} rows={data.by_method}>
                <SegmentedBar parts={(data.by_method || []).map((m) => ({ label: PAYMENT_METHOD_LABELS[m.method] || m.method, value: n(m.net), display: formatGHS(m.net), colour: METHOD_COLOURS[m.method] || NEUTRAL }))} />
              </ChartCard>
              <ChartCard title="Where bookings come from" subtitle="Website, or recorded at the desk, and flight direction."
                columns={[{ key: "channel", label: "Channel", render: (r) => (r.channel === "online" ? "Website" : "At the desk") }, { key: "bookings", label: "Bookings", align: "right" }, { key: "billed", label: "Billed", align: "right", render: (r) => formatGHS(r.billed) }]} rows={data.by_channel}>
                <div className="space-y-5">
                  <SegmentedBar parts={(data.by_channel || []).map((c) => ({ label: c.channel === "online" ? "Website" : "At the desk", value: n(c.bookings), display: `${c.bookings} bookings`, colour: CHANNEL_COLOURS[c.channel] || NEUTRAL }))} />
                  <SegmentedBar parts={(data.by_direction || []).map((c) => ({ label: c.direction === "arrival" ? "Arrivals" : "Departures", value: n(c.bookings), display: `${c.bookings} bookings`, colour: DIRECTION_COLOURS[c.direction] || NEUTRAL }))} />
                </div>
              </ChartCard>
            </div>
          </Section>

          <Section title="When people fly" note="Flights by day of the week, and by weekday and scheduled hour. Use it to plan who works when.">
            <div className="grid lg:grid-cols-5 gap-4">
              <ChartCard className="lg:col-span-2" title="Busiest days of the week"
                columns={[{ key: "day", label: "Day" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "billed", label: "Billed", align: "right", render: (r) => formatGHS(r.billed) }]}
                rows={WEEKDAYS.map((d, i) => { const w = (data.by_weekday || []).find((x) => x.weekday === i); return { day: d, bookings: w?.bookings || 0, billed: w?.billed || 0 }; })}>
                <ColumnChart xKey="day" height={210} series={[{ key: "bookings", label: "Bookings", colour: SERIES[0] }]}
                  data={WEEKDAYS.map((d, i) => ({ day: d, bookings: (data.by_weekday || []).find((x) => x.weekday === i)?.bookings || 0 }))} />
              </ChartCard>
              <ChartCard className="lg:col-span-3" title="Flights by weekday and hour"><Heatmap cells={data.heatmap} /></ChartCard>
            </div>
          </Section>

          <Section title="Bookings: how they progress">
            <div className="grid lg:grid-cols-3 gap-4">
              <ChartCard title="Booking outcomes" subtitle="Every booking with a flight in the period."
                columns={[{ key: "status", label: "Status", render: (r) => STATUS_LABELS[r.status] || r.status }, { key: "bookings", label: "Bookings", align: "right" }]} rows={data.by_status}>
                <RankedBars items={(data.by_status || []).map((s) => ({ label: STATUS_LABELS[s.status] || s.status, value: n(s.bookings), display: `${s.bookings} · ${share(s.bookings, cur.bookings)}`, colour: STATUS_COLOURS[s.status] }))} />
              </ChartCard>
              <ChartCard title="How far ahead people book" subtitle={data.lead_time?.average_days != null ? `Website bookings: ${data.lead_time.average_days} days on average.` : "Website bookings."}
                columns={[{ key: "bucket", label: "Ahead by" }, { key: "bookings", label: "Bookings", align: "right" }]} rows={data.lead_time?.buckets || []}>
                <ColumnChart xKey="bucket" height={200} tickFormat={(v) => String(v).replace("Same day", "0d").replace(" days", "d")} series={[{ key: "bookings", label: "Bookings", colour: SERIES[0] }]} data={data.lead_time?.buckets || []} />
              </ChartCard>
              <ChartCard title="Party size" subtitle="Passengers per booking."
                columns={[{ key: "size", label: "Passengers" }, { key: "bookings", label: "Bookings", align: "right" }]} rows={data.party_size || []}>
                <ColumnChart xKey="size" height={200} series={[{ key: "bookings", label: "Bookings", colour: SERIES[2] }]} data={data.party_size || []} />
              </ChartCard>
            </div>
          </Section>

          <Section title="Airlines, nationalities and lounges">
            <div className="grid lg:grid-cols-3 gap-4">
              <ChartCard title="Top airlines" subtitle="Bookings by airline."
                columns={[{ key: "airline", label: "Airline" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "passengers", label: "Passengers", align: "right" }]} rows={data.top_airlines}>
                <RankedBars items={(data.top_airlines || []).map((a) => ({ label: a.airline, value: n(a.bookings), display: `${a.bookings}`, sub: `${a.passengers} passengers` }))} empty="No airlines recorded in this period." />
              </ChartCard>
              <ChartCard title="Nationalities" subtitle="Where travellers say they are from."
                columns={[{ key: "nationality", label: "Nationality" }, { key: "bookings", label: "Bookings", align: "right" }]} rows={data.nationalities}>
                <RankedBars items={(data.nationalities || []).map((a) => ({ label: a.nationality, value: n(a.bookings), display: `${a.bookings}` }))} empty="No nationalities recorded in this period." />
              </ChartCard>
              <ChartCard title="Lounges used"
                columns={[{ key: "lounge", label: "Lounge" }, { key: "bookings", label: "Bookings", align: "right" }]} rows={data.lounges}>
                <RankedBars items={(data.lounges || []).map((a) => ({ label: a.lounge, value: n(a.bookings), display: `${a.bookings}` }))} empty="No lounge recorded in this period." />
              </ChartCard>
            </div>
          </Section>

          <Section title="Team">
            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard title="Supervisors" subtitle="Bookings handled, money and ratings for the period." className="lg:col-span-2">
                {(data.supervisors || []).length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No supervisor activity in this period.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-medium">Supervisor</th><th className="py-2 px-2 text-right font-medium">Bookings</th><th className="py-2 px-2 text-right font-medium">Completed</th>
                        <th className="py-2 px-2 text-right font-medium">Billed</th><th className="py-2 px-2 text-right font-medium">Collected</th><th className="py-2 px-2 text-right font-medium">Owed</th>
                        <th className="py-2 px-2 text-right font-medium">Rating</th><th className="py-2 pl-2 text-right font-medium">Commission</th>
                      </tr></thead>
                      <tbody>
                        {data.supervisors.map((s) => (
                          <tr key={s.supervisor_id || s.name} className="border-b border-border last:border-0">
                            <td className="py-2 pr-3 font-medium">{s.name}</td>
                            <td className="py-2 px-2 text-right tabular">{s.bookings}</td>
                            <td className="py-2 px-2 text-right tabular">{s.completed} <span className="text-xs text-muted-foreground">({share(s.completed, s.bookings)})</span></td>
                            <td className="py-2 px-2 text-right tabular">{formatGHS(s.billed)}</td>
                            <td className="py-2 px-2 text-right tabular">{formatGHS(s.collected)}</td>
                            <td className="py-2 px-2 text-right tabular">{formatGHS(s.outstanding)}</td>
                            <td className="py-2 px-2 text-right tabular">{s.rating ? <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-accent" aria-hidden="true" />{s.rating} <span className="text-xs text-muted-foreground">({s.ratings})</span></span> : "—"}</td>
                            <td className="py-2 pl-2 text-right tabular">{formatGHS(s.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
              <ChartCard title="Porters" subtitle="Commission earned on completed bookings."
                columns={[{ key: "name", label: "Porter" }, { key: "jobs", label: "Jobs", align: "right" }, { key: "passengers", label: "Passengers", align: "right" }, { key: "commission", label: "Commission", align: "right", render: (r) => formatGHS(r.commission) }]} rows={data.porters}>
                <RankedBars items={(data.porters || []).map((p) => ({ label: p.name, value: n(p.commission), display: formatGHS(p.commission), sub: `${p.jobs} job${p.jobs === 1 ? "" : "s"}, ${p.passengers} passengers` }))} empty="No completed porter jobs in this period." />
              </ChartCard>
              <ChartCard title="Customer ratings" subtitle={data.ratings?.count ? `${data.ratings.average} out of 5 from ${data.ratings.count} rating${data.ratings.count === 1 ? "" : "s"}.` : "No ratings for flights in this period."}
                columns={[{ key: "rating", label: "Stars" }, { key: "count", label: "Ratings", align: "right" }]} rows={[...(data.ratings?.distribution || [])].reverse()}>
                <RankedBars items={[...(data.ratings?.distribution || [])].reverse().map((r) => ({ label: `${r.rating} star${r.rating === 1 ? "" : "s"}`, value: n(r.count), display: `${r.count}`, colour: r.rating >= 4 ? SERIES[2] : r.rating === 3 ? SERIES[3] : SERIES[7] }))} empty="No ratings yet." />
              </ChartCard>
            </div>
          </Section>

          <Section title="Customers and discounts">
            <div className="grid lg:grid-cols-3 gap-4">
              <ChartCard title="Customers" subtitle="Active in this period.">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-xl font-semibold tabular">{n(data.customers?.active)}</p><p className="text-xs text-muted-foreground mt-1">Booked</p></div>
                  <div><p className="text-xl font-semibold tabular">{n(data.customers?.returning)}</p><p className="text-xs text-muted-foreground mt-1">Returning</p></div>
                  <div><p className="text-xl font-semibold tabular">{n(data.customers?.new)}</p><p className="text-xs text-muted-foreground mt-1">New</p></div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">Returning means more than one booking in all.{canOpenCustomers && <> <Link to="?tab=customers" className="underline">Open customers</Link></>}</p>
              </ChartCard>
              <ChartCard title="Top customers" subtitle="By billed value."
                columns={[{ key: "name", label: "Customer" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "billed", label: "Billed", align: "right", render: (r) => formatGHS(r.billed) }]} rows={data.top_customers}>
                <RankedBars items={(data.top_customers || []).slice(0, 6).map((c) => ({ label: c.name, value: n(c.billed), display: formatGHS(c.billed), sub: `${c.bookings} booking${c.bookings === 1 ? "" : "s"}` }))} empty="No repeat customers in this period." />
              </ChartCard>
              <ChartCard title="Discount codes" subtitle={`${formatGHS(data.discounts?.given)} given on ${n(data.discounts?.bookings)} booking${n(data.discounts?.bookings) === 1 ? "" : "s"}.`}
                columns={[{ key: "code", label: "Code" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "amount", label: "Amount", align: "right", render: (r) => formatGHS(r.amount) }]} rows={data.discounts?.by_code || []}>
                <RankedBars items={(data.discounts?.by_code || []).map((c) => ({ label: c.code, value: n(c.amount), display: formatGHS(c.amount), sub: `${c.bookings} booking${c.bookings === 1 ? "" : "s"}` }))} empty="No discount codes used in this period." />
              </ChartCard>
            </div>
          </Section>

          <Section title="Money still owed" note="Every unpaid balance, as at the end of the period, by how long since the flight.">
            <ChartCard title="Receivables by age"
              columns={[{ key: "bucket", label: "Since the flight" }, { key: "bookings", label: "Bookings", align: "right" }, { key: "amount", label: "Owed", align: "right", render: (r) => formatGHS(r.amount) }]} rows={data.aging}>
              <div className="grid lg:grid-cols-5 gap-4 items-center">
                <div className="lg:col-span-3">
                  <ColumnChart xKey="bucket" height={200} format={formatGHS} axisFormat={compact} series={[{ key: "amount", label: "Owed", colour: SERIES[1] }]} data={data.aging || []} />
                </div>
                <div className="lg:col-span-2 text-sm space-y-1">
                  <p className="text-2xl font-semibold tabular">{formatGHS((data.aging || []).reduce((t, a) => t + n(a.amount), 0))}</p>
                  <p className="text-muted-foreground">owed on {(data.aging || []).reduce((t, a) => t + n(a.bookings), 0)} bookings.</p>
                  <Link to="?tab=accounts&sub=receivables" className="inline-flex items-center gap-1 text-primary font-medium underline underline-offset-4">See who owes it <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
                </div>
              </div>
            </ChartCard>
          </Section>
        </div>
      )}
    </div>
  );
}
