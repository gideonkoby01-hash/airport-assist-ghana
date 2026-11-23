import React, { useState } from "react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Tag, CheckCircle2, X } from "lucide-react";
import { formatGhsAmount } from "@/lib/money";
import { useSettings } from "@/lib/SettingsContext";
import { payWording } from "@/lib/payments";

export default function DiscountCodeInput({ applied, onApplied, onRemoved, packageCode, numPassengers, disabled, contactEmail = "", formatAmount = formatGhsAmount }) {
  const money = formatAmount;
  const { settings } = useSettings();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    setError("");
    if (!value.trim()) {
      setError("Enter a discount code.");
      return;
    }
    if (!packageCode) {
      setError("Select a service package first.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.functions.invoke("validateDiscountCode", {
        discount_code: value,
        package_code: packageCode,
        num_passengers: numPassengers,
        contact_email: contactEmail,
      });
      const data = res?.data || {};
      if (!data.valid) {
        setError(data.message || "That discount code cannot be used.");
        return;
      }
      onApplied(data);
      setValue("");
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.response?.data?.error || err?.message || "Could not validate that code.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (applied) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Discount code {applied.code} applied</p>
              <p className="text-sm text-emerald-800 mt-0.5">
                You save {money(applied.discount_amount)} on this booking.
              </p>
              {applied.recipient_name && (
                <p className="text-xs text-emerald-700 mt-1">Issued to {applied.recipient_name}</p>
              )}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onRemoved} disabled={disabled}>
            <X className="w-4 h-4 mr-1" /> Remove
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Tag className="w-4 h-4 text-accent" /> Discount Code
      </h3>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Enter your discount code"
          className="flex-1 uppercase"
          disabled={disabled || loading}
          autoComplete="off"
        />
        <Button type="button" onClick={apply} disabled={disabled || loading} className="sm:w-auto">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Code"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Optional. One code per booking, not case-sensitive. {payWording(settings).online ? "The discount applies however you pay." : "Payment is still made in person at the airport."}
      </p>
    </section>
  );
}