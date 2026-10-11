import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, CalendarDays, Save } from "lucide-react";
import {
  PACKAGE_LABELS,
  shiftBounds,
  formatGHS,
  PORTER_COMMISSION_PER_PASSENGER,
} from "@/lib/packages";

export default function ShiftReportForm({ supervisor }) {
  const today = new Date().toISOString().slice(0, 10);
  const [shiftDate, setShiftDate] = useState(today);
  const [shiftType, setShiftType] = useState("morning");
  const [remarks, setRemarks] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [reports, setReports] = useState([]);

  const loadBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await base44.entities.Booking.filter(
        { assigned_supervisor_id: supervisor.id, flight_date: shiftDate },
        { sort: "scheduled_flight_time", limit: 200 }
      );
      setBookings(page.items || []);
    } catch (err) {
      setError(err.message || "Failed to load bookings for this date.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftDate]);

  const loadReports = async () => {
    try {
      const page = await base44.entities.ShiftReport.filter(
        { supervisor_id: supervisor.id },
        { sort: "-created_date", limit: 10 }
      );
      setReports(page.items || []);
    } catch {}
  };
  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
    const breakdown = {};
    bookings.forEach((b) => {
      breakdown[b.package_name || PACKAGE_LABELS[b.package_code] || b.package_code] =
        (breakdown[b.package_name || PACKAGE_LABELS[b.package_code] || b.package_code] || 0) + 1;
    });
    const lounges = [
      ...new Set(bookings.map((b) => b.lounge_used).filter(Boolean)),
    ];
    const porterCount = bookings.reduce((s, b) => s + (b.porters?.length || 0), 0);
    const commission = bookings.reduce(
      (s, b) => s + (b.porters || []).reduce((ss, p) => ss + (p.commission || 0), 0),
      0
    );
    return {
      booking_count: bookings.length,
      total_passengers: active.reduce((s, b) => s + (b.num_passengers || 0), 0),
      service_breakdown: Object.entries(breakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
      total_revenue: active.reduce((s, b) => s + (b.total_value || 0), 0),
      total_collected: bookings.reduce((s, b) => s + (b.amount_collected || 0), 0),
      total_outstanding: bookings.reduce((s, b) => s + (b.outstanding_balance || 0), 0),
      lounges_used: lounges.join(", "),
      porter_count: porterCount,
      total_commission: commission,
      cancellations: bookings.filter((b) => b.status === "cancelled").length,
      no_shows: bookings.filter((b) => b.status === "no_show").length,
      completed: bookings.filter((b) => b.status === "completed").length,
    };
  }, [bookings]);

  const submit = async () => {
    setError("");
    if (!shiftDate) return setError("Select a shift date.");
    setSaving(true);
    try {
      const bounds = shiftBounds(shiftDate, shiftType);
      const payload = {
        supervisor_id: supervisor.id,
        supervisor_name: supervisor.full_name || supervisor.email,
        shift_type: shiftType,
        shift_date: shiftDate,
        shift_start: bounds.start.toISOString(),
        shift_end: bounds.end.toISOString(),
        ...totals,
        remarks: remarks.trim(),
        booking_ids: bookings.map((b) => b.id),
      };
      const rep = await base44.entities.ShiftReport.create(payload);
      setSuccess(rep);
      setRemarks("");
      loadReports();
    } catch (err) {
      setError(err.message || "Failed to submit shift report.");
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="bg-card rounded-2xl border border-emerald-200 p-6 text-center">
        <FileText className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold">Shift report submitted</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {success.shift_type === "morning" ? "Morning" : "Night"} shift · {success.shift_date}
        </p>
        <Button className="mt-4" onClick={() => setSuccess(null)}>
          Submit another report
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" /> Shift Details
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Shift date</Label>
            <Input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <Select value={shiftType} onValueChange={setShiftType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Morning (06:00–18:00)</SelectItem>
                <SelectItem value="night">Night (18:00–06:00)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Africa/Accra time. Totals are calculated from bookings assigned to you on this date.</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {/* Computed totals */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Calculated Totals</h3>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Metric label="Bookings" value={totals.booking_count} />
          <Metric label="Passengers" value={totals.total_passengers} />
          <Metric label="Completed" value={totals.completed} />
          <Metric label="Cancellations" value={totals.cancellations} />
          <Metric label="No-shows" value={totals.no_shows} />
          <Metric label="Porters assigned" value={totals.porter_count} />
          <Metric label="Revenue" value={formatGHS(totals.total_revenue)} />
          <Metric label="Collected" value={formatGHS(totals.total_collected)} />
          <Metric label="Outstanding" value={formatGHS(totals.total_outstanding)} />
          <Metric label="Commission" value={formatGHS(totals.total_commission)} />
        </div>
        {totals.service_breakdown && (
          <p className="text-xs text-muted-foreground mt-3">
            <span className="font-medium">Service types:</span> {totals.service_breakdown}
          </p>
        )}
        {totals.lounges_used && (
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">Lounges used:</span> {totals.lounges_used}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Commission rate: {formatGHS(PORTER_COMMISSION_PER_PASSENGER)} per passenger handled.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <Label>Remarks</Label>
        <Textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Incidents, observations, handover notes…"
          rows={4}
        />
        <Button onClick={submit} disabled={saving || loading} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Submit shift report
        </Button>
      </div>

      {reports.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Reports</h3>
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <span className="font-medium capitalize">{r.shift_type} shift · {r.shift_date}</span>
                <span className="text-muted-foreground">
                  {r.booking_count} bookings · {formatGHS(r.total_revenue)} · {formatGHS(r.total_collected)} collected
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-secondary rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}