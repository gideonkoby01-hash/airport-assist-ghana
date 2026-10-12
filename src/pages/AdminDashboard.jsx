import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import StaffManager from "@/components/StaffManager";
import PackageManager from "@/components/PackageManager";
import LoungeManager from "@/components/LoungeManager";
import PorterManager from "@/components/PorterManager";
import StaffRequests from "@/components/StaffRequests";
import StatCard from "@/components/StatCard";
import { formatGHS } from "@/lib/packages";
import { BarChart3, Wallet, Users, Armchair } from "lucide-react";

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
  const [rows, setRows] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [loungeCount, setLoungeCount] = useState(0);

  const setTab = (t) => setSearchParams(t === "summary" ? {} : { tab: t });

  useEffect(() => {
    base44.entities.Booking
      .aggregate({ groupBy: "status", sum: ["total_value", "amount_collected", "outstanding_balance"] })
      .then((r) => setRows(r.rows || []))
      .catch(() => setRows([]));
    base44.entities.User.filter({}).then((items) => setUserCount((items || []).length)).catch(() => {});
    base44.entities.Lounge.count().then(setLoungeCount).catch(() => {});
  }, []);

  const revenue = rows.reduce((s, r) => s + (r.sum_total_value || 0), 0);
  const collected = rows.reduce((s, r) => s + (r.sum_amount_collected || 0), 0);
  const outstanding = rows.reduce((s, r) => s + (r.sum_outstanding_balance || 0), 0);

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Admin Console</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage staff, service packages, lounges, and view organisation figures.</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>Summary</TabButton>
        <TabButton active={tab === "staff"} onClick={() => setTab("staff")}>Staff Accounts</TabButton>
        <TabButton active={tab === "packages"} onClick={() => setTab("packages")}>Service Packages</TabButton>
        <TabButton active={tab === "lounges"} onClick={() => setTab("lounges")}>Lounges</TabButton>
        <TabButton active={tab === "porters"} onClick={() => setTab("porters")}>Porters</TabButton>
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>Staff Requests</TabButton>
      </div>

      {tab === "summary" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={formatGHS(revenue)} icon={BarChart3} accent />
          <StatCard label="Collected" value={formatGHS(collected)} icon={Wallet} />
          <StatCard label="Outstanding" value={formatGHS(outstanding)} icon={Wallet} />
          <StatCard label="Users" value={userCount} icon={Users} />
          <StatCard label="Lounges" value={loungeCount} icon={Armchair} />
        </div>
      )}

      {tab === "staff" && <StaffManager />}
      {tab === "packages" && <PackageManager />}
      {tab === "lounges" && <LoungeManager />}
      {tab === "porters" && <PorterManager />}
      {tab === "requests" && <StaffRequests />}
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