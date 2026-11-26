import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { AUTH_LINK_KEY } from "@/lib/authLinkRedirect";

function linkKind() {
  try {
    return sessionStorage.getItem(AUTH_LINK_KEY);
  } catch {
    return null;
  }
}

export default function ResetPassword() {
  useDocumentTitle("New password");
  // The emailed link opens this page with a short-lived recovery session; without one the link is invalid or expired.
  const [hasRecoverySession, setHasRecoverySession] = useState(null);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasRecoverySession(true);
    });
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setHasRecoverySession(Boolean(data.session));
    }, 800);
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const isInvite = linkKind() === "invite";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 10) {
      setError("Use a password of at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      try {
        sessionStorage.removeItem(AUTH_LINK_KEY);
      } catch {
        // nothing to clear
      }
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (hasRecoverySession === null) return null;

  if (!hasRecoverySession) {
    return (
      <AuthLayout
        title="This link no longer works"
        subtitle="It may have expired or already been used"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a password reset link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Links in invitation and password emails work once and expire. If you were invited as staff, ask an Admin to
          resend your invitation. If you already have a password, request a reset link.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={isInvite ? "Set your password" : "New password"}
      subtitle={isInvite ? "Choose a password to activate your Airport Assist account" : "Enter your new password below"}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <PasswordInput
              id="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            isInvite ? "Set password" : "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
