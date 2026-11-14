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
import BookingFinancials from "@/components/BookingFinancials";
import RatingsReviews from "@/components/ratings/RatingsReviews";
import { formatGHS, PORTER_COMMISSION_PER_PASSENGER } from "@/lib/packages";
import { BarChart3, Wallet, Users, AlertCircle, Bell } from "lucide-react";
import ManagementNotifications from "@/components/ManagementNotifications";

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
  const [reports, setReports] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  const loadUnread = async () => {
    try {
      const c = await base44.entities.Notification.count({ user_id: user.id, read: false });
      setUnreadCount(c || 0);
    } catch {}
  };

  useEffect(() => {
    load();
    loadSummary();
    loadReports();
    loadUnread();

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
        <TabButton active={tab === "ratings"} onClick={() => setTab("ratings")}>Ratings &amp; Reviews</TabButton>
        <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
              {unreadCount}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "ops" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={formatGHS(totalRevenue)} icon={BarChart3} accent />
            <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Outstanding" value={formatGHS(totalOutstanding)} icon={AlertCircle} />
            <StatCard label="Unassigned" value={unassigned} icon={Users} />
            <button onClick={() => setTab("notifications")} className="text-left">
              <StatCard
                label="Notifications"
                value={unreadCount}
                sub={unreadCount > 0 ? "New booking alerts" : "All caught up"}
                icon={Bell}
                accent
              />
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={() => setTab("notifications")}
              className="w-full flex items-center justify-between bg-accent/10 border border-accent/30 rounded-xl px-5 py-4 text-left hover:bg-accent/15 transition-colors">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {unreadCount} new booking notification{unreadCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Tap to review new booking alerts.</p>
                </div>
              </div>
              <span className="text-xs font-medium text-accent">View →</span>
            </button>
          )}
          <BookingFinancials />
        </div>
      )}

      {tab === "bookings" && (
        <BookingList bookings={bookings} loading={loading} emptyMessage="No bookings in the system yet." />
      )}

      {tab === "supervisors" && <SupervisorDirectory readOnly />}
      {tab === "reports" && <ShiftReportViewer />}
      {tab === "ratings" && <RatingsReviews />}
      {tab === "notifications" && (
        <ManagementNotifications userId={user.id} onUnreadChange={setUnreadCount} />
      )}
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