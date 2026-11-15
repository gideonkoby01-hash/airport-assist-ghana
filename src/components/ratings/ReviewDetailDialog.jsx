import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import StarRatingDisplay from "@/components/ratings/StarRatingDisplay";
import { BookingStatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { formatDate, formatDateTime, starText } from "@/lib/ratings";
import { PACKAGE_LABELS, formatGHS } from "@/lib/packages";

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground mt-0.5">{value || "—"}</dd>
    </div>
  );
}

export default function ReviewDetailDialog({ review, open, onOpenChange }) {
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    let active = true;
    setBooking(null);
    if (!open || !review?.booking_id) return undefined;
    api.entities.Booking
      .get(review.booking_id)
      .then((b) => {
        if (active) setBooking(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, review]);

  if (!review) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base text-primary">{review.booking_reference}</span>
            {booking && <BookingStatusBadge status={booking.status} />}
            {booking && <PaymentBadge status={booking.payment_status} />}
          </DialogTitle>
          <DialogDescription>Passenger review and the booking it belongs to.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-secondary p-4">
            <StarRatingDisplay value={review.overall_rating} size="lg" />
            <p className="text-sm font-medium text-foreground mt-2">{starText(review.overall_rating)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Overall Airport Assist experience · submitted {formatDateTime(review.submitted_at)}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Written feedback</p>
            <div className="rounded-xl border border-border p-3">
              {review.feedback ? (
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{review.feedback}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No written feedback was provided.</p>
              )}
            </div>
          </div>

          <dl className="grid sm:grid-cols-2 gap-4">
            <Field label="Passenger" value={review.passenger_name} />
            <Field label="Assigned supervisor" value={review.supervisor_name} />
            <Field label="Service package" value={review.package_name || PACKAGE_LABELS[review.package_code]} />
            <Field label="Booking / service date" value={formatDate(review.service_date)} />
            <Field label="Flight" value={booking ? `${booking.airline || "—"} ${booking.flight_number || ""}`.trim() : "—"} />
            <Field label="Flight date" value={booking ? formatDate(booking.flight_date) : "—"} />
            <Field label="Booking total" value={booking ? formatGHS(booking.total_value) : "—"} />
            <Field label="Passengers" value={booking ? String(booking.num_passengers ?? "—") : "—"} />
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}