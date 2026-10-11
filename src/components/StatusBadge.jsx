import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/packages";

const STATUS_STYLES = {
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  no_show: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

const PAY_STYLES = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partially_paid: "bg-amber-50 text-amber-700 border-amber-200",
  unpaid: "bg-rose-50 text-rose-700 border-rose-200",
};

export function BookingStatusBadge({ status }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", STATUS_STYLES[status] || STATUS_STYLES.confirmed)}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PaymentBadge({ status }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", PAY_STYLES[status] || PAY_STYLES.unpaid)}>
      {PAYMENT_STATUS_LABELS[status] || status}
    </span>
  );
}