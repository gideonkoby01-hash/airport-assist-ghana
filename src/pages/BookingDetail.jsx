import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import BookingActions from "@/components/BookingActions";
import PassengerPhoto from "@/components/PassengerPhoto";
import BookingSupervisor from "@/components/BookingSupervisor";
import { BookingStatusBadge, PaymentBadge } from "@/components/StatusBadge";
import {
  PACKAGE_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  formatGHS,
} from "@/lib/packages";
import { ArrowLeft, Plane, Calendar, Clock, Users, Phone, Globe, Luggage, StickyNote, Armchair } from "lucide-react";

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const b = await base44.entities.Booking.get(id);
      setBooking(b);
    } catch (err) {
      setError(err.message || "Booking not found or you do not have access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the assignment live: when Management assigns or reassigns this booking,
  // the supervisor section updates without the passenger reloading the page.
  useEffect(() => {
    if (!id) return undefined;
    const unsubscribe = base44.entities.Booking.subscribe((event) => {
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
                <p className="text-3xl font-bold text-foreground">{formatGHS(booking.total_value)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatGHS(booking.price_per_passenger)} × {booking.num_passengers} passenger(s)
                </p>
              </div>
            </div>
          </div>

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