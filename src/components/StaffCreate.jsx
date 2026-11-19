import React, { useState } from "react";
import { api } from "@/api/db";
import { roleLabel } from "@/lib/packages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";

// Admin creates a Supervisor or Management account directly. No email is sent: the temporary password is shown
// once and handed over in person or by phone. The new person must choose their own password at first sign-in.
export default function StaffCreate({ onCreated }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) return setError("Enter the person's full name.");
    if (!email.trim()) return setError("Enter an email address. They sign in with it.");
    setCreating(true);
    try {
      const res = await api.functions.invoke("createStaffAccount", { full_name: fullName.trim(), email: email.trim(), role });
      if (res?.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      setFullName("");
      setEmail("");
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "The account could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the password is on screen to read out or copy by hand.
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-accent" aria-hidden="true" /> Create a staff account
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        You choose the role and get a temporary password to give them. No email is needed. They set their own password the first time they sign in.
      </p>

      {result && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
          <p className="text-sm font-medium text-emerald-900">
            Account created for {result.full_name} ({roleLabel(result.role)}).
          </p>
          <dl className="mt-3 grid sm:grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-emerald-900/70">Sign in with</dt>
            <dd className="font-medium text-emerald-950 break-all">{result.email}</dd>
            <dt className="text-emerald-900/70">Temporary password</dt>
            <dd className="flex items-center gap-2 flex-wrap">
              <code className="font-mono text-base tracking-wide bg-white border border-emerald-200 rounded px-2 py-1 select-all">{result.temporary_password}</code>
              <Button type="button" size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </dd>
          </dl>
          <p className="text-xs text-emerald-900/80 mt-3">
            This password is shown only once and cannot be looked up later. Give it to them in person or by phone, not in a public message.
            If it is lost, use "Reset password" on their row in the list below.
          </p>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setResult(null)}>Done</Button>
        </div>
      )}

      <form onSubmit={create} noValidate className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_12rem_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="sc-name" className="text-xs">Full name</Label>
          <Input id="sc-name" autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sc-email" className="text-xs">Email</Label>
          <Input id="sc-email" type="email" autoComplete="off" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sc-role" className="text-xs">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="sc-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="management">Management</SelectItem>
              <SelectItem value="accounts">Accounts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={creating}>
          {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Create account
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}
