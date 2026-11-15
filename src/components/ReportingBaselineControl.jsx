import React, { useState } from "react";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarClock } from "lucide-react";

const formatWhen = (value) => {
  if (!value) return null;
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ReportingBaselineControl({ baseline, onReset }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  const handleReset = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.functions.invoke("manageReportingBaseline", { action: "set" });
      if (res.data?.error) setError(res.data.error);
      else await onReset();
    } catch (e) {
      setError(e?.response?.data?.error || "The baseline could not be reset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <CalendarClock className="w-3 h-3" />
        {baseline
          ? `Tracking bookings created on or after ${formatWhen(baseline.baseline_at)}${
              baseline.set_by_name ? ` · set by ${baseline.set_by_name}` : ""
            }`
          : "Tracking all bookings (no baseline set)"}
      </p>
      {isAdmin && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={saving}>
              {saving ? "Resetting…" : "Start new baseline"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new reporting baseline?</AlertDialogTitle>
              <AlertDialogDescription>
                Gross, discount and net booking figures will start again from 0.00 and count only bookings created
                from now on. No bookings, payments, discounts or shift reports are deleted or changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Start new baseline</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
    </div>
  );
}