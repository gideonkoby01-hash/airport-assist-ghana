import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, ArrowLeft, FileText, Eye, CalendarDays } from "lucide-react";
import {
  formatGHS,
  PORTER_COMMISSION_PER_PASSENGER } from
"@/lib/packages";
import ShiftReportSummary from "@/components/ShiftReportSummary";

const SERVICE_TYPES = [
{ value: "departure_only", label: "Departure Only" },
{ value: "full_departure", label: "Full Departure Service" },
{ value: "arrival", label: "Arrival Service" }];


const PAYMENT_METHODS = [
{ value: "pos", label: "POS" },
{ value: "cash", label: "Cash" },
{ value: "momo", label: "MoMo" }];


export default function ShiftReportForm({ supervisor }) {
  const today = new Date().toISOString().slice(0, 10);
  const [view, setView] = useState("form");
  const [submittedReport, setSubmittedReport] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);

  const [periodStart, setPeriodStart] = useState(today);
  const [shiftType, setShiftType] = useState("morning");
  const [meetAssistEntries, setMeetAssistEntries] = useState([
  { service_type: "", amount_paid: "", payment_method: "" }]
  );
  const [porterTotalBookings, setPorterTotalBookings] = useState("");
  const [porterAmountPaid, setPorterAmountPaid] = useState("");
  const [porterEntries, setPorterEntries] = useState([]);
  const [remarks, setRemarks] = useState("");

  const [porters, setPorters] = useState([]);
  const [reports, setReports] = useState([]);
  const [supervisorFullName, setSupervisorFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [notifyWarning, setNotifyWarning] = useState("");

  const loadPorters = async () => {
    try {
      const page = await api.entities.Porter.filter({ active: true }, { sort: "full_name" });
      setPorters(page.items || []);
    } catch {}
  };

  const loadSupervisorName = async () => {
    try {
      const page = await api.entities.SupervisorDirectory.filter({ user_id: supervisor.id });
      const entry = (page.items || [])[0];
      if (entry?.full_name) setSupervisorFullName(entry.full_name);
    } catch {}
  };

  const loadReports = async () => {
    try {
      const page = await api.entities.ShiftReport.filter(
        { supervisor_id: supervisor.id },
        { sort: "-created_date", limit: 20 }
      );
      setReports(page.items || []);
    } catch {}
  };

  useEffect(() => {
    loadPorters();
    loadReports();
    loadSupervisorName();

  }, []);

  const computed = useMemo(() => {
    const validMA = meetAssistEntries.filter(
      (e) => e.service_type && e.payment_method && Number(e.amount_paid) > 0
    );
    const counts = {
      departure_only: validMA.filter((e) => e.service_type === "departure_only").length,
      full_departure: validMA.filter((e) => e.service_type === "full_departure").length,
      arrival: validMA.filter((e) => e.service_type === "arrival").length
    };
    const totalsByMethod = {
      pos: validMA.filter((e) => e.payment_method === "pos").reduce((s, e) => s + Number(e.amount_paid || 0), 0),
      cash: validMA.filter((e) => e.payment_method === "cash").reduce((s, e) => s + Number(e.amount_paid || 0), 0),
      momo: validMA.filter((e) => e.payment_method === "momo").reduce((s, e) => s + Number(e.amount_paid || 0), 0)
    };
    const meetAssistTotal = validMA.reduce((s, e) => s + Number(e.amount_paid || 0), 0);

    const validPorters = porterEntries.filter((e) => e.porter_id && Number(e.passengers_handled) > 0);
    const porterTotalPassengers = validPorters.reduce((s, e) => s + Number(e.passengers_handled || 0), 0);
    const porterTotalCommission = validPorters.reduce((s, e) => s + Number(e.commission || 0), 0);
    const porterAmt = Number(porterAmountPaid || 0);
    const grandTotal = meetAssistTotal + porterAmt;

    return { validMA, validPorters, counts, totalsByMethod, meetAssistTotal, porterTotalPassengers, porterTotalCommission, porterAmt, grandTotal };
  }, [meetAssistEntries, porterEntries, porterAmountPaid]);

  const addMAEntry = () =>
  setMeetAssistEntries([...meetAssistEntries, { service_type: "", amount_paid: "", payment_method: "" }]);
  const removeMAEntry = (idx) => setMeetAssistEntries(meetAssistEntries.filter((_, i) => i !== idx));
  const updateMAEntry = (idx, field, value) => {
    const next = [...meetAssistEntries];
    next[idx] = { ...next[idx], [field]: value };
    setMeetAssistEntries(next);
  };

  const addPorterEntry = () =>
  setPorterEntries([...porterEntries, { porter_id: "", porter_name: "", passengers_handled: "", commission: 0 }]);
  const removePorterEntry = (idx) => setPorterEntries(porterEntries.filter((_, i) => i !== idx));
  const updatePorterEntry = (idx, field, value) => {
    const next = [...porterEntries];
    next[idx] = { ...next[idx], [field]: value };
    if (field === "porter_id") {
      const p = porters.find((p) => p.id === value);
      next[idx].porter_name = p ? p.full_name : "";
      next[idx].porter_phone = p ? p.phone_number : "";
    }
    if (field === "passengers_handled") {
      next[idx].commission = PORTER_COMMISSION_PER_PASSENGER * Number(value || 0);
    }
    setPorterEntries(next);
  };

  const validate = () => {
    if (!periodStart) return "Select a reporting period start date.";
    if (!shiftType) return "Select a shift time.";
    if (computed.validMA.length === 0 && computed.validPorters.length === 0)
    return "Add at least one Meet & Assist entry or Porter entry.";
    for (let i = 0; i < meetAssistEntries.length; i++) {
      const e = meetAssistEntries[i];
      if (e.service_type || e.amount_paid || e.payment_method) {
        if (!e.service_type || !e.payment_method || Number(e.amount_paid) <= 0)
        return `Meet & Assist entry ${i + 1} is incomplete. Fill in service type, amount, and payment method, or remove it.`;
      }
    }
    for (let i = 0; i < porterEntries.length; i++) {
      const e = porterEntries[i];
      if (e.porter_id || e.passengers_handled) {
        if (!e.porter_id || Number(e.passengers_handled) <= 0)
        return `Porter entry ${i + 1} is incomplete. Select a porter and enter passengers handled, or remove it.`;
      }
    }
    return "";
  };

  const buildPayload = () => {
    const payload = {
      supervisor_id: supervisor.id,
      supervisor_name: supervisorFullName || supervisor.full_name || supervisor.email,
      reporting_period_start: periodStart,
      shift_type: shiftType,
      meet_assist_entries: computed.validMA.map((e) => ({
        service_type: e.service_type,
        amount_paid: Number(e.amount_paid),
        payment_method: e.payment_method
      })),
      porter_total_bookings: Number(porterTotalBookings || 0),
      porter_amount_paid: Number(porterAmountPaid || 0),
      porter_entries: computed.validPorters.map((e) => ({
        porter_id: e.porter_id,
        porter_name: e.porter_name,
        porter_phone: e.porter_phone || "",
        passengers_handled: Number(e.passengers_handled),
        commission: Number(e.commission)
      })),
      meet_assist_total_paid: computed.meetAssistTotal,
      porter_total_passengers: computed.porterTotalPassengers,
      porter_total_commission: computed.porterTotalCommission,
      grand_total_paid: computed.grandTotal,
      remarks: remarks.trim()
    };
    return payload;
  };

  const submit = async () => {
    setError("");
    setDuplicateWarning("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      const dup = await api.entities.ShiftReport.filter({
        supervisor_id: supervisor.id,
        reporting_period_start: periodStart,
        shift_type: shiftType
      });
      if ((dup.items || []).length > 0) {
        setDuplicateWarning(
          "A report already exists for this reporting period. View it from your recent reports instead of submitting a duplicate."
        );
        setSaving(false);
        return;
      }
      const rep = await api.entities.ShiftReport.create(buildPayload());
      setSubmittedReport(rep);
      loadReports();
      // Alert Management/Admin (best effort: a failure never undoes the submission).
      try {
        const res = await api.functions.invoke("notifyShiftReport", { shift_report_id: rep.id });
        if (res?.data?.error) throw new Error(res.data.error);
      } catch {
        setNotifyWarning("Your report was submitted, but the staff alert could not be sent. Please inform management.");
      }
    } catch (err) {
      setError(err.message || "Failed to submit report.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSubmittedReport(null);
    setView("form");
    setPeriodStart(today);
    setShiftType("morning");
    setMeetAssistEntries([{ service_type: "", amount_paid: "", payment_method: "" }]);
    setPorterTotalBookings("");
    setPorterAmountPaid("");
    setPorterEntries([]);
    setRemarks("");
    setError("");
    setDuplicateWarning("");
    setNotifyWarning("");
  };

  if (submittedReport) {
    return (
      <div className="space-y-5">
        <div className="bg-card rounded-2xl border border-emerald-200 p-6 text-center">
          <FileText className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold">Report submitted successfully</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {submittedReport.reporting_period_start} to {submittedReport.reporting_period_end}
          </p>
        </div>
        {notifyWarning &&
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {notifyWarning}
          </div>
        }
        <ShiftReportSummary report={submittedReport} />
        <Button onClick={resetForm} className="w-full sm:w-auto">
          Submit another report
        </Button>
      </div>);

  }

  if (viewingReport) {
    return (
      <div className="space-y-5">
        <Button variant="outline" onClick={() => setViewingReport(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to form
        </Button>
        <ShiftReportSummary report={viewingReport} />
      </div>);

  }

  if (view === "summary") {
    const previewReport = { ...buildPayload(), created_date: new Date().toISOString() };
    return (
      <div className="space-y-5">
        <h3 className="text-lg font-bold">Report Summary — Review Before Submitting</h3>
        {duplicateWarning &&
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {duplicateWarning}
          </div>
        }
        <ShiftReportSummary report={previewReport} />
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setView("form");
              setDuplicateWarning("");
            }}
            disabled={saving}>
            
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to form
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Submit report
          </Button>
        </div>
      </div>);

  }

  const v = validate();
  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" /> Reporting Period
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Shift Date </Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Shift time</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning Shift</SelectItem>
                <SelectItem value="night">Night Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      {duplicateWarning &&
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {duplicateWarning}
        </div>
      }

      {/* Meet & Assist Section */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">A. Meet & Assist</h3>
          <Button size="sm" variant="outline" onClick={addMAEntry}>
            <Plus className="w-4 h-4 mr-1" /> Add Entry
          </Button>
        </div>
        <div className="space-y-3">
          {meetAssistEntries.map((entry, idx) =>
          <div
            key={idx}
            className="grid sm:grid-cols-12 gap-2 items-end border-b border-border pb-3 last:border-0 last:pb-0">
            
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Service Type</Label>
                <Select value={entry.service_type} onValueChange={(val) => updateMAEntry(idx, "service_type", val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) =>
                  <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                  )}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Amount Paid (GHS)</Label>
                <Input
                type="number"
                min="0"
                step="0.01"
                value={entry.amount_paid}
                onChange={(e) => updateMAEntry(idx, "amount_paid", e.target.value)}
                placeholder="0.00" />
              
              </div>
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={entry.payment_method} onValueChange={(val) => updateMAEntry(idx, "payment_method", val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) =>
                  <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                  )}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-1 flex justify-end">
                {meetAssistEntries.length > 1 &&
              <Button size="icon" variant="ghost" onClick={() => removeMAEntry(idx)}>
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </Button>
              }
              </div>
            </div>
          )}
        </div>
        {computed.validMA.length > 0 &&
        <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Service Counts</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Departure Only</span>
                  <span className="font-medium">{computed.counts.departure_only}</span>
                </div>
                <div className="flex justify-between">
                  <span>Full Departure Service</span>
                  <span className="font-medium">{computed.counts.full_departure}</span>
                </div>
                <div className="flex justify-between">
                  <span>Arrival Service</span>
                  <span className="font-medium">{computed.counts.arrival}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold">{computed.validMA.length}</span>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Amounts by Method</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>POS</span>
                  <span className="font-medium">{formatGHS(computed.totalsByMethod.pos)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash</span>
                  <span className="font-medium">{formatGHS(computed.totalsByMethod.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>MoMo</span>
                  <span className="font-medium">{formatGHS(computed.totalsByMethod.momo)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold">{formatGHS(computed.meetAssistTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      {/* Porter Section */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">B. Porter</h3>
          <Button size="sm" variant="outline" onClick={addPorterEntry} disabled={porters.length === 0}>
            <Plus className="w-4 h-4 mr-1" /> Add Porter
          </Button>
        </div>

        {porters.length === 0 &&
        <p className="text-sm text-muted-foreground mb-3">
            No active porters in the directory. Ask an admin to add porters first.
          </p>
        }

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="space-y-1">
            <Label className="text-xs">Total Porter Bookings</Label>
            <Input
              type="number"
              min="0"
              value={porterTotalBookings}
              onChange={(e) => setPorterTotalBookings(e.target.value)}
              placeholder="0" />
            
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount Paid (GHS)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={porterAmountPaid}
              onChange={(e) => setPorterAmountPaid(e.target.value)}
              placeholder="0.00" />
            
          </div>
        </div>

        {porterEntries.length > 0 &&
        <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Porter Assignments (commission: {formatGHS(PORTER_COMMISSION_PER_PASSENGER)}/passenger)
            </p>
            {porterEntries.map((entry, idx) =>
          <div
            key={idx}
            className="grid sm:grid-cols-12 gap-2 items-end border-b border-border pb-3 last:border-0 last:pb-0">
            
                <div className="sm:col-span-5 space-y-1">
                  <Label className="text-xs">Porter</Label>
                  <Select value={entry.porter_id} onValueChange={(val) => updatePorterEntry(idx, "porter_id", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select porter" />
                    </SelectTrigger>
                    <SelectContent>
                      {porters.map((p) =>
                  <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                        </SelectItem>
                  )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-xs">Passengers Handled</Label>
                  <Input
                type="number"
                min="0"
                value={entry.passengers_handled}
                onChange={(e) => updatePorterEntry(idx, "passengers_handled", e.target.value)}
                placeholder="0" />
              
                </div>
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-xs">Commission</Label>
                  <Input readOnly value={formatGHS(entry.commission || 0)} className="bg-secondary" />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={() => removePorterEntry(idx)}>
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </Button>
                </div>
              </div>
          )}
            <div className="flex justify-end gap-6 text-sm">
              <span>
                Total Passengers: <span className="font-semibold">{computed.porterTotalPassengers}</span>
              </span>
              <span>
                Total Commission: <span className="font-semibold">{formatGHS(computed.porterTotalCommission)}</span>
              </span>
            </div>
          </div>
        }
      </div>

      {/* Remarks */}
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <Label>Remarks (optional)</Label>
        <Textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Incidents, observations, handover notes…"
          rows={3} />
        
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={() => {
            setError("");
            setDuplicateWarning("");
            setView("summary");
          }}
          disabled={!!v}>
          
          <Eye className="w-4 h-4 mr-2" /> Review Summary
        </Button>
      </div>
      {v && <p className="text-xs text-muted-foreground">{v}</p>}

      {/* Recent Reports */}
      {reports.length > 0 &&
      <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Reports</h3>
          <div className="space-y-1">
            {reports.map((r) =>
          <button
            key={r.id}
            onClick={() => setViewingReport(r)}
            className="w-full flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 hover:bg-secondary/50 rounded-lg p-2 -mx-2 text-left transition-colors">
            
                <span className="font-medium">
                  {r.reporting_period_start ?
              `${r.reporting_period_start} to ${r.reporting_period_end}` :
              `${r.shift_date || "—"} (${r.shift_type || ""})`}
                </span>
                <span className="text-muted-foreground">
                  {r.grand_total_paid != null ? formatGHS(r.grand_total_paid) : formatGHS(r.total_revenue || 0)}
                </span>
              </button>
          )}
          </div>
        </div>
      }
    </div>);

}