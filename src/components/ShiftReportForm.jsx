import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ArrowLeft, FileText, Eye, CalendarDays, Banknote } from "lucide-react";
import { formatGHS, SHIFT_LABELS } from "@/lib/packages";
import ShiftReportSummary from "@/components/ShiftReportSummary";

// The shift report is built by the system from the payments ledger: everything you recorded during the shift.
// You check it, count the cash in your hand and submit. A submitted report cannot be edited.
export default function ShiftReportForm({ supervisor }) {
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [shiftType, setShiftType] = useState("morning");
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [cashCounted, setCashCounted] = useState("");
  const [remarks, setRemarks] = useState("");

  const [reports, setReports] = useState([]);
  const [viewingReport, setViewingReport] = useState(null);
  const [submittedReport, setSubmittedReport] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notifyWarning, setNotifyWarning] = useState("");

  const loadReports = useCallback(async () => {
    try {
      const page = await api.entities.ShiftReport.filter({ supervisor_id: supervisor.id }, { sort: "-created_date", limit: 20 });
      setReports(page.items || []);
    } catch {
      setReports([]);
    }
  }, [supervisor.id]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Whenever the shift changes, ask the system what it has recorded for it.
  useEffect(() => {
    let active = true;
    setLoadingPreview(true);
    setPreview(null);
    setError("");
    api.functions
      .invoke("previewShiftReport", { period_start: periodStart, shift_type: shiftType })
      .then((res) => { if (active) setPreview(res.data.report); })
      .catch((e) => { if (active) setError(e.message || "Could not load this shift."); })
      .finally(() => { if (active) setLoadingPreview(false); });
    return () => { active = false; };
  }, [periodStart, shiftType]);

  const expectedCash = Number(preview?.cash_expected || 0);
  const variance = cashCounted === "" ? null : Math.round((Number(cashCounted) - expectedCash) * 100) / 100;
  const already = reports.some((r) => r.reporting_period_start === periodStart && r.shift_type === shiftType);

  const submit = async () => {
    setError("");
    if (cashCounted === "" || Number(cashCounted) < 0) return setError("Count the cash you hold and enter it (0 if none).");
    setSaving(true);
    try {
      const res = await api.functions.invoke("submitShiftReport", {
        period_start: periodStart, shift_type: shiftType, cash_counted: Number(cashCounted), remarks: remarks.trim(),
      });
      setSubmittedReport(res.data.report);
      setNotifyWarning(res.data.notify_warning || "");
      loadReports();
    } catch (e) {
      setError(e.message || "Failed to submit the report.");
    } finally {
      setSaving(false);
    }
  };

  const startAgain = () => {
    setSubmittedReport(null); setCashCounted(""); setRemarks(""); setError(""); setNotifyWarning("");
  };

  if (submittedReport) {
    return (
      <div className="space-y-5">
        <div className="bg-card rounded-2xl border border-emerald-200 p-6 text-center">
          <FileText className="w-12 h-12 text-emerald-600 mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-lg font-bold">Report submitted</h3>
          <p className="text-sm text-muted-foreground mt-1">{submittedReport.reporting_period_start} · {SHIFT_LABELS[submittedReport.shift_type]}</p>
        </div>
        {notifyWarning && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">{notifyWarning}</div>}
        <ShiftReportSummary report={submittedReport} />
        <Button onClick={startAgain}>Done</Button>
      </div>
    );
  }

  if (viewingReport) {
    return (
      <div className="space-y-5">
        <Button variant="outline" onClick={() => setViewingReport(null)}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        <ShiftReportSummary report={viewingReport} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-accent" aria-hidden="true" /> Which shift?</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sr-date">Shift date</Label>
            <Input id="sr-date" type="date" max={today} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sr-shift">Shift</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger id="sr-shift"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning Shift</SelectItem>
                <SelectItem value="night">Night Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {preview && <p className="text-xs text-muted-foreground mt-2">Covers {preview.shift_start.replace("T", " ")} to {preview.shift_end.replace("T", " ")} (Ghana time).</p>}
      </div>

      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">{error}</div>}
      {loadingPreview && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Reading what you recorded this shift…</div>}

      {preview && (
        <>
          <ShiftReportSummary report={{ ...preview, supervisor_name: supervisor.full_name || supervisor.email, created_date: null }} />
          {Number(preview.porters_missing) > 0 && (
            <p role="alert" className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3">
              {preview.porters_missing === 1 ? "A service" : `${preview.porters_missing} services`} sold in this shift ({(preview.porters_missing_refs || []).join(", ")}) {preview.porters_missing === 1 ? "has" : "have"} too few porters on {preview.porters_missing === 1 ? "it" : "them"}.
              Open {preview.porters_missing === 1 ? "the booking" : "each booking"} and assign porters, then reload this page. One porter handles one passenger, so the report cannot be submitted until every passenger has a porter.
            </p>
          )}
          {Number(preview.porters_awaiting_management) > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.porters_awaiting_management} website booking{preview.porters_awaiting_management === 1 ? "" : "s"} {preview.porters_awaiting_management === 1 ? "is" : "are"} still waiting for management to assign a porter. {preview.porters_awaiting_management === 1 ? "It does" : "They do"} not hold up your report.
            </p>
          )}
          {Number(preview.grand_total_paid) === 0 && Number(preview.booking_count) === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing was recorded for this shift. If you did take money, record it first (under Sales or the booking's Payment box) and reload this page; sales cannot be added to a report by hand.
            </p>
          )}

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote className="w-4 h-4 text-accent" aria-hidden="true" /> Cash check</h3>
            <p className="text-sm">The system expects <strong>{formatGHS(expectedCash)}</strong> in cash from this shift. Count what you hold and enter it.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sr-cash">Cash counted (GHS)</Label>
                <Input id="sr-cash" type="number" min={0} value={cashCounted} onChange={(e) => setCashCounted(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Difference</Label>
                <p className={`h-10 flex items-center text-sm font-semibold ${variance === null ? "text-muted-foreground" : variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {variance === null ? "—" : variance === 0 ? "Matches" : `${variance > 0 ? "Over" : "Short"} by ${formatGHS(Math.abs(variance))}`}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-remarks">Remarks (optional, say why if the cash does not match)</Label>
              <Textarea id="sr-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={1000} />
            </div>
            {already && <p className="text-sm text-amber-700">A report for this shift has already been submitted. Ask an admin if it needs to be redone.</p>}
            <Button onClick={submit} disabled={saving || already || Number(preview.porters_missing) > 0}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Submit report
            </Button>
            <p className="text-xs text-muted-foreground">Once submitted, a report cannot be changed.</p>
          </div>
        </>
      )}

      {reports.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-3">Your recent reports</h3>
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <span>{r.reporting_period_start} · {SHIFT_LABELS[r.shift_type] || r.shift_type} · {formatGHS(r.grand_total_paid)}</span>
                <Button size="sm" variant="outline" onClick={() => setViewingReport(r)}><Eye className="w-4 h-4 mr-1" /> View</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
