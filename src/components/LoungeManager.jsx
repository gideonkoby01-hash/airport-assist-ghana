import React, { useEffect, useState } from "react";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Armchair } from "lucide-react";

export default function LoungeManager() {
  const [lounges, setLounges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.Lounge.filter({}, { sort: "name" });
      setLounges(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.entities.Lounge.create({ name: name.trim(), location: location.trim(), active: true });
      setName("");
      setLocation("");
      load();
    } catch (e) {
      notifyError(e.message || "Failed to add lounge.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (l) => {
    try {
      await api.entities.Lounge.update(l.id, { active: !l.active });
      load();
    } catch (e) {
      notifyError(e.message || "Failed to update lounge.");
    }
  };

  const remove = async (l) => {
    try {
      await api.entities.Lounge.delete(l.id);
      load();
    } catch (e) {
      notifyError(e.message || "Failed to delete lounge.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent" /> Add Lounge
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Lounge name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Akwaaba Lounge" />
          </div>
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Terminal / area" />
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Armchair className="w-4 h-4 text-accent" /> Lounges
        </h3>
        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {lounges.map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <div>
                  <p className="font-medium text-sm">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.location || "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={!!l.active} onCheckedChange={() => toggle(l)} />
                    {l.active ? "Active" : "Inactive"}
                  </label>
                  <ConfirmAction title={`Delete lounge "${l.name}"?`} description="It will no longer be offered. Past bookings keep the name." confirmLabel="Delete lounge" destructive onConfirm={() => remove(l)}>
                    <button aria-label={`Delete lounge ${l.name}`} className="text-rose-500 hover:text-rose-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </ConfirmAction>
                </div>
              </div>
            ))}
            {lounges.length === 0 && <p className="text-sm text-muted-foreground">No lounges yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}