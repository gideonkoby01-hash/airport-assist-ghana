import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function PendingApproval() {
  useDocumentTitle("Awaiting approval");
  const { user, logout } = useAuth();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    api.entities.AccountRequest
      .filter({ user_id: user.id })
      .then((items) => {
        const list = Array.isArray(items) ? items : (items?.items || []);
        setRequest(list[0] || null);
      })
      .catch(() => setRequest(null))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const rejected = request?.status === "rejected";

  return (
    <AuthLayout
      title={rejected ? "Request Rejected" : "Awaiting Approval"}
      subtitle={
        rejected
          ? "Your staff access request was not approved."
          : "Your account request has been submitted."
      }
    >
      {loading ? (
        <div className="flex items-center justify-center text-muted-foreground text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : rejected ? (
        <p className="text-sm text-muted-foreground text-center">
          Your request for a{" "}
          <span className="font-medium text-foreground capitalize">
            {request?.requested_role}
          </span>{" "}
          account was rejected by the administrator. Please contact the Admin
          office if you believe this is an error.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground text-center">
          You selected a staff role (
          <span className="font-medium text-foreground capitalize">
            {request?.requested_role || "staff"}
          </span>
          ). Please wait for Admin approval before accessing staff features.
          You will be able to access your dashboard once an administrator
          approves your request.
        </p>
      )}
      <Button
        variant="outline"
        className="w-full h-12 font-medium mt-6"
        onClick={() => logout(true)}
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign out
      </Button>
    </AuthLayout>
  );
}