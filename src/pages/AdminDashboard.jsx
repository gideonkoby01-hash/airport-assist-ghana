import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/db";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import AdminSettings from "@/components/AdminSettings";
import EmailIssues from "@/components/EmailIssues";
import ExportPanel from "@/components/ExportPanel";
import StaffManager from "@/components/StaffManager";
import PackageManager from "@/components/PackageManager";
import LoungeManager from "@/components/LoungeManager";
import PorterManager from "@/components/PorterManager";
import SupervisorDirectory from "@/components/SupervisorDirectory";
import StaffRequests from "@/components/StaffRequests";
import ManagementNotifications from "@/components/ManagementNotifications";
import { useAuth } from "@/lib/AuthContext";
import ShiftReportViewer from "@/components/ShiftReportViewer";
import DiscountManager from "@/components/DiscountManager";
import BookingFinancials from "@/components/BookingFinancials";
import RatingsReviews from "@/components/ratings/RatingsReviews";
import StatCard from "@/components/StatCard";
import CustomersPanel from "@/components/crm/CustomersPanel";
import { formatGHS, PORTER_COMMISSION_PER_PASSENGER } from "@/lib/packages";
import { BarChart3, Wallet, Users, Armchair } from "lucide-react";

export default function AdminDashboard() {
  useDocumentTitle("Admin");
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminInner />
    </RoleGuard>
  );
}

function AdminInner() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "summary";
  const [, setUnreadCount] = useState(0);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [loungeCount, setLoungeCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);


  useEffect(() => {
    let active = true;
    (async () => {
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
        if (active) setReports(items);
      } catch {
        if (active) setReports([]);
      } finally {
        if (active) setLoadingReports(false);
      }
    })();
    api.entities.User.count().then((c) => setUserCount(c || 0)).catch(() => {});
    api.entities.Lounge.count().then(setLoungeCount).catch(() => {});
    api.entities.Booking
      .aggregate({ groupBy: "status", sum: ["outstanding_balance"] })
      .then((r) => setOutstanding((r.rows || []).reduce((s, row) => s + (row.sum_outstanding_balance || 0), 0)))
      .catch(() => setOutstanding(0));
    return () => {
      active = false;
    };
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

  // Single source of truth: sum every submitted shift report.
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

  return (
    <AppLayout>
      {tab === "summary" && (
        <div className="space-y-4">
          {loadingReports && (
            <div className="flex items-center text-muted-foreground text-sm">
              <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
              Calculating figures from submitted shift reports…
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <StatCard label="Total Revenue" value={formatGHS(totalRevenue)} icon={BarChart3} accent />
            <StatCard label="Amount Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Outstanding Balance" value={formatGHS(outstanding)} icon={Wallet} />
            <StatCard label="Users" value={userCount} icon={Users} />
            <StatCard label="Lounges" value={loungeCount} icon={Armchair} />
          </div>
          <BookingFinancials />
          <ExportPanel />
        </div>
      )}

      {tab === "customers" && <CustomersPanel tab="customers" isAdmin />}
      {tab === "staff" && <StaffManager />}
      {tab === "email" && <EmailIssues />}
      {tab === "settings" && <AdminSettings />}
      {tab === "packages" && <PackageManager />}
      {tab === "lounges" && <LoungeManager />}
      {tab === "porters" && <PorterManager />}
      {tab === "supervisors" && <SupervisorDirectory />}
      {tab === "requests" && <StaffRequests />}
      {tab === "discounts" && <DiscountManager />}
      {tab === "reports" && <ShiftReportViewer />}
      {tab === "ratings" && <RatingsReviews />}
      {tab === "notifications" && (
        <ManagementNotifications userId={user.id} onUnreadChange={setUnreadCount} />
      )}
    </AppLayout>
  );
}

