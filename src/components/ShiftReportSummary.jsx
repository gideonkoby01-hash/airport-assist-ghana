import React from "react";
import { formatGHS, REPORT_SERVICE_LABELS, REPORT_PAYMENT_LABELS, PORTER_COMMISSION_PER_PASSENGER, SHIFT_LABELS } from "@/lib/packages";

export default function ShiftReportSummary({ report }) {
  if (!report) return null;

  const meetAssist = report.meet_assist_entries || [];
  const porterEntries = report.porter_entries || [];

  const counts = {
    departure_only: meetAssist.filter((e) => e.service_type === "departure_only").length,
    full_departure: meetAssist.filter((e) => e.service_type === "full_departure").length,
    arrival: meetAssist.filter((e) => e.service_type === "arrival").length,
  };

  const totalsByMethod = {
    pos: meetAssist.filter((e) => e.payment_method === "pos").reduce((s, e) => s + (e.amount_paid || 0), 0),
    cash: meetAssist.filter((e) => e.payment_method === "cash").reduce((s, e) => s + (e.amount_paid || 0), 0),
    momo: meetAssist.filter((e) => e.payment_method === "momo").reduce((s, e) => s + (e.amount_paid || 0), 0),
  };

  const meetAssistTotal =
    report.meet_assist_total_paid != null
      ? report.meet_assist_total_paid
      : meetAssist.reduce((s, e) => s + (e.amount_paid || 0), 0);
  const porterTotalPassengers =
    report.porter_total_passengers != null
      ? report.porter_total_passengers
      : porterEntries.reduce((s, e) => s + (e.passengers_handled || 0), 0);
  const porterTotalCommission =
    report.porter_total_commission != null
      ? report.porter_total_commission
      : porterEntries.reduce((s, e) => s + (e.commission || 0), 0);
  const grandTotal =
    report.grand_total_paid != null
      ? report.grand_total_paid
      : meetAssistTotal + (report.porter_amount_paid || 0);

  return (
    <div className="space-y-5">
      <div className="bg-secondary rounded-lg p-4 grid sm:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Reporting Period</p>
          <p className="font-semibold">{report.reporting_period_start} · {SHIFT_LABELS[report.shift_type] || report.shift_type || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Supervisor</p>
          <p className="font-semibold">{report.supervisor_name || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Submitted</p>
          <p className="font-semibold">{report.created_date ? new Date(report.created_date).toLocaleString() : "—"}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">A. Meet & Assist</h3>
        {meetAssist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meet & assist entries.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-3">#</th>
                    <th className="pb-2 pr-3">Service Type</th>
                    <th className="pb-2 pr-3 text-right">Amount Paid</th>
                    <th className="pb-2">Payment Method</th>
                  </tr>
                </thead>
                <tbody>
                  {meetAssist.map((e, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-3">{i + 1}</td>
                      <td className="py-2 pr-3">{REPORT_SERVICE_LABELS[e.service_type] || e.service_type}</td>
                      <td className="py-2 pr-3 text-right">{formatGHS(e.amount_paid)}</td>
                      <td className="py-2">{REPORT_PAYMENT_LABELS[e.payment_method] || e.payment_method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Service Counts</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Departure Only</span><span className="font-medium">{counts.departure_only}</span></div>
                  <div className="flex justify-between"><span>Full Departure Service</span><span className="font-medium">{counts.full_departure}</span></div>
                  <div className="flex justify-between"><span>Arrival Service</span><span className="font-medium">{counts.arrival}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Total</span><span className="font-semibold">{meetAssist.length}</span></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Amounts by Payment Method</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>POS</span><span className="font-medium">{formatGHS(totalsByMethod.pos)}</span></div>
                  <div className="flex justify-between"><span>Cash</span><span className="font-medium">{formatGHS(totalsByMethod.cash)}</span></div>
                  <div className="flex justify-between"><span>MoMo</span><span className="font-medium">{formatGHS(totalsByMethod.momo)}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Total</span><span className="font-semibold">{formatGHS(meetAssistTotal)}</span></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">B. Porter</h3>
        {porterEntries.length === 0 && !report.porter_total_bookings ? (
          <p className="text-sm text-muted-foreground">No porter entries.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-4 text-sm">
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Porter Bookings</p>
                <p className="font-semibold mt-0.5">{report.porter_total_bookings || 0}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Amount Paid</p>
                <p className="font-semibold mt-0.5">{formatGHS(report.porter_amount_paid || 0)}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Payment Method</p>
                <p className="font-semibold mt-0.5">{REPORT_PAYMENT_LABELS[report.porter_payment_method] || "—"}</p>
              </div>
            </div>
            {porterEntries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-3">#</th>
                      <th className="pb-2 pr-3">Porter</th>
                      <th className="pb-2 pr-3 text-right">Passengers</th>
                      <th className="pb-2 text-right">Commission ({formatGHS(PORTER_COMMISSION_PER_PASSENGER)}/pax)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porterEntries.map((e, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 pr-3">{i + 1}</td>
                        <td className="py-2 pr-3">{e.porter_name}</td>
                        <td className="py-2 pr-3 text-right">{e.passengers_handled}</td>
                        <td className="py-2 text-right">{formatGHS(e.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={2} className="pt-2 font-semibold text-right">Total</td>
                      <td className="pt-2 text-right font-semibold">{porterTotalPassengers}</td>
                      <td className="pt-2 text-right font-semibold">{formatGHS(porterTotalCommission)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-primary text-primary-foreground rounded-xl p-5 flex items-center justify-between">
        <span className="font-semibold">Grand Total Paid</span>
        <span className="text-xl font-bold">{formatGHS(grandTotal)}</span>
      </div>

      {report.remarks && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Remarks</p>
          <p className="text-sm whitespace-pre-line">{report.remarks}</p>
        </div>
      )}
    </div>
  );
}