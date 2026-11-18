import React, { useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingList from "@/components/BookingList";
import { usePagedList } from "@/hooks/use-paged-list";
import QuickSaleForm from "@/components/QuickSaleForm";
import ShiftReportForm from "@/components/ShiftReportForm";
import SupervisorNotifications from "@/components/SupervisorNotifications";
import SupervisorProfileForm from "@/components/supervisor/SupervisorProfileForm";
import MyProfileSummary from "@/components/supervisor/MyProfileSummary";
import StatCard from "@/components/StatCard";
import { formatGHS } from "@/lib/packages";
import { supervisorView, LIVE_STATUSES } from "@/lib/bookingRules";
import { todayUtc } from "@/lib/bookingFormRules";
import { Input } from "@/components/ui/input";
import { ClipboardList, Wallet, CalendarClock, Search } from "lucide-react";

export default function SupervisorDashboard() {
  useDocumentTitle("Supervisor");
  return (
    <RoleGuard allowedRoles={["supervisor", "admin"]}>
      <SupervisorInner />
    </RoleGuard>
  );
}

function SupervisorInner() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  // An old link to a tab that no longer exists (the walk-in booking page) opens the assigned bookings instead of a blank page.
  const requestedTab = searchParams.get("tab");
  const tab = ["assigned", "quick", "notifications", "report", "profile"].includes(requestedTab) ? requestedTab : "assigned";
  const [, setUnreadCount] = useState(0);


  // What the list shows: today's flights first thing in the shift, then everything still open, closed ones, or all.
  const [view, setView] = useState("today");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);
  const today = todayUtc();
  const { query, sort } = useMemo(() => supervisorView(view, user.id, today, search), [view, user.id, today, search]);

  // The list loads a page at a time; the totals are summed by the database over every assigned booking.
  const paged = usePagedList("Booking", query, { pageSize: 50, sort });
  const [todayCount, setTodayCount] = useState(0);
  const bookings = paged.items;
  const loading = paged.loading;
  const [totals, setTotals] = useState({ active: 0, collected: 0, outstanding: 0 });

  const loadTotals = async () => {
    try {
      const { rows } = await api.entities.Booking.aggregate({});
      const live = ["confirmed", "assigned", "in_progress"];
      setTotals({
        active: rows.filter((r) => live.includes(r.status)).reduce((s, r) => s + Number(r.count || 0), 0),
        collected: rows.reduce((s, r) => s + Number(r.sum_amount_collected || 0), 0),
        outstanding: rows.reduce((s, r) => s + Number(r.sum_outstanding_balance || 0), 0),
      });
    } catch {
      setTotals({ active: 0, collected: 0, outstanding: 0 });
    }
  };
  const [commissionToday, setCommissionToday] = useState(0);
  // Commission this supervisor marked today (UTC day): it comes off today's takings in the shift report.
  const loadCommission = () =>
    api.entities.Booking.filter(
      { supervisor_commission_by: user.id, supervisor_commission: { $gte: 0.01 }, supervisor_commission_at: { $gte: `${today}T00:00:00.000Z` } },
      { limit: 200, fields: ["id", "supervisor_commission"] }
    )
      .then((page) => setCommissionToday((page.items || []).reduce((n, b) => n + Number(b.supervisor_commission || 0), 0)))
      .catch(() => {});
  const loadToday = () =>
    api.entities.Booking.count({ assigned_supervisor_id: user.id, status: { $in: LIVE_STATUSES }, flight_date: today })
      .then(setTodayCount)
      .catch(() => {});
  const load = async () => {
    await paged.reload();
    await loadTotals();
    await loadToday();
    await loadCommission();
  };

  useEffect(() => {
    loadTotals();
    loadToday();
    loadCommission();
    api.entities.Notification.count({ user_id: user.id, read: false }).then(setUnreadCount).catch(() => {});

  }, []);

  const { active, collected, outstanding } = totals;

  return (
    <AppLayout>
      {tab === "assigned" && (
        <div className="space-y-6">
          <MyProfileSummary user={user} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard label="Flights Today" value={todayCount} icon={CalendarClock} accent />
            <StatCard label="My commission today" value={formatGHS(commissionToday)} icon={Wallet} />
            <StatCard label="Open Bookings" value={active} icon={ClipboardList} />
            <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Outstanding" value={formatGHS(outstanding)} icon={Wallet} />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Show bookings">
              {[["today", "Today"], ["active", "All open"], ["closed", "Closed"], ["all", "Everything"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    view === key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}{key === "today" && todayCount > 0 ? ` (${todayCount})` : ""}
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search by reference, flight number or phone"
                placeholder="Reference, flight or phone"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <BookingList bookings={bookings} loading={loading} emptyMessage={emptyFor(view, search)} hasMore={paged.hasMore} loadingMore={paged.loadingMore} onLoadMore={paged.loadMore} />
        </div>
      )}

      {tab === "quick" && <QuickSaleForm onRecorded={load} />}

      {tab === "notifications" && <SupervisorNotifications userId={user.id} onUnreadChange={setUnreadCount} />}
      {tab === "report" && <ShiftReportForm supervisor={user} />}

      {tab === "profile" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Your photograph and contact details appear to passengers on the bookings assigned to you.
          </p>
          <SupervisorProfileForm user={user} />
        </div>
      )}
    </AppLayout>
  );
}

function emptyFor(view, search) {
  if (search.trim()) return "No bookings match that search.";
  if (view === "today") return "Nothing assigned to you for today. Choose \"All open\" to see upcoming flights.";
  if (view === "closed") return "No closed bookings yet.";
  if (view === "active") return "No open bookings assigned to you.";
  return "No bookings assigned to you yet.";
}

