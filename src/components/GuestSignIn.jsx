import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GoogleIcon from "@/components/GoogleIcon";
import { googleErrorMessage, useAuthProviders } from "@/lib/authProviders";

// The last step of booking for someone who is not signed in yet: sign in right here (the answers stay on the page), or create an account.
export default function GuestSignIn({ returnTo = "/book" }) {
  const { google } = useAuthProviders();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setError("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err.message || "That email and password did not match. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const withGoogle = async () => {
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + returnTo } });
    if (oauthError) setError(googleErrorMessage(oauthError));
  };

  const register = `/register?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section id="bf-signin" tabIndex={-1} className="bg-card rounded-2xl border border-accent/40 p-5 space-y-4 outline-none scroll-mt-24" aria-labelledby="bf-signin-title">
      <div>
        <h3 id="bf-signin-title" className="text-base font-semibold text-foreground flex items-center gap-2">
          <LogIn className="w-4 h-4 text-accent" aria-hidden="true" /> Almost done: sign in to confirm
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Your answers are saved. Sign in, or create a free account, and your booking is confirmed straight away.</p>
      </div>

      {google && (
        <Button type="button" variant="outline" className="w-full h-11" onClick={withGoogle}>
          <GoogleIcon className="w-5 h-5 mr-2" /> Continue with Google
        </Button>
      )}

      {error && <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gs-email">Email</Label>
          <Input id="gs-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="gs-password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <Input id="gs-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); signIn(); } }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={signIn} disabled={loading} className="h-11">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Sign in"}
        </Button>
        <span className="text-sm text-muted-foreground">
          New here?{" "}
          <Link to={register} className="text-primary font-medium hover:underline">Create an account</Link>
        </span>
      </div>
    </section>
  );
}
