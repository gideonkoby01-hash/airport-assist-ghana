import React, { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/api/db";
import { buildEvents } from "@/lib/bookingHistory";

// Who did what to a booking, oldest first (built by lib/bookingHistory from rows nobody can edit).
// Management and admin only: the database refuses everyone else, so this simply shows nothing for them.
export default function BookingHistory({ bookingId }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [audit, payments] = await Promise.all([
          api.entities.AuditLog.filter({ table_name: "bookings", record_id: bookingId }, { sort: "at" }),
          api.entities.Payment.filter({ booking_id: bookingId }, { sort: "created_date" }),
        ]);
        const ids = [...new Set(audit.map((r) => r.actor_id).filter(Boolean))];
        const names = {};
        if (ids.length) {
          const users = await api.entities.User.filter({ id: { $in: ids } }).catch(() => []);
          for (const u of users) names[u.id] = u.full_name || u.email;
        }
        if (active) setEvents(buildEvents(audit, payments, names));
      } catch {
        if (active) setEvents([]);
      }
    })();
    return () => { active = false; };
  }, [bookingId]);

  if (!events || events.length === 0) return null;
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4 text-accent" /> History</h4>
      <ol className="space-y-2 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-xs text-muted-foreground w-36 shrink-0">{new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            <span>{e.text} <span className="text-muted-foreground">· {e.who}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
