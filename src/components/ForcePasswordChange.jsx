import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "lucide-react";

// Shown to a person whose account an admin created with a temporary password: nothing else opens until they
// have chosen their own.
export default function ForcePasswordChange() {
  const { user, updateProfile, checkUserAuth, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 10) return setError("Use a password of at least 10 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const { error: flagError } = await supabase.rpc("password_changed");
      if (flagError) throw flagError;
      updateProfile({ must_change_password: false });
      await checkUserAuth(); // reload the profile so the gate lifts for good
    } catch (err) {
      setError(err.message || "We could not save your password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Choose your own password"
      subtitle={`Welcome${user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}. The temporary password you were given works only for this first sign-in.`}
      footer={
        <button type="button" onClick={() => logout(true)} className="text-primary font-medium hover:underline">
          Sign out
        </button>
      }
    >
      {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="fp-new">New password</Label>
          <PasswordInput id="fp-new" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-confirm">Confirm new password</Label>
          <PasswordInput id="fp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12" />
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save password and continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}
