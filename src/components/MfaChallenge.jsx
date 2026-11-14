import React, { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";
import { listFactors, verify } from "@/lib/mfa";

// Shown after a correct password when the account has an authenticator app set up.
export default function MfaChallenge() {
  const { checkUserAuth, logout } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listFactors()
      .then((factors) => setFactorId(factors[0]?.id || null))
      .catch((e) => setError(e.message));
  }, []);

  const submit = async (value = code) => {
    if (!factorId || value.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      await verify(factorId, value);
      await checkUserAuth();
    } catch (e) {
      setError(e.message || "That code was not accepted. Try the latest code from your app.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={ShieldCheck}
      title="Two-step verification"
      subtitle="Enter the 6-digit code from your authenticator app"
      footer={
        <button type="button" onClick={() => logout(true)} className="text-primary font-medium hover:underline">
          Use a different account
        </button>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <div className="flex justify-center mb-6">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          autoFocus
          autoComplete="one-time-code"
          aria-label="6-digit verification code"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button className="w-full h-12 font-medium" onClick={() => submit()} disabled={loading || code.length !== 6 || !factorId}>
        {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking...</>) : "Verify"}
      </Button>
    </AuthLayout>
  );
}
