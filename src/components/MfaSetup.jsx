import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disable, enroll, listFactors, verify } from "@/lib/mfa";

// Account security card: turn two-step verification (authenticator app) on or off.
export default function MfaSetup() {
  const [factors, setFactors] = useState(null);
  const [pending, setPending] = useState(null); // { factorId, qrCode, secret }
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => listFactors().then(setFactors).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    setError("");
    setBusy(true);
    try { await fn(); } catch (e) { setError(e.message || "Something went wrong. Try again."); } finally { setBusy(false); }
  };

  const start = () => run(async () => setPending(await enroll()));
  const confirm = () => run(async () => {
    await verify(pending.factorId, code);
    setPending(null);
    setCode("");
    await load();
  });
  const turnOff = () => run(async () => {
    if (!window.confirm("Turn off two-step verification? Your account will be protected by your password only.")) return;
    await disable(factors[0].id);
    await load();
  });

  if (!factors) return <div className="text-sm text-muted-foreground">Loading security settings…</div>;
  const enabled = factors.length > 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3 max-w-md">
      <div className="flex items-center gap-2">
        {enabled ? <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" /> : <ShieldOff className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
        <h3 className="font-semibold">Two-step verification</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "On. You will be asked for a code from your authenticator app each time you sign in."
          : "Off. Add an authenticator app (such as Google Authenticator or Authy) for a second check at sign-in."}
      </p>
      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      {pending ? (
        <div className="space-y-3">
          <p className="text-sm">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
          <img src={pending.qrCode} alt="QR code for your authenticator app" className="w-40 h-40 bg-white p-2 rounded-md border" />
          <p className="text-xs text-muted-foreground break-all">Can't scan? Enter this key instead: <span className="font-mono">{pending.secret}</span></p>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">6-digit code</Label>
            <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Turn on
            </Button>
            <Button variant="outline" onClick={() => { setPending(null); setCode(""); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : enabled ? (
        <Button variant="outline" onClick={turnOff} disabled={busy}>Turn off</Button>
      ) : (
        <Button onClick={start} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Set up authenticator app</Button>
      )}
    </div>
  );
}
