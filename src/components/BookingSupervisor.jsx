import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import SupervisorProfileCard, { SupervisorProfilePlaceholder } from "@/components/supervisor/SupervisorProfileCard";
import { AlertCircle } from "lucide-react";

/**
 * "Meet Your Supervisor" for one booking.
 * The profile is resolved server-side from the booking's current assignment, so
 * a reassignment always shows the newly assigned supervisor and never the previous one.
 */
export default function BookingSupervisor({ booking }) {
  const [state, setState] = useState({ loading: true, assigned: false, profile: null, error: "" });
  const supervisorId = booking?.assigned_supervisor_id;

  useEffect(() => {
    if (!booking?.id) return undefined;
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    api.functions
      .invoke("getBookingSupervisor", { booking_id: booking.id })
      .then((res) => {
        if (!active) return;
        const data = res?.data || {};
        if (data.error) {
          setState({ loading: false, assigned: false, profile: null, error: data.error });
          return;
        }
        setState({
          loading: false,
          assigned: !!data.assigned,
          profile: data.profile || null,
          error: "",
        });
      })
      .catch((e) => {
        if (!active) return;
        setState({
          loading: false,
          assigned: false,
          profile: null,
          error: e?.response?.data?.error || "Unable to load the supervisor profile right now.",
        });
      });
    return () => {
      active = false;
    };
  }, [booking?.id, supervisorId]);

  if (state.loading) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="bg-primary h-12" />
        <div className="p-5 sm:p-6 flex items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-secondary animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-secondary rounded animate-pulse" />
            <div className="h-3 w-28 bg-secondary rounded animate-pulse" />
            <div className="h-3 w-52 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Meet Your Supervisor</p>
          <p className="text-xs text-muted-foreground mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.assigned || !state.profile) {
    return <SupervisorProfilePlaceholder />;
  }

  return <SupervisorProfileCard profile={state.profile} />;
}