import React, { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/use-document-title";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import LazyFallback from "@/components/analytics/LazyFallback";

// The charts and the accounts pages are loaded only when this screen is opened.
const AnalyticsDashboard = lazy(() => import("@/components/analytics/AnalyticsDashboard"));
const AccountsPage = lazy(() => import("@/components/accounts/AccountsPage"));

// Home for the Accounts role: the analytics dashboard and the Accounts section, and nothing else. Row-level security
// is what keeps bookings, customers and staff screens out of reach; this page only offers what they can use.
export default function AccountsDashboard() {
  useDocumentTitle("Accounts");
  const [params] = useSearchParams();
  const tab = params.get("tab") === "accounts" ? "accounts" : "summary";
  return (
    <RoleGuard allowedRoles={["accounts"]}>
      <AppLayout>
        <Suspense fallback={<LazyFallback />}>
          {tab === "accounts" ? <AccountsPage /> : <AnalyticsDashboard />}
        </Suspense>
      </AppLayout>
    </RoleGuard>
  );
}
