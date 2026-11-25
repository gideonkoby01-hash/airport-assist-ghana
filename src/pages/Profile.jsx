import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/api/db";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { isPhone } from "@/lib/bookingFormRules";
import { roleLabel } from "@/lib/packages";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";

export default function Profile() {
  useDocumentTitle("My profile");
  const { user, updateProfile, logout } = useAuth();
  const role = user?.role === "user" ? "passenger" : user?.role || "passenger";

  const [name, setName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const saveDetails = async (e) => {
    e.preventDefault();
    setSaved("");
    const found = /** @type {Record<string, string>} */ ({});
    if (!name.trim()) found.name = "Enter your full name.";
    if (phone.trim() && !isPhone(phone)) found.phone = "Enter a phone number with at least 7 digits. Add the country code if it is not a Ghana number.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const row = await api.profile.updateMine({ full_name: name, phone });
      updateProfile({ full_name: row.full_name, phone: row.phone });
      setName(row.full_name);
      setPhone(row.phone);
      setSaved("Your details are saved.");
    } catch (err) {
      setErrors({ form: err.message || "We could not save your details. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState({ kind: "", text: "" });

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMessage({ kind: "", text: "" });
    if (newPassword.length < 10) return setPwMessage({ kind: "error", text: "Use a password of at least 10 characters." });
    if (newPassword !== confirmPassword) return setPwMessage({ kind: "error", text: "The two passwords do not match." });
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPwMessage({ kind: "ok", text: "Your password has been changed. Use it the next time you sign in." });
    } catch (err) {
      setPwMessage({ kind: "error", text: err.message || "We could not change your password. Please try again." });
    } finally {
      setPwSaving(false);
    }
  };

  const signOut = async () => {
    await logout(false);
    window.location.href = "/login";
  };

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold text-foreground">My profile</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Your details and sign-in settings.</p>

      <div className="max-w-2xl space-y-5">
        <form onSubmit={saveDetails} noValidate className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Your details</h2>
          {errors.form && <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{errors.form}</div>}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Full name</Label>
              <Input id="pf-name" autoComplete="name" value={name} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "pf-name-err" : undefined}
                onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: "" })); }} />
              {errors.name && <p id="pf-name-err" className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">Phone or WhatsApp</Label>
              <Input id="pf-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. 024 123 4567" value={phone}
                aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? "pf-phone-err" : "pf-phone-hint"}
                onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: "" })); }} />
              {errors.phone
                ? <p id="pf-phone-err" className="text-xs text-destructive">{errors.phone}</p>
                : <p id="pf-phone-hint" className="text-xs text-muted-foreground">Filled in for you when you book a service.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" value={user?.email || ""} readOnly disabled />
              <p className="text-xs text-muted-foreground">This is your sign-in email. Ask an Admin if it needs to change.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-role">Role</Label>
              <Input id="pf-role" value={roleLabel(role)} readOnly disabled />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save details
            </Button>
            {saved && <span role="status" className="text-sm text-emerald-700">{saved}</span>}
          </div>
          {role === "supervisor" && (
            <p className="text-xs text-muted-foreground">
              Your photo and the contact details passengers see are set under{" "}
              <Link to="/supervisor?tab=profile" className="text-primary underline">Public profile</Link>.
            </p>
          )}
        </form>

        <form onSubmit={changePassword} noValidate className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Change password</h2>
          {pwMessage.text && (
            <div role={pwMessage.kind === "error" ? "alert" : "status"}
              className={`p-3 rounded-lg text-sm ${pwMessage.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-800"}`}>
              {pwMessage.text}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pf-new">New password</Label>
              <PasswordInput id="pf-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-confirm">Confirm new password</Label>
              <PasswordInput id="pf-confirm" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={pwSaving || !newPassword}>
            {pwSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Change password
          </Button>
        </form>

        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" /> Two-step verification
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Protect your account with a code from an authenticator app.</p>
          </div>
          <Button variant="outline" asChild><Link to="/security">Manage</Link></Button>
        </div>

        <div className="pt-1">
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
