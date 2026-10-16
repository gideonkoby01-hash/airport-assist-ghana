import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import StaffManager from "@/components/StaffManager";
import PackageManager from "@/components/PackageManager";
import LoungeManager from "@/components/LoungeManager";
import PorterManager from "@/components/PorterManager";
import SupervisorDirectory from "@/components/SupervisorDirectory";
import StaffRequests from "@/components/StaffRequests";
import ShiftReportViewer from "@/components/ShiftReportViewer";
import StatCard from "@/components/StatCard";
import { formatGHS, PORTER_COMMISSION_PER_PASSENGER } from "@/lib/packages";
import { BarChart3, Wallet, Users, Armchair, Receipt } from "lucide-react";

export default function AdminDashboard() {
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminInner />
    </RoleGuard>
  );
}

function AdminInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "summary";
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [loungeCount, setLoungeCount] = useState(0);

  const setTab = (t) => setSearchParams(t === "summary" ? {} : { tab: t });

  useEffect(() => {
    let active = true;
    (async () => {
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
        if (active) setReports(items);
      } catch {
        if (active) setReports([]);
      } finally {
        if (active) setLoadingReports(false);
      }
    })();
    base44.entities.User.filter({}).then((items) => setUserCount((items || []).length)).catch(() => {});
    base44.entities.Lounge.count().then(setLoungeCount).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Admin Console</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage staff, service packages, lounges, and view organisation figures.</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>Summary</TabButton>
        <TabButton active={tab === "packages"} onClick={() => setTab("packages")}>Service Packages</TabButton>
        <TabButton active={tab === "lounges"} onClick={() => setTab("lounges")}>Lounges</TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>Shift Reports</TabButton>
      </div>

      {tab === "summary" && (
        <div className="space-y-4">
          {loadingReports && (
            <div className="flex items-center text-muted-foreground text-sm">
              <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
              Calculating figures from submitted shift reports…
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={formatGHS(totalRevenue)} icon={BarChart3} accent />
            <StatCard label="Amount Collected" value={formatGHS(collected)} icon={Wallet} />
            <StatCard label="Porter Commissions" value={formatGHS(commissions)} icon={Receipt} />
            <StatCard label="Users" value={userCount} icon={Users} />
            <StatCard label="Lounges" value={loungeCount} icon={Armchair} />
          </div>
        </div>
      )}

      {tab === "staff" && <StaffManager />}
      {tab === "packages" && <PackageManager />}
      {tab === "lounges" && <LoungeManager />}
      {tab === "porters" && <PorterManager />}
      {tab === "supervisors" && <SupervisorDirectory />}
      {tab === "requests" && <StaffRequests />}
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