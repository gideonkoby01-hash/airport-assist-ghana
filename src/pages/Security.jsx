import React from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import AppLayout from "@/components/AppLayout";
import MfaSetup from "@/components/MfaSetup";

export default function Security() {
  useDocumentTitle("Account security");
  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-1">Account security</h1>
      <p className="text-sm text-muted-foreground mb-6">Protect your account with a second sign-in step.</p>
      <MfaSetup />
    </AppLayout>
  );
}
