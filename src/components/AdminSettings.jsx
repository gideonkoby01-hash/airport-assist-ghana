import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Mail, Settings2, ShieldAlert } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { useSettings } from "@/lib/SettingsContext";

const SOURCE_NOTE = {
  saved: "Set here",
  environment: "From a server setting. Save here to override it.",
  default: "Built-in default",
};

function Card({ icon: Icon, title, blurb, children }) {
  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Icon className="w-4 h-4 text-accent" aria-hidden="true" /> {title}</h3>
      {blurb && <p className="text-xs text-muted-foreground mt-1 mb-4">{blurb}</p>}
      {children}
    </section>
  );
}

function SettingField({ def, value, source, onChange, onReset }) {
  const id = `setting-${def.key}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{def.label}{def.unit ? <span className="font-normal text-muted-foreground"> ({def.unit})</span> : null}</Label>
        {def.type === "boolean" && (
          <Switch id={id} checked={value === "true"} onCheckedChange={(on) => onChange(on ? "true" : "false")} />
        )}
      </div>
      {def.type === "textarea" && <Textarea id={id} value={value} maxLength={def.maxLength} rows={2} onChange={(e) => onChange(e.target.value)} />}
      {["text", "email", "number", "time"].includes(def.type) && (
        <Input
          id={id}
          type={def.type === "number" ? "number" : def.type === "time" ? "time" : def.type === "email" ? "email" : "text"}
          value={value}
          min={def.min}
          max={def.max}
          step={def.type === "number" ? "any" : undefined}
          maxLength={def.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {def.help}{" "}
        <span className="whitespace-nowrap">
          · {SOURCE_NOTE[source]}
          {source === "saved" && (
            <button type="button" className="ml-2 text-primary hover:underline" onClick={onReset}>Use default</button>
          )}
        </span>
      </p>
    </div>
  );
}

function SecretField({ secret, encryptionReady, onSave, onClear }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `secret-${secret.name}`;
  const status =
    secret.source === "saved" ? `Saved here, ends in ${secret.last4 || "••••"}${secret.updated_date ? `, updated ${new Date(secret.updated_date).toLocaleDateString("en-GB", { dateStyle: "medium" })}` : ""}`
    : secret.source === "environment" ? `Set on the server${secret.last4 ? `, ends in ${secret.last4}` : ""}. Save one here to replace it`
    : "Not set";

  const save = async () => {
    setBusy(true);
    const ok = await onSave(secret.name, value);
    setBusy(false);
    if (ok) setValue("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{secret.label}</Label>
        <span className={`text-xs font-medium ${secret.configured ? "text-emerald-600" : "text-amber-600"}`}>{secret.configured ? "Set" : "Not set"}</span>
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={secret.configured ? "Paste a new key to replace it" : `Paste the key (starts with ${secret.prefix})`}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button onClick={save} disabled={busy || !value.trim() || !encryptionReady}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save key"}
        </Button>
        {secret.source === "saved" && (
          <ConfirmAction
            title={`Remove the ${secret.label}?`}
            description="The saved key is deleted. If a key is also set on the server it will be used again; otherwise this feature stops working until a new key is saved."
            confirmLabel="Remove key"
            destructive
            onConfirm={() => onClear(secret.name)}
          >
            <Button variant="outline">Remove</Button>
          </ConfirmAction>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{secret.help} Get it from: {secret.where}.</p>
      <p className="text-xs text-muted-foreground">{status}. The key is stored encrypted and is never shown again.</p>
    </div>
  );
}

// The admin Settings page. Everything is drawn from the list the adminSettings function sends, so the rules shown here are
// the rules the server enforces. API keys are written but never read back.
export default function AdminSettings() {
  const { refresh: refreshPublic } = useSettings();
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [savedGroup, setSavedGroup] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const adopt = useCallback((o) => {
    setOverview(o);
    setDrafts(Object.fromEntries(o.settings.map((s) => [s.key, s.value])));
  }, []);

  const call = useCallback(async (payload) => (await api.functions.invoke("adminSettings", payload)).data, []);

  useEffect(() => {
    call({ action: "get" }).then(adopt).catch((e) => setError(e.message || "Could not load the settings."));
  }, [call, adopt]);

  const byGroup = useMemo(() => {
    const out = {};
    for (const s of overview?.settings || []) (out[s.group] ||= []).push(s);
    return out;
  }, [overview]);

  const changedIn = (group) => (byGroup[group] || []).filter((s) => drafts[s.key] !== s.value);

  const saveGroup = async (group) => {
    const changes = Object.fromEntries(changedIn(group).map((s) => [s.key, drafts[s.key]]));
    setSaving(group);
    setError("");
    try {
      const data = await call({ action: "save", changes });
      adopt(data.overview);
      setSavedGroup(group);
      setTimeout(() => setSavedGroup((g) => (g === group ? "" : g)), 4000);
      if (data.saved.some((k) => overview.settings.find((s) => s.key === k)?.public)) refreshPublic();
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving("");
    }
  };

  const resetOne = async (key) => {
    try {
      adopt((await call({ action: "reset", key })).overview);
      refreshPublic();
    } catch (e) {
      notifyError(e.message || "Could not reset that setting.");
    }
  };

  const saveSecret = async (name, value) => {
    setError("");
    try {
      adopt((await call({ action: "save_secret", name, value })).overview);
      return true;
    } catch (e) {
      setError(e.message || "Could not save the key.");
      return false;
    }
  };

  const clearSecret = async (name) => {
    try {
      adopt((await call({ action: "clear_secret", name })).overview);
    } catch (e) {
      notifyError(e.message || "Could not remove the key.");
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await call({ action: "test_email" }));
    } catch (e) {
      setTestResult({ ok: false, message: e.message || "The test email could not be sent." });
    } finally {
      setTesting(false);
    }
  };

  if (!overview) {
    return error
      ? <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">{error}</div>
      : <div className="flex items-center text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading settings…</div>;
  }

  const { groups, secrets, system, other_keys: otherKeys } = overview;
  const order = ["email", "business", "bookings", "operations", "privacy"];

  return (
    <div className="space-y-5 max-w-3xl">
      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">{error}</div>}

      {!system.encryption_ready && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm" role="alert">
          <p className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4" aria-hidden="true" /> API keys cannot be saved here yet</p>
          <p className="mt-1">{system.encryption_problem} The keys are stored encrypted, and the encryption key must be set once on the server. Run this in a terminal, then reload this page:</p>
          <pre className="mt-2 p-2 bg-white/70 rounded text-xs overflow-x-auto">supabase secrets set SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32)</pre>
          <p className="mt-2 text-xs">Keep a safe copy of that key. If it is lost, saved keys must be entered again.</p>
        </div>
      )}

      {order.map((group) => {
        const fields = byGroup[group] || [];
        const groupSecrets = secrets.filter((s) => s.group === group);
        const changed = changedIn(group);
        return (
          <Card key={group} icon={group === "email" ? Mail : Settings2} title={groups[group].title} blurb={groups[group].blurb}>
            <div className="space-y-5">
              {groupSecrets.length > 0 && (
                <div className="space-y-5 pb-5 border-b border-border">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> API keys</h4>
                  {groupSecrets.map((s) => (
                    <SecretField key={s.name} secret={s} encryptionReady={system.encryption_ready} onSave={saveSecret} onClear={clearSecret} />
                  ))}
                </div>
              )}
              {fields.map((def) => (
                <SettingField
                  key={def.key}
                  def={def}
                  value={drafts[def.key] ?? ""}
                  source={def.source}
                  onChange={(v) => setDrafts((d) => ({ ...d, [def.key]: v }))}
                  onReset={() => resetOne(def.key)}
                />
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => saveGroup(group)} disabled={saving === group || changed.length === 0}>
                  {saving === group ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save {groups[group].title.toLowerCase()} settings
                </Button>
                {changed.length > 0 && <span className="text-xs text-muted-foreground">{changed.length} unsaved change{changed.length > 1 ? "s" : ""}</span>}
                {savedGroup === group && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Saved. Takes effect within a few seconds.</span>}
                {group === "email" && (
                  <Button variant="outline" onClick={sendTest} disabled={testing}>
                    {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />} Send me a test email
                  </Button>
                )}
              </div>
              {group === "email" && testResult && (
                <p className={`text-sm ${testResult.ok ? "text-emerald-700" : "text-destructive"}`} role="status">{testResult.message}</p>
              )}
            </div>
          </Card>
        );
      })}

      <Card icon={ShieldAlert} title="Fixed by the server" blurb="These protect the whole system, so they are shown here but not editable from the website.">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Website address (APP_URL)</dt><dd className="font-medium break-all text-right">{system.app_url || "Not set"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Other allowed sites</dt><dd className="font-medium break-all text-right">{system.allowed_origins || "None"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Two-step verification required for admin and management</dt><dd className="font-medium">{system.staff_mfa_required ? "Yes" : "No (emergency switch is off)"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Scheduler secret (CRON_SECRET)</dt><dd className="font-medium">{system.cron_secret_set ? "Set" : "Not set: scheduled jobs will not run"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Settings encryption key</dt><dd className="font-medium">{system.encryption_ready ? "Set" : "Not set"}</dd></div>
        </dl>
      </Card>

      <Card icon={KeyRound} title="Other keys and where they live" blurb="Keys that other services need cannot be kept on this page. This is where each one is set.">
        <ul className="space-y-3 text-sm">
          {otherKeys.map((k) => (
            <li key={k.name}>
              <p className="font-medium">{k.name}</p>
              <p className="text-muted-foreground">{k.where} {k.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
