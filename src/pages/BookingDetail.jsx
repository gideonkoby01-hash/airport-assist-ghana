import React, { useEffect, useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/api/db";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BookingActions from "@/components/BookingActions";
import BookingHistory from "@/components/BookingHistory";
import BookingReceipt from "@/components/BookingReceipt";
import ConfirmAction from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import PassengerPhoto from "@/components/PassengerPhoto";
import BookingSupervisor from "@/components/BookingSupervisor";
import BookingRatingSection from "@/components/ratings/BookingRatingSection";
import { BookingStatusBadge, PaymentBadge } from "@/components/StatusBadge";
import {
  PACKAGE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/packages";
import { ArrowLeft, Plane, Calendar, Clock, Users, Phone, Globe, Luggage, StickyNote, Armchair, Tag } from "lucide-react";
import { useMoney } from "@/lib/currency";

export default function BookingDetail() {
  const { format: money } = useMoney();
  useDocumentTitle("Booking");
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const b = await api.entities.Booking.get(id);
      setBooking(b);
    } catch (err) {
      setError(err.message || "Booking not found or you do not have access.");
    } finally {
      setLoading(false);
    }
  };

  const isOwner = Boolean(user?.id && booking && [booking.passenger_user_id, booking.created_by_id].includes(user.id));
  const [cancelError, setCancelError] = useState("");
  const cancelBooking = async () => {
    setCancelError("");
    try {
      const res = await api.functions.invoke("cancelMyBooking", { booking_id: booking.id });
      if (res?.data?.booking) setBooking(res.data.booking);
    } catch (e) {
      setCancelError(e.message || "Could not cancel the booking.");
    }
  };

  useEffect(() => {
    load();

  }, [id]);

  // Keep the assignment live: when Management assigns or reassigns this booking,
  // the supervisor section updates without the passenger reloading the page.
  useEffect(() => {
    if (!id) return undefined;
    const unsubscribe = api.entities.Booking.subscribe((event) => {
      if (event?.type === "update" && event?.data?.id === id) {
        setBooking((prev) => (prev ? { ...prev, ...event.data } : prev));
      }
    });
    return unsubscribe;
  }, [id]);

  return (
    <AppLayout>
      <button onClick={() => navigate(-1)} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
          Loading booking…
        </div>
      ) : error || !booking ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-destructive">{error || "Booking not found."}</p>
          <Link to="/" className="text-accent text-sm hover:underline mt-3 inline-block">
            Return to dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xl font-bold text-primary">{booking.reference}</span>
                  <BookingStatusBadge status={booking.status} />
                  <PaymentBadge status={booking.payment_status} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {PACKAGE_LABELS[booking.package_code] || booking.package_name} ·{" "}
                  <span className="capitalize">{booking.booking_channel?.replace("_", " ")}</span>
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-3xl font-bold text-foreground">{money(booking.total_value)}</p>
                <p className="text-xs text-muted-foreground">
                  {money(booking.price_per_passenger)} × {booking.num_passengers} passenger(s)
                  {(() => {
                    const fees = (booking.porters || []).reduce((n, p) => n + (p.extra ? Number(p.fee) || 0 : 0), 0);
                    return fees > 0 ? ` + ${money(fees)} extra porter${(booking.porters || []).filter((p) => p.extra).length === 1 ? "" : "s"}` : "";
                  })()}
                </p>
              </div>
            </div>
          </div>

          {isOwner && ["confirmed", "assigned"].includes(booking.status) && (
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Need to cancel?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {Number(booking.amount_collected) > 0
                    ? "A payment has been taken for this booking. Please contact the Airport Assist desk to cancel and arrange a refund."
                    : "You can cancel for free before the service starts."}
                </p>
                {cancelError && <p className="text-xs text-destructive mt-1" role="alert">{cancelError}</p>}
              </div>
              {Number(booking.amount_collected) <= 0 && (
                <ConfirmAction
                  title={`Cancel booking ${booking.reference}?`}
                  description="The booking will be cancelled and any discount you used will be given back. This cannot be undone."
                  confirmLabel="Cancel booking"
                  destructive
                  onConfirm={cancelBooking}
                >
                  <Button variant="outline">Cancel booking</Button>
                </ConfirmAction>
              )}
            </div>
          )}

          {isOwner && <BookingReceipt booking={booking} />}

          {Number(booking.discount_amount || 0) > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-accent" /> Price Breakdown
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Original total</dt>
                  <dd>{money(booking.original_total ?? booking.total_value)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Discount ({booking.discount_code}
                    {booking.discount_type === "percentage" ? ` · ${booking.discount_value}%` : ""})
                  </dt>
                  <dd className="text-emerald-700">−{money(booking.discount_amount)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <dt>Booking total</dt>
                  <dd>{money(booking.total_value)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Collected</dt>
                  <dd>{money(booking.amount_collected)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd>{money(booking.outstanding_balance)}</dd>
                </div>
              </dl>
              {booking.discount_recipient_name && (
                <p className="text-xs text-muted-foreground mt-3">
                  Discount issued to {booking.discount_recipient_name}
                  {booking.discount_recipient_type ? ` (${booking.discount_recipient_type})` : ""}. Payment is made in
                  person at the airport terminal.
                </p>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Flight info */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Flight & Contact</h3>
              <dl className="space-y-2 text-sm">
                <Row icon={Plane} label="Direction" value={booking.flight_type === "arrival" ? "Arrival" : "Departure"} />
                <Row icon={Plane} label="Airline / Flight" value={`${booking.airline || "—"} ${booking.flight_number}`} />
                <Row icon={Calendar} label="Flight date" value={booking.flight_date} />
                <Row icon={Clock} label="Scheduled time" value={booking.scheduled_flight_time} />
                <Row icon={Phone} label="Contact" value={booking.contact} />
                <Row icon={Globe} label="Nationality" value={booking.nationality || "—"} />
                <Row icon={Luggage} label="Total bags" value={booking.total_bags} />
                {booking.lounge_used && <Row icon={Armchair} label="Lounge used" value={booking.lounge_used} />}
                {booking.special_requests && <Row icon={StickyNote} label="Special requests" value={booking.special_requests} />}
                {booking.assigned_supervisor_name && (
                  <Row icon={Users} label="Supervisor" value={booking.assigned_supervisor_name} />
                )}
                {booking.payment_method && (
                  <Row icon={Plane} label="Payment method" value={PAYMENT_METHOD_LABELS[booking.payment_method]} />
                )}
              </dl>
            </div>

            {/* Passengers */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" /> Passengers ({booking.num_passengers})
              </h3>
              <div className="space-y-2">
                {booking.passengers?.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{i + 1}. {p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.contact && <span>{p.contact} · </span>}
                      {p.nationality && <span>{p.nationality} · </span>}
                      {p.total_bags || 0} bag(s)
                    </p>
                    {p.special_requests && <p className="text-xs text-muted-foreground mt-1">Note: {p.special_requests}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Meet Your Supervisor */}
          <BookingSupervisor booking={booking} />

          {/* Rate Your Experience — own completed bookings only */}
          <BookingRatingSection booking={booking} user={user} />

          {/* Passenger identification photo */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" /> Passenger Identification Photo
            </h3>
            {booking.passenger_photo_uri ? (
              <PassengerPhoto fileUri={booking.passenger_photo_uri} />
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground text-sm">
                <div className="w-16 h-16 rounded-xl border border-dashed border-border flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                No photo provided
              </div>
            )}
          </div>

          {/* Actions */}
          <BookingActions booking={booking} user={user} onUpdated={setBooking} />
          {["management", "admin"].includes(user?.role) && <BookingHistory key={booking.updated_date} bookingId={booking.id} />}
        </div>
      )}
    </AppLayout>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </dt>
      <dd className="font-medium text-foreground text-right">{value || "—"}</dd>
    </div>
  );
}