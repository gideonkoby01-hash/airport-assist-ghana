import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserRound, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { whoIsSigningIn } from "@/lib/loginIdentifier";
import { currentPorterSession, rememberPorterSession } from "@/lib/porterSession";
import { offerToSavePassword, rememberedLogin, rememberLogin } from "@/lib/rememberedLogin";
import { useSettings } from "@/lib/SettingsContext";

export default function Login() {
  useDocumentTitle("Staff portal");
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  // The email or phone number used last time on this device is filled in, and the cursor starts on the password.
  const [savedWho] = useState(() => rememberedLogin());
  const [who, setWho] = useState(savedWho);
  const [remember, setRemember] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(location.state?.notice || "");
  const [loading, setLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  // With no explicit destination, use /portal so each role lands on its
  // existing dashboard via RoleRedirect.
  const returnTo = safeReturnTo();
  const postLoginDest = returnTo === "/" ? "/portal" : returnTo;

  // A porter who is still signed in goes straight back to their page.
  useEffect(() => {
    if (currentPorterSession()) navigate("/porter", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const who_ = whoIsSigningIn(who);
      if (who_.porter) {
        // Porters sign in with their phone number: a separate, simpler session that opens only their own page.
        const { data } = await api.functions.invoke("porterLogin", { phone: who_.phone, password });
        rememberPorterSession({ token: data.token, expires_at: data.expires_at }, data.porter?.name);
        rememberLogin(who, remember);
        await offerToSavePassword(who.trim(), password);
        navigate("/porter", { replace: true });
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: who_.email, password });
      if (signInError) throw signInError;
      rememberLogin(who, remember);
      await offerToSavePassword(who.trim(), password);
      window.location.href = postLoginDest;
    } catch (err) {
      setError(/invalid login credentials/i.test(err.message || "") ? "That email, phone number or password is not right. Check it and try again." : err.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Staff portal"
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

      <form onSubmit={handleSubmit} name="staff-sign-in" method="post" action="#" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email or phone number</Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              name="username"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!savedWho}
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
              name="password"
              autoFocus={Boolean(savedWho)}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")))}
              onBlur={() => setCapsLock(false)}
              className="pl-10 h-12"
              required
            />
          </div>
          {capsLock && <p role="status" className="text-xs font-medium text-amber-700">Caps Lock is on.</p>}
        </div>
        <div className="flex items-center gap-2.5">
          <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="h-5 w-5" />
          <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">Remember me on this device</Label>
        </div>
        <Button type="submit" className="auth-glow-btn w-full h-12 text-base font-semibold bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
