import React, { useEffect, useMemo, useState } from "react";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Loader2, Package, Plus, Save, X } from "lucide-react";
import { formatGHS } from "@/lib/packages";
import { SERVICE_DIRECTIONS, SERVICE_KINDS, checkNewService, freeCode, serviceSaveMessage } from "@/lib/services";

const kindLabel = (k) => SERVICE_KINDS.find((x) => x.key === k)?.label || "Meet and assist";
const directionLabel = (d) => SERVICE_DIRECTIONS.find((x) => x.key === d)?.label || "Arrival and departure";

const blank = () => ({ name: "", code: "", kind: "meet_assist", flight_type: "arrival", price: "", price_usd: "", description: "", inclusions: "", includes_lounge: false, active: true });

function Choice({ pressed, onClick, disabled = false, title = undefined, children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${pressed ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card border-border hover:border-accent"} ${disabled ? "opacity-45 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

// Adding a service: what passengers see (name, summary, price, what is included), where it runs, and what kind it is,
// which decides how the supervisor desk treats it. A service's code cannot be changed once it exists.
function AddService({ existingCodes, onCreated, onCancel }) {
  const [f, setF] = useState(blank);
  const [codeTouched, setCodeTouched] = useState(false);
  const [problems, setProblems] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Editing a field clears its message, so a fixed mistake does not stay on screen.
  const set = (k, v) => {
    setF((s) => ({ ...s, [k]: v }));
    setProblems((p) => (p[k] ? Object.fromEntries(Object.entries(p).filter(([key]) => key !== k)) : p));
  };
  const code = codeTouched ? f.code : freeCode(f.name, existingCodes);

  const changeKind = (kind) => setF((s) => ({ ...s, kind, flight_type: kind === "meet_assist" && s.flight_type === "both" ? "arrival" : s.flight_type, includes_lounge: kind === "meet_assist" ? s.includes_lounge : false }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const { problems: found, value } = checkNewService({ ...f, code }, existingCodes);
    setProblems(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await api.entities.ServicePackage.create(value);
      onCreated(value);
    } catch (err) {
      setError(serviceSaveMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const err = (k) => problems[k] && <p role="alert" className="text-xs text-destructive">{problems[k]}</p>;

  return (
    <form onSubmit={submit} noValidate className="bg-card rounded-2xl border border-accent/40 p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Add a service</h3>
          <p className="text-xs text-muted-foreground mt-0.5">It appears on the booking page and the home page as soon as it is saved and switched on.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="w-4 h-4 mr-1" aria-hidden="true" /> Close</Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sv-name" className="text-xs">Name</Label>
          <Input id="sv-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. VIP Fast Track" autoComplete="off" maxLength={80} />
          {err("name")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sv-code" className="text-xs">Code <span className="font-normal text-muted-foreground">(made from the name; cannot be changed later)</span></Label>
          <Input id="sv-code" value={code} onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40)); }} className="font-mono text-sm" autoComplete="off" />
          {err("code")}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground">What kind of service is it?</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_KINDS.map((k) => <Choice key={k.key} pressed={f.kind === k.key} onClick={() => changeKind(k.key)}>{k.label}</Choice>)}
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl">{SERVICE_KINDS.find((k) => k.key === f.kind)?.help}</p>
        {err("kind")}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-foreground">Where does it run?</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_DIRECTIONS.map((d) => (
            <Choice key={d.key} pressed={f.flight_type === d.key} disabled={d.key === "both" && f.kind !== "porter"} onClick={() => set("flight_type", d.key)}
              title={d.key === "both" && f.kind !== "porter" ? "Only a porter service can work in both directions" : undefined}>{d.label}</Choice>
          ))}
        </div>
        {f.kind !== "porter" && <p className="text-xs text-muted-foreground">Arrival and departure together is for porter services only.</p>}
        {err("flight_type")}
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sv-price" className="text-xs">Price per passenger (GHS)</Label>
          <Input id="sv-price" type="number" min={0} step="0.01" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} />
          {err("price")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sv-usd" className="text-xs">Price in US dollars <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="sv-usd" type="number" min={0} step="0.01" inputMode="decimal" value={f.price_usd} onChange={(e) => set("price_usd", e.target.value)} placeholder="e.g. 25" />
          {err("price_usd")}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sv-desc" className="text-xs">Short summary <span className="font-normal text-muted-foreground">(one line, shown on the home page)</span></Label>
          <Input id="sv-desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Straight to the front of the queue." maxLength={200} autoComplete="off" />
          {err("description")}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sv-inc" className="text-xs">What is included <span className="font-normal text-muted-foreground">(one item per line)</span></Label>
          <Textarea id="sv-inc" value={f.inclusions} onChange={(e) => set("inclusions", e.target.value)} rows={2} placeholder={"Curbside meet and greet\nFast lane through security"} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-5">
          {f.kind === "meet_assist" && f.flight_type === "departure" && (
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.includes_lounge} onCheckedChange={(v) => set("includes_lounge", v)} /> Lounge access</label>
          )}
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => set("active", v)} /> Switched on (passengers can book it)</label>
        </div>
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />} Add service</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

export default function PackageManager() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.ServicePackage.filter({}, { sort: "price" });
      setPackages(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const existingCodes = useMemo(() => packages.map((p) => p.code), [packages]);

  const fromPackage = (p) => ({
    name: p.name,
    price: p.price,
    price_usd: p.price_usd ?? "",
    description: p.description ?? "",
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    includes_lounge: p.includes_lounge,
    active: p.active,
  });
  const draft = (p) => drafts[p.id] || fromPackage(p);

  const setDraft = (id, k, v) =>
    setDrafts((d) => {
      const pkg = packages.find((p) => p.id === id);
      const base = pkg ? fromPackage(pkg) : {};
      return { ...d, [id]: { ...base, ...(d[id] || {}), [k]: v } };
    });

  const save = async (p) => {
    setSaving(p.id);
    try {
      const d = draft(p);
      await api.entities.ServicePackage.update(p.id, {
        name: d.name,
        price: Number(d.price),
        price_usd: d.price_usd === "" || d.price_usd === null ? null : Number(d.price_usd),
        description: String(d.description || "").trim() || null,
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
      notifyError(serviceSaveMessage(e) || "Failed to save package.");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !packages.length) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading packages…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Service packages</h2>
          <p className="text-xs text-muted-foreground mt-0.5">The services passengers can book. Add a new one, change a price, or switch one off.</p>
        </div>
        {!adding && <Button onClick={() => { setAdding(true); setAdded(""); }}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Add a service</Button>}
      </div>

      {added && (
        <p role="status" className="flex items-center gap-2 text-sm rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {added}
        </p>
      )}

      {adding && (
        <AddService
          existingCodes={existingCodes}
          onCancel={() => setAdding(false)}
          onCreated={(v) => {
            setAdding(false);
            setAdded(v.active ? `${v.name} is added and is on the booking page now.` : `${v.name} is added but switched off, so passengers cannot book it yet.`);
            load();
          }}
        />
      )}

      {packages.map((p) => {
        const d = draft(p);
        return (
          <div key={p.id} className={`bg-card rounded-2xl border border-border p-5 ${p.active ? "" : "opacity-80"}`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-accent" />
              <span className="font-mono text-xs uppercase text-muted-foreground">{p.code}</span>
              <span className="text-xs text-muted-foreground">· {formatGHS(p.price)}/passenger</span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{directionLabel(p.flight_type)}</span>
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{kindLabel(p.kind)}</span>
                {!p.active && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">Switched off</span>}
              </span>
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
                <Label className="text-xs">Price in US dollars (optional)</Label>
                <Input type="number" min={0} step="0.01" value={d.price_usd} onChange={(e) => setDraft(p.id, "price_usd", e.target.value)} placeholder="e.g. 50" />
                <p className="text-xs text-muted-foreground">Shown to passengers who choose dollars. Leave empty to show this service in cedis only. Bookings and payments stay in cedis.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Short summary (optional)</Label>
                <Input value={d.description} onChange={(e) => setDraft(p.id, "description", e.target.value)} maxLength={200} placeholder="One line shown on the home page" />
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
