import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";

// Choosing a new password: the current one (the temporary one the office gave, the first time) and the new one twice.
export default function PorterPasswordForm({ onSubmit, submitLabel = "Save new password" }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (next.length < 10) return setError("Use at least 10 characters.");
    if (next !== again) return setError("The two new passwords are not the same.");
    setBusy(true);
    try {
      await onSubmit({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setError(err.message || "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="pw-current">Password you have now</Label>
        <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-12" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-12" required />
        <p className="text-xs text-muted-foreground">At least 10 characters, with letters as well as numbers.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw-again">New password again</Label>
        <PasswordInput id="pw-again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="h-12" required />
      </div>
      <Button type="submit" className="w-full h-12" disabled={busy}>
        {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : submitLabel}
      </Button>
    </form>
  );
}
