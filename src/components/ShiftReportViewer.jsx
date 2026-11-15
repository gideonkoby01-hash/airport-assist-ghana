import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import { Loader2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { formatGHS, SHIFT_LABELS } from "@/lib/packages";
import ShiftReportSummary from "@/components/ShiftReportSummary";
import ConfirmAction from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

export default function ShiftReportViewer() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [err, setErr] = useState("");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.ShiftReport.filter({}, { sort: "-created_date", limit: 100 });
      setReports(page.items || []);
    } catch (e) {
      setErr(e.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  // Submitted reports are locked. If one is wrong, an admin removes it (recorded in the audit log) so it can be filed again.
  const removeReport = async (id) => {
    try {
      await api.entities.ShiftReport.delete(id);
      setReports((rs) => rs.filter((r) => r.id !== id));
      setExpanded(null);
    } catch (e) {
      setErr(e.message || "Could not remove the report.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading reports…
      </div>
    );
  }

  if (err) return <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{err}</div>;

  if (reports.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No shift reports submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const isOpen = expanded === r.id;
        const isNewFormat = !!r.reporting_period_start;
        return (
          <div key={r.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : r.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {isNewFormat
                      ? `${r.reporting_period_start} · ${SHIFT_LABELS[r.shift_type] || r.shift_type || ""}`
                      : `${r.shift_date || "—"} · ${r.shift_type || ""}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.supervisor_name || "—"} · Submitted {new Date(r.created_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-sm font-semibold">
                  {r.grand_total_paid != null ? formatGHS(r.grand_total_paid) : formatGHS(r.total_revenue || 0)}
                </p>
                {r.cash_variance != null && Number(r.cash_variance) !== 0 && (
                  <p className="text-xs font-medium text-rose-600">Cash {Number(r.cash_variance) > 0 ? "over" : "short"} {formatGHS(Math.abs(r.cash_variance))}</p>
                )}
                {r.porter_total_commission != null && (
                  <p className="text-xs text-muted-foreground">Commission: {formatGHS(r.porter_total_commission)}</p>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border p-5 bg-secondary/30">
                <ShiftReportSummary report={r} />
                {isAdmin && (
                  <div className="mt-4">
                    <ConfirmAction
                      title="Remove this shift report?"
                      description="The supervisor will be able to file this shift again from the current ledger. The removal is recorded in the audit log."
                      confirmLabel="Remove report"
                      destructive
                      onConfirm={() => removeReport(r.id)}
                    >
                      <Button variant="outline" size="sm" className="text-destructive">Remove so it can be filed again</Button>
                    </ConfirmAction>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}