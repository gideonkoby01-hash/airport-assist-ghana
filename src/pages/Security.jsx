import React from "react";
import AppLayout from "@/components/AppLayout";
import MfaSetup from "@/components/MfaSetup";

export default function Security() {
  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-1">Account security</h1>
      <p className="text-sm text-muted-foreground mb-6">Protect your account with a second sign-in step.</p>
      <MfaSetup />
    </AppLayout>
  );
}
