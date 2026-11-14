import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingForm from "@/components/BookingForm";
import BookingList from "@/components/BookingList";
import { usePagedList } from "@/hooks/use-paged-list";
import PassengerNotifications from "@/components/PassengerNotifications";
import StatCard from "@/components/StatCard";
import { PACKAGE_DEFINITIONS, formatGHS } from "@/lib/packages";
import { Plane, Ticket, CheckCircle2, XCircle } from "lucide-react";

export default function PassengerDashboard() {
  return (
    <RoleGuard allowedRoles={["passenger", "admin"]}>
      <PassengerInner />
    </RoleGuard>
  );
}

function PassengerInner() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "home";
  const [packages, setPackages] = useState(PACKAGE_DEFINITIONS);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });
  const [unreadCount, setUnreadCount] = useState(0);

  const setTab = (t) => setSearchParams(t === "home" ? {} : { tab: t });

  useEffect(() => {
    api.entities.ServicePackage
      .filter({ active: true }, { sort: "price" })
      .then((page) => page.items?.length && setPackages(page.items))
      .catch(() => {});
  }, []);

  // The list loads a page at a time; the three totals are counted by the database so they stay right however many bookings there are.
  const mine = { $or: [{ passenger_user_id: user.id }, { created_by_id: user.id }] };
  const paged = usePagedList("Booking", mine, { pageSize: 50 });
  const bookings = paged.items;
  const loadingBk = paged.loading;

  const loadStats = async () => {
    try {
      const [total, active, completed] = await Promise.all([
        api.entities.Booking.count(mine),
        api.entities.Booking.count({ $and: [mine, { status: { $in: ["confirmed", "assigned", "in_progress"] } }] }),
        api.entities.Booking.count({ $and: [mine, { status: "completed" }] }),
      ]);
      setStats({ total, active, completed });
    } catch {
      setStats({ total: 0, active: 0, completed: 0 });
    }
  };
  const loadBookings = async () => {
    await paged.reload();
    await loadStats();
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const loadUnread = () =>
      api.entities.Notification.count({ user_id: user.id, read: false })
        .then((c) => setUnreadCount(c || 0))
        .catch(() => {});
    loadUnread();
    // Refresh the unread badge safely when the page regains focus.
    window.addEventListener("focus", loadUnread);
    return () => window.removeEventListener("focus", loadUnread);
  }, [user.id]);

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Welcome, {user?.email}</h1>
        <p className="text-muted-foreground text-sm mt-1">Book airport assistance and track your bookings.</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        <TabButton active={tab === "home"} onClick={() => setTab("home")}>Overview</TabButton>
        <TabButton active={tab === "book"} onClick={() => setTab("book")}>Book a Service</TabButton>
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>My Bookings</TabButton>
        <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
              {unreadCount}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "home" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Total Bookings" value={stats.total} icon={Ticket} />
            <StatCard label="Active" value={stats.active} icon={Plane} accent />
            <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Our Service Packages</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {packages.map((p) => (
                <PackageCard key={p.code} pkg={p} onBook={() => setTab("book")} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "book" && <BookingForm channel="online" user={user} onCreated={loadBookings} />}

      {tab === "bookings" && (
        <BookingList bookings={bookings} loading={loadingBk} emptyMessage="You have no bookings yet. Book a service to get started." hasMore={paged.hasMore} loadingMore={paged.loadingMore} onLoadMore={paged.loadMore} />
      )}

      {tab === "notifications" && (
        <PassengerNotifications userId={user.id} onUnreadChange={setUnreadCount} />
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

function PackageCard({ pkg, onBook }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{pkg.name}</h3>
          <p className="text-xs text-muted-foreground capitalize">{pkg.flight_type} service</p>
        </div>
        <span className="text-2xl font-bold text-primary">{formatGHS(pkg.price)}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm flex-1">
        <div>
          <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Included
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{pkg.inclusions}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Not included
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{pkg.exclusions}</p>
        </div>
      </div>
      <button
        onClick={onBook}
        className="mt-4 w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90"
      >
        Book this service
      </button>
    </div>
  );
}