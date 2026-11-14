import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STATUS_LABELS } from "@/lib/packages";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";

export default function ManagementNotifications({ userId, onUnreadChange }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.Notification.filter(
        { user_id: userId },
        { sort: "-created_date", limit: 50 }
      );
      setNotifications(page.items || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (onUnreadChange) onUnreadChange(notifications.filter((n) => !n.read).length);
  }, [notifications]);

  const markRead = async (n) => {
    if (n.read) return;
    try {
      await api.entities.Notification.update(n.id, { read: true });
      setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    } catch (e) {
      alert(e.message || "Failed to update notification.");
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      await api.entities.Notification.bulkUpdate(unread.map((n) => ({ id: n.id, read: true })));
      setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    } catch (e) {
      alert(e.message || "Failed to update notifications.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-8">
        <div className="w-5 h-5 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading notifications…
      </div>
    );
  }

  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="space-y-4">
      {unread.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="w-4 h-4 mr-1" /> Mark all as read
          </Button>
        </div>
      )}
      {notifications.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No notifications yet. New booking alerts will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                markRead(n);
                const t = n.link_path || (n.booking_id ? `/bookings/${n.booking_id}` : null);
                if (t) navigate(t);
              }}
              className={`bg-card rounded-xl border p-4 cursor-pointer transition-colors ${
                n.read ? "border-border" : "border-accent/40 bg-accent/5 hover:bg-accent/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    {n.type === "status_change" && n.previous_status && n.new_status && (
                      <span className="text-[11px] bg-secondary text-muted-foreground rounded px-1.5 py-0.5">
                        {STATUS_LABELS[n.previous_status] || n.previous_status} → {STATUS_LABELS[n.new_status] || n.new_status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{n.message}</p>
                  {n.booking_id && (
                    <Link
                      to={`/bookings/${n.booking_id}`}
                      onClick={(e) => { e.stopPropagation(); markRead(n); }}
                      className="text-xs text-accent hover:underline mt-2 inline-block"
                    >
                      View booking {n.booking_reference} →
                    </Link>
                  )}
                  {n.link_path && (
                    <Link
                      to={n.link_path}
                      onClick={(e) => { e.stopPropagation(); markRead(n); }}
                      className="text-xs text-accent hover:underline mt-2 inline-block ml-2"
                    >
                      {n.type === "shift_report" ? "View shift reports" : n.type === "staff_request" ? "View staff requests" : "Open"} →
                    </Link>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.created_date).toLocaleString()}
                  </p>
                </div>
                {!n.read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(n); }}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}