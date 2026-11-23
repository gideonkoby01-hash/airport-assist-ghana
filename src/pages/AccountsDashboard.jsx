import React, { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/use-document-title";
import AppLayout from "@/components/AppLayout";
import RoleGuard from "@/components/RoleGuard";
import LazyFallback from "@/components/analytics/LazyFallback";
import NoAccess from "@/components/NoAccess";
import { useCan } from "@/hooks/use-can";

// The charts and the accounts pages are loaded only when this screen is opened.
const AnalyticsDashboard = lazy(() => import("@/components/analytics/AnalyticsDashboard"));
const AccountsPage = lazy(() => import("@/components/accounts/AccountsPage"));

// Home for the Accounts role: the analytics dashboard and the Accounts section, and nothing else. Row-level security
// is what keeps bookings, customers and staff screens out of reach; this page only offers what they can use.
export default function AccountsDashboard() {
  useDocumentTitle("Accounts");
  const [params] = useSearchParams();
  const can = useCan();
  const tab = params.get("tab") === "accounts" ? "accounts" : "summary";
  return (
    <RoleGuard allowedRoles={["accounts"]}>
      <AppLayout>
        <Suspense fallback={<LazyFallback />}>
          {tab === "accounts"
            ? (can("accounts.view") ? <AccountsPage /> : <NoAccess what="the Accounts section" />)
            : (can("analytics.view") ? <AnalyticsDashboard /> : <NoAccess what="the dashboard analytics" />)}
        </Suspense>
      </AppLayout>
    </RoleGuard>
  );
}
