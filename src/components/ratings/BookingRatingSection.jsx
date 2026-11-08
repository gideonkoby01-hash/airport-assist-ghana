import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import StarRatingInput from "@/components/ratings/StarRatingInput";
import StarRatingDisplay from "@/components/ratings/StarRatingDisplay";
import { formatDateTime } from "@/lib/ratings";
import { CheckCircle2, MessageSquare, Star } from "lucide-react";

// Passenger-facing review card. Only shown on the passenger's own booking,
// and the invitation itself only once the booking is Completed.
export default function BookingRatingSection({ booking, user }) {
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [thankYou, setThankYou] = useState(false);

  const isOwner = Boolean(booking?.created_by_id && user?.id && booking.created_by_id === user.id);

  useEffect(() => {
    let active = true;
    if (!booking?.id || !isOwner) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        const page = await base44.entities.BookingRating.filter(
          { booking_id: booking.id },
          { sort: "-submitted_at", limit: 1 }
        );
        if (active) setExisting(page.items?.[0] || null);
      } catch {
        if (active) setExisting(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [booking?.id, isOwner]);

  const submit = async () => {
    setError("");
    if (!stars) {
      setError("Please choose a star rating before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitBookingRating", {
        booking_id: booking.id,
        overall_rating: stars,
        feedback: feedback.trim(),
      });
      setExisting(res.data.rating);
      setThankYou(true);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOwner || loading) return null;
  if (!existing && booking.status !== "completed") return null;

  if (existing) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Star className="w-4 h-4 text-accent" /> Your Review
          </h3>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
          </span>
        </div>

        {thankYou && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Thank you! Your review has been received and shared with our management team.
          </div>
        )}

        <div className="mt-3">
          <StarRatingDisplay value={existing.overall_rating} size="md" showLabel />
        </div>

        <div className="mt-3 rounded-xl bg-secondary p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" /> Your feedback
          </p>
          {existing.feedback ? (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{existing.feedback}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No written feedback provided.</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Submitted {formatDateTime(existing.submitted_at)}. Reviews cannot be changed after submission.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Star className="w-4 h-4 text-accent" /> Rate Your Experience
      </h3>
      <p className="text-sm text-muted-foreground mt-1">Your booking is complete. We would love your feedback.</p>

      <div className="mt-4">
        <p className="text-sm font-medium text-foreground mb-2">How would you rate your overall Airport Assist experience?</p>
        <StarRatingInput value={stars} onChange={setStars} disabled={submitting} />
      </div>

      <div className="mt-4">
        <label htmlFor="rating-feedback" className="text-sm font-medium text-foreground">
          Tell us about your experience.
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          You may include feedback about your assigned supervisor, staff professionalism, communication, punctuality and
          overall service quality. This is optional.
        </p>
        <Textarea
          id="rating-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={submitting}
          rows={4}
          maxLength={2000}
          placeholder="Share what went well, or what we could improve…"
        />
      </div>

      {error && <p className="text-sm text-destructive mt-3">{error}</p>}

      <Button onClick={submit} disabled={submitting || !stars} className="mt-4 w-full sm:w-auto">
        {submitting ? "Submitting…" : "Submit Review"}
      </Button>
    </div>
  );
}