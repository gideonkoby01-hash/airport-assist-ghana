import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Package } from "lucide-react";
import { formatGHS } from "@/lib/packages";

export default function PackageManager() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const page = await base44.entities.ServicePackage.filter({}, { sort: "price" });
      setPackages(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const draft = (p) => drafts[p.id] || {
    name: p.name,
    price: p.price,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    includes_lounge: p.includes_lounge,
    active: p.active,
  };

  const setDraft = (id, k, v) =>
    setDrafts((d) => {
      const pkg = packages.find((p) => p.id === id);
      const base = pkg
        ? { name: pkg.name, price: pkg.price, inclusions: pkg.inclusions, exclusions: pkg.exclusions, includes_lounge: pkg.includes_lounge, active: pkg.active }
        : {};
      return { ...d, [id]: { ...base, ...(d[id] || {}), [k]: v } };
    });

  const save = async (p) => {
    setSaving(p.id);
    try {
      const d = draft(p);
      await base44.entities.ServicePackage.update(p.id, {
        name: d.name,
        price: Number(d.price),
        inclusions: d.inclusions,
        exclusions: d.exclusions,
        includes_lounge: !!d.includes_lounge,
        active: !!d.active,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      load();
    } catch (e) {
      alert(e.message || "Failed to save package.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading packages…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {packages.map((p) => {
        const d = draft(p);
        return (
          <div key={p.id} className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-accent" />
              <span className="font-mono text-xs uppercase text-muted-foreground">{p.code}</span>
              <span className="text-xs text-muted-foreground">· {formatGHS(p.price)}/passenger</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={d.name} onChange={(e) => setDraft(p.id, "name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price (GHS)</Label>
                <Input type="number" min={0} value={d.price} onChange={(e) => setDraft(p.id, "price", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Inclusions</Label>
                <Textarea value={d.inclusions} onChange={(e) => setDraft(p.id, "inclusions", e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Exclusions</Label>
                <Textarea value={d.exclusions} onChange={(e) => setDraft(p.id, "exclusions", e.target.value)} rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={d.includes_lounge} onCheckedChange={(v) => setDraft(p.id, "includes_lounge", v)} />
                  Lounge access
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={d.active} onCheckedChange={(v) => setDraft(p.id, "active", v)} />
                  Active
                </label>
              </div>
              <Button onClick={() => save(p)} disabled={saving === p.id} size="sm">
                {saving === p.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}