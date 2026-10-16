import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingList from "@/components/BookingList";
import SupervisorDirectory from "@/components/SupervisorDirectory";
import ShiftReportViewer from "@/components/ShiftReportViewer";
import StatCard from "@/components/StatCard";
import { formatGHS, STATUS_LABELS, PORTER_COMMISSION_PER_PASSENGER } from "@/lib/packages";
import { BarChart3, Wallet, Users, AlertCircle } from "lucide-react";

export default function ManagementDashboard() {
  return (
    <RoleGuard allowedRoles={["management", "admin"]}>
      <ManagementInner />
    </RoleGuard>
  );
}

function ManagementInner() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "ops";
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusRows, setStatusRows] = useState([]);
  const [pkgRows, setPkgRows] = useState([]);
  const [reports, setReports] = useState([]);

  const setTab = (t) => setSearchParams({ tab: t });

  const load = async () => {
    setLoading(true);
    try {
      const page = await base44.entities.Booking.filter({}, { sort: "-created_date", limit: 100 });
      setBookings(page.items || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const byStatus = await base44.entities.Booking.aggregate({
        groupBy: "status",
        sum: ["total_value", "amount_collected", "outstanding_balance"],
        sort: "-count",
      });
      setStatusRows(byStatus.rows || []);
    } catch {}
    try {
      const byPkg = await base44.entities.Booking.aggregate({
        groupBy: "package_code",
        sum: ["total_value"],
        countDistinct: "package_code",
        sort: "-sum_total_value",
      });
      setPkgRows(byPkg.rows || []);
    } catch {}
  };

  // Same source as the Admin Dashboard: every submitted shift report.
  const loadReports = async () => {
    try {
      let items = [];
      let cursor;
      do {
        const page = await base44.entities.ShiftReport.filter(
          {},
          {
            sort: "-created_date",
            limit: 100,
            cursor,
            fields: [
              "grand_total_paid",
              "porter_total_commission",
              "meet_assist_total_paid",
              "porter_amount_paid",
              "porter_entries",
              "meet_assist_entries",
            ],
          }
        );
        items = items.concat(page.items || []);
        cursor = page.next_cursor;
      } while (cursor);
      setReports(items);
    } catch {
      setReports([]);
    }
  };

  useEffect(() => {
    load();
    loadSummary();
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single source of truth: sum every submitted shift report (matches Admin Dashboard).
  // Amount Collected = Meet & Assist + Porter collected (grand_total_paid).
  // Porter Commissions = recorded passenger counts × GHS 30/passenger.
  // Total Revenue = Amount Collected − Porter Commissions.
  const { collected, commissions } = reports.reduce(
    (acc, r) => {
      const meetAssistTotal =
        r.meet_assist_total_paid != null
          ? r.meet_assist_total_paid
          : (r.meet_assist_entries || []).reduce((s, e) => s + (e.amount_paid || 0), 0);
      const porterCollected = r.porter_amount_paid || 0;
      acc.collected += r.grand_total_paid != null ? r.grand_total_paid : meetAssistTotal + porterCollected;
      acc.commissions +=
        r.porter_total_commission != null
          ? r.porter_total_commission
          : (r.porter_entries || []).reduce((s, e) => s + (e.passengers_handled || 0), 0) *
            PORTER_COMMISSION_PER_PASSENGER;
      return acc;
    },
    { collected: 0, commissions: 0 }
  );
  const totalRevenue = collected - commissions;
  const totalOutstanding = statusRows.reduce((s, r) => s + (r.sum_outstanding_balance || 0), 0);
  const unassigned = bookings.filter((b) => !b.assigned_supervisor_id && b.status === "confirmed").length;

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Operations Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Organisation-wide bookings, assignments, and figures.</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        <TabButton active={tab === "ops"} onClick={() => setTab("ops")}>Summary</TabButton>
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>All Bookings</TabButton>
        <TabButton active={tab === "supervisors"} onClick={() => setTab("supervisors")}>Supervisors</TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>Shift Reports</TabButton>
      </div>

      {tab === "ops" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={formatGHS(totalRevenue)} icon={BarChart3} accent />
            <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Outstanding" value={formatGHS(totalOutstanding)} icon={AlertCircle} />
            <StatCard label="Unassigned" value={unassigned} icon={Users} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">By Status</h3>
              <div className="space-y-2">
                {statusRows.map((r) => (
                  <div key={r.status} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <span className="font-medium">{STATUS_LABELS[r.status] || r.status}</span>
                    <span className="text-muted-foreground">
                      {r.count} · {formatGHS(r.sum_total_value)}
                    </span>
                  </div>
                ))}
                {statusRows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">By Service Package</h3>
              <div className="space-y-2">
                {pkgRows.map((r) => (
                  <div key={r.package_code} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <span className="font-medium capitalize">{(r.package_code || "").replace("_", " ")}</span>
                    <span className="text-muted-foreground">
                      {r.count} · {formatGHS(r.sum_total_value)}
                    </span>
                  </div>
                ))}
                {pkgRows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <BookingList bookings={bookings} loading={loading} emptyMessage="No bookings in the system yet." />
      )}

      {tab === "supervisors" && <SupervisorDirectory readOnly />}
      {tab === "reports" && <ShiftReportViewer />}
    </AppLayout>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
        active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}