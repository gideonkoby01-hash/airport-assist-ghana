import React, { useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { LogIn, UserRound, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { signInCredentials } from "@/lib/loginIdentifier";
import { useSettings } from "@/lib/SettingsContext";

export default function Login() {
  useDocumentTitle("Sign in");
  const { settings } = useSettings();
  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  // With no explicit destination, use /portal so each role lands on its
  // existing dashboard via RoleRedirect.
  const returnTo = safeReturnTo();
  const postLoginDest = returnTo === "/" ? "/portal" : returnTo;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Staff sign in with their email; porters with the phone number they gave.
      const { error: signInError } = await supabase.auth.signInWithPassword(signInCredentials(who, password));
      if (signInError) throw signInError;
      window.location.href = postLoginDest;
    } catch (err) {
      setError(/invalid login credentials/i.test(err.message || "") ? "That email, phone number or password is not right. Check it and try again." : err.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Staff sign in"
      subtitle="Airport Assist Ghana operations: supervisors, porters and management."
      footer={
        // Passengers book on the public website. When the super admin has closed it, there is nothing to link to.
        settings.public_site_enabled !== "false" ? (
          <>
            Booking as a passenger?{" "}
            <Link to="/book" className="font-medium hover:underline">
              Book here
            </Link>
          </>
        ) : undefined
      }
    >
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email or phone number</Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder="Email or 024 123 4567"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="auth-glow-btn w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Porters: sign in with the phone number you gave when you were registered.</p>
      </form>
    </AuthLayout>
  );
}
