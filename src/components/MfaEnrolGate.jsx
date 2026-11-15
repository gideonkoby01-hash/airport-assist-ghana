import React from "react";
import { ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import MfaSetup from "@/components/MfaSetup";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

// Admin and management accounts can change prices, roles and money records, so they must protect the
// sign-in with an authenticator app before anything else loads.
export default function MfaEnrolGate() {
  const { logout, checkUserAuth } = useAuth();
  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Set up two-step verification"
      subtitle="Required for admin and management accounts"
      footer={
        <button type="button" onClick={() => logout(true)} className="text-primary font-medium hover:underline">
          Sign out
        </button>
      }
    >
      <div className="flex justify-center">
        <MfaSetup onChange={checkUserAuth} />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        After you turn it on, sign in again with the code from your app.
      </p>
      <Button variant="outline" className="w-full mt-3" onClick={() => checkUserAuth()}>I have turned it on</Button>
    </AuthLayout>
  );
}
