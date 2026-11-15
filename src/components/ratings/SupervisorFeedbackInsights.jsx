import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StarRatingDisplay from "@/components/ratings/StarRatingDisplay";
import { formatDateTime, starText } from "@/lib/ratings";
import { MessageSquare, Info } from "lucide-react";

// Qualitative feedback tool: written comments attached to a supervisor's bookings.
// Deliberately NO supervisor scores, averages or automatic good/poor classification.
export default function SupervisorFeedbackInsights({ supervisors }) {
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!selected) {
      setRows([]);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    api.entities.BookingRating
      .filter({ supervisor_user_id: selected }, { sort: "-submitted_at", limit: 100 })
      .then((page) => {
        if (active) setRows(page.items || []);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const withComments = rows.filter((r) => (r.feedback || "").trim());

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" /> Supervisor Feedback Insights
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Written feedback passengers left on bookings handled by a supervisor. Use it to spot recurring praise and
          recurring complaints.
        </p>

        <div className="mt-4 max-w-sm">
          <Label className="text-xs text-muted-foreground">Assigned supervisor</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose a supervisor" />
            </SelectTrigger>
            <SelectContent>
              {supervisors.length === 0 && <SelectItem value="none">No supervisors yet</SelectItem>}
              {supervisors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            Passengers submit one overall Airport Assist rating only. These are the ratings attached to this
            supervisor's bookings, shown with the comments as written. No supervisor score is calculated and no
            classification is applied automatically.
          </p>
        </div>
      </div>

      {selected && (
        <div className="bg-card rounded-2xl border border-border p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading feedback…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews recorded for this supervisor yet.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                {rows.length} review{rows.length === 1 ? "" : "s"} · {withComments.length} with written feedback
              </p>
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <StarRatingDisplay value={r.overall_rating} />
                        <span className="text-xs font-medium text-muted-foreground">{starText(r.overall_rating)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.booking_reference} · {formatDateTime(r.submitted_at)}
                      </span>
                    </div>
                    {r.feedback ? (
                      <p className="text-sm text-foreground mt-2 whitespace-pre-wrap break-words">{r.feedback}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2">No written feedback.</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}