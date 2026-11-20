import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingList from "@/components/BookingList";
import { usePagedList } from "@/hooks/use-paged-list";
import PassengerNotifications from "@/components/PassengerNotifications";
import StatCard from "@/components/StatCard";
import { PACKAGE_DEFINITIONS } from "@/lib/packages";
import { inclusionList } from "@/lib/bookingDraft";
import { CurrencyToggle, useMoney } from "@/lib/currency";
import { Plane, Ticket, CheckCircle2, CalendarPlus } from "lucide-react";

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
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "home";
  const [packages, setPackages] = useState(PACKAGE_DEFINITIONS);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });
  const [, setUnreadCount] = useState(0);

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

  // Booking has its own page, without the dashboard around it.
  if (tab === "book") return <Navigate to="/book" replace />;

  return (
    <AppLayout>
      {tab === "home" && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground">Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</h2>
          <p className="text-muted-foreground text-sm mt-1">Book airport assistance and track your bookings.</p>
          <Link to="/book" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <CalendarPlus className="w-4 h-4" aria-hidden="true" /> Book a service
          </Link>
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
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-foreground">Our Service Packages</h2>
              <CurrencyToggle />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {packages.map((p) => (
                <PackageCard key={p.code} pkg={p} bookTo={`/book?package=${p.code}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <BookingList bookings={bookings} loading={loadingBk} emptyMessage="You have no bookings yet. Book a service to get started." hasMore={paged.hasMore} loadingMore={paged.loadingMore} onLoadMore={paged.loadMore} />
      )}

      {tab === "notifications" && (
        <PassengerNotifications userId={user.id} onUnreadChange={setUnreadCount} />
      )}
    </AppLayout>
  );
}


function PackageCard({ pkg, bookTo }) {
  const { format: money } = useMoney();
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{pkg.name}</h3>
          <p className="text-xs text-muted-foreground capitalize">{pkg.flight_type} service</p>
        </div>
        <span className="text-2xl font-bold text-primary">{money(pkg.price)}</span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm flex-1">
        {inclusionList(pkg.inclusions).map((item) => (
          <li key={item} className="flex items-start gap-2 text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link
        to={bookTo}
        className="mt-4 w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium text-center hover:bg-primary/90"
      >
        Book this service
      </Link>
    </div>
  );
}
