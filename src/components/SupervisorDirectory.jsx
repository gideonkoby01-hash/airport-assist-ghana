import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function SupervisorDirectory({ readOnly = false }) {
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const page = await base44.entities.SupervisorDirectory.filter({}, { sort: "full_name" });
      setSupervisors(page.items || []);
    } catch (e) {
      toast({ title: "Error", description: e.message || "Failed to load supervisors.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const userPage = await base44.entities.User.filter({ role: "supervisor" });
      const users = userPage.items || userPage || [];
      const dirPage = await base44.entities.SupervisorDirectory.filter({});
      const existingIds = new Set((dirPage.items || []).map((d) => d.user_id));
      const missing = users.filter((u) => u.id && !existingIds.has(u.id));
      if (missing.length === 0) {
        toast({ title: "Already synced", description: "All supervisors are already in the directory." });
      } else {
        await base44.entities.SupervisorDirectory.bulkCreate(
          missing.map((u) => ({
            user_id: u.id,
            full_name: u.full_name || "",
            email: u.email || "",
            active: true,
          }))
        );
        toast({ title: "Synced", description: `${missing.length} supervisor(s) added to the directory.` });
      }
      load();
    } catch (e) {
      toast({ title: "Error", description: e.message || "Failed to sync.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (s) => {
    try {
      await base44.entities.SupervisorDirectory.update(s.id, { active: !s.active });
      load();
    } catch (e) {
      alert(e.message || "Failed to update supervisor.");
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" /> Supervisor Directory
        </h3>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync from Users
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Approved supervisors appear here automatically. Only active supervisors can be assigned bookings.
      </p>
      {loading ? (
        <div className="flex items-center text-muted-foreground text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : supervisors.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No supervisors in the directory yet. Approve a supervisor request or sync from existing users.
        </p>
      ) : (
        <div className="space-y-2">
          {supervisors.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div>
                <p className="font-medium text-sm">{s.full_name || s.email}</p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {!readOnly && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={!!s.active} onCheckedChange={() => toggle(s)} />
                    {s.active ? "Active" : "Inactive"}
                  </label>
                )}
                {readOnly && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}