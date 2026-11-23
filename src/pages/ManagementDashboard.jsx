import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingList from "@/components/BookingList";
import { usePagedList } from "@/hooks/use-paged-list";
import SupervisorDirectory from "@/components/SupervisorDirectory";
import ShiftReportViewer from "@/components/ShiftReportViewer";
import StatCard from "@/components/StatCard";
import BookingFinancials from "@/components/BookingFinancials";
import OperationsGlance from "@/components/OperationsGlance";
import PorterPay from "@/components/PorterPay";
import Leaderboard from "@/components/Leaderboard";
import CommissionsPanel from "@/components/CommissionsPanel";
import LazyFallback from "@/components/analytics/LazyFallback";
import NoAccess from "@/components/NoAccess";
import RosterManager from "@/components/roster/RosterManager";
import { useCan } from "@/hooks/use-can";

// The charts and the accounts pages are loaded only when a screen that uses them is opened.
const AnalyticsDashboard = lazy(() => import("@/components/analytics/AnalyticsDashboard"));
const AccountsPage = lazy(() => import("@/components/accounts/AccountsPage"));
import CustomersPanel from "@/components/crm/CustomersPanel";
import { Input } from "@/components/ui/input";
import { UNASSIGNED, managementView } from "@/lib/bookingRules";
import { todayUtc } from "@/lib/bookingFormRules";
import RatingsReviews from "@/components/ratings/RatingsReviews";
import { formatGHS, PORTER_COMMISSION_PER_PASSENGER } from "@/lib/packages";
import { BarChart3, Wallet, Users, AlertCircle, Bell, Search } from "lucide-react";
import ManagementNotifications from "@/components/ManagementNotifications";

export default function ManagementDashboard() {
  useDocumentTitle("Management");
  return (
    <RoleGuard allowedRoles={["management", "admin"]}>
      <ManagementInner />
    </RoleGuard>
  );
}

function ManagementInner() {
  const { user } = useAuth();
  const can = useCan();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "ops";
  // The All bookings screen: a view (all, waiting for a supervisor, today, open, closed) and a search.
  const view = searchParams.get("view") || "all";
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);
  const { query, sort } = useMemo(() => managementView(view, todayUtc(), search), [view, search]);
  const paged = usePagedList("Booking", query, { pageSize: 50, sort });
  const bookings = paged.items;
  const loading = paged.loading;
  const [unassigned, setUnassigned] = useState(0);
  const [statusRows, setStatusRows] = useState([]);
  const [reports, setReports] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const setTab = (t) => setSearchParams({ tab: t });
  const setView = (v) => setSearchParams(v === "all" ? { tab: "bookings" } : { tab: "bookings", view: v });


  const loadSummary = async () => {
    try {
      const byStatus = await api.entities.Booking.aggregate({
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
        const page = await api.entities.ShiftReport.filter(
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
      const c = await api.entities.Notification.count({ user_id: user.id, read: false });
      setUnreadCount(c || 0);
    } catch {}
  };

  useEffect(() => {
    api.entities.Booking.count(UNASSIGNED).then(setUnassigned).catch(() => {});
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

  return (
    <AppLayout>
      {tab === "ops" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {can("analytics.view") && <StatCard label="Total Revenue" value={formatGHS(totalRevenue)} icon={BarChart3} accent />}
            {can("analytics.view") && <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />}
            {can("analytics.view") && <StatCard label="Outstanding" value={formatGHS(totalOutstanding)} icon={AlertCircle} />}
            <StatCard label="Unassigned" value={unassigned} icon={Users} accent={!can("analytics.view")} />
          </div>

          {unreadCount > 0 && (
            <button
              onClick={() => setTab("notifications")}
              className="w-full flex items-center justify-between bg-accent/10 border border-accent/30 rounded-2xl px-5 py-4 text-left hover:bg-accent/15 transition-colors">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {unreadCount} new booking notification{unreadCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Review new booking alerts.</p>
                </div>
              </div>
              <span className="text-sm font-medium text-foreground underline underline-offset-4">Review</span>
            </button>
          )}
          <OperationsGlance />
          {can("analytics.view") && (
            <>
              <Suspense fallback={<LazyFallback />}>
                <AnalyticsDashboard />
              </Suspense>
              <BookingFinancials />
            </>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Show bookings">
              {[["all", "All"], ["unassigned", "Unassigned"], ["today", "Today"], ["open", "Open"], ["closed", "Closed"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    view === key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}{key === "unassigned" && unassigned > 0 ? ` (${unassigned})` : ""}
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search by reference, flight, phone or supervisor"
                placeholder="Reference, flight, phone or supervisor"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
          </div>
          <BookingList bookings={bookings} loading={loading} emptyMessage={emptyFor(view, search)} hasMore={paged.hasMore} loadingMore={paged.loadingMore} onLoadMore={paged.loadMore} />
        </div>
      )}

      {tab === "customers" && (can("customers.manage") ? <CustomersPanel tab="customers" /> : <NoAccess what="Customers" />)}
      {tab === "porter-pay" && (can("porter_pay.manage") ? <PorterPay /> : <NoAccess what="Porter pay" />)}
      {tab === "commissions" && (can("commissions.view") ? <CommissionsPanel /> : <NoAccess what="the Commissions list" />)}
      {tab === "accounts" && (can("accounts.view") ? (
        <Suspense fallback={<LazyFallback />}>
          <AccountsPage />
        </Suspense>
      ) : <NoAccess what="the Accounts section" />)}
      {tab === "supervisors" && <SupervisorDirectory readOnly />}
      {tab === "roster" && <RosterManager canManage={can("rosters.manage")} />}
      {tab === "leaderboard" && (can("leaderboard.view") ? <Leaderboard /> : <NoAccess what="the leaderboard" />)}
      {tab === "reports" && (can("shift_reports.view") ? <ShiftReportViewer /> : <NoAccess what="shift reports" />)}
      {tab === "ratings" && (can("ratings.view") ? <RatingsReviews /> : <NoAccess what="ratings and reviews" />)}
      {tab === "notifications" && (
        <ManagementNotifications userId={user.id} onUnreadChange={setUnreadCount} />
      )}
    </AppLayout>
  );
}

function emptyFor(view, search) {
  if (search.trim()) return "No bookings match that search.";
  if (view === "unassigned") return "Every confirmed booking has a supervisor.";
  if (view === "today") return "No flights booked for today.";
  if (view === "open") return "No open bookings.";
  if (view === "closed") return "No closed bookings yet.";
  return "No bookings in the system yet.";
}
