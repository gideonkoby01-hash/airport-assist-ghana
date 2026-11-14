import React from "react";
import { UserX } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

export default function AccountDisabled() {
  const { logout } = useAuth();
  return (
    <AuthLayout
      icon={UserX}
      title="This account is disabled"
      subtitle="Please contact the Airport Assist office if you think this is a mistake"
      footer={
        <button type="button" onClick={() => logout(true)} className="text-primary font-medium hover:underline">
          Sign out
        </button>
      }
    >
      <p className="text-sm text-center text-muted-foreground">You can no longer see bookings or other records with this login.</p>
    </AuthLayout>
  );
}
