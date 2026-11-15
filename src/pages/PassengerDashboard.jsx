import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
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
  useDocumentTitle("My bookings");
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
  const [, setUnreadCount] = useState(0);

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
      {tab === "home" && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</h2>
          <p className="text-muted-foreground text-sm mt-1">Book airport assistance and track your bookings.</p>
        </div>
      )}

      {tab === "home" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <StatCard label="Active" value={stats.active} icon={Plane} accent />
            <StatCard label="Total Bookings" value={stats.total} icon={Ticket} />
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