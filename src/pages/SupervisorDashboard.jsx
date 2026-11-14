import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import BookingForm from "@/components/BookingForm";
import BookingList from "@/components/BookingList";
import ShiftReportForm from "@/components/ShiftReportForm";
import SupervisorNotifications from "@/components/SupervisorNotifications";
import SupervisorProfileForm from "@/components/supervisor/SupervisorProfileForm";
import StatCard from "@/components/StatCard";
import { formatGHS } from "@/lib/packages";
import { ClipboardList, Wallet } from "lucide-react";

export default function SupervisorDashboard() {
  return (
    <RoleGuard allowedRoles={["supervisor", "admin"]}>
      <SupervisorInner />
    </RoleGuard>
  );
}

function SupervisorInner() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "assigned";
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const setTab = (t) => setSearchParams({ tab: t });

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.Booking.filter(
        { assigned_supervisor_id: user.id },
        { sort: "-created_date", limit: 100 }
      );
      setBookings(page.items || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.entities.Notification.count({ user_id: user.id, read: false }).then(setUnreadCount).catch(() => {});

  }, []);

  const active = bookings.filter((b) => ["confirmed", "assigned", "in_progress"].includes(b.status));
  const collected = bookings.reduce((s, b) => s + (b.amount_collected || 0), 0);
  const outstanding = bookings.reduce((s, b) => s + (b.outstanding_balance || 0), 0);

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Supervisor Console</h1>
        <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        <TabButton active={tab === "assigned"} onClick={() => setTab("assigned")}>Assigned Bookings</TabButton>
        <TabButton active={tab === "walkin"} onClick={() => setTab("walkin")}>Walk-in Booking</TabButton>
        <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
          Notifications{unreadCount > 0 && <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs font-bold rounded-full bg-accent text-accent-foreground">{unreadCount}</span>}
        </TabButton>
        <TabButton active={tab === "report"} onClick={() => setTab("report")}>Shift Report</TabButton>
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>My Profile</TabButton>
      </div>

      {tab === "assigned" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Active Bookings" value={active.length} icon={ClipboardList} accent />
            <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Outstanding" value={formatGHS(outstanding)} icon={Wallet} />
          </div>
          <BookingList bookings={bookings} loading={loading} emptyMessage="No bookings assigned to you yet." />
        </div>
      )}

      {tab === "walkin" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Create a walk-in booking. It will be auto-assigned to you so you can record payments, porters, and progress.
          </p>
          <BookingForm channel="walk_in" user={user} supervisor={user} onCreated={load} />
        </div>
      )}

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