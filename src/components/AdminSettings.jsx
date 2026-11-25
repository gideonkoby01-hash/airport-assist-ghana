import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, CreditCard, Globe, KeyRound, Loader2, Mail, MessageSquareText, Settings2, ShieldAlert } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { useSettings } from "@/lib/SettingsContext";
import { SMTP_PRESETS, smtpHints } from "@/lib/smtpHelp";

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
      {def.type === "select" && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue /></SelectTrigger>
          <SelectContent>
            {def.options.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
          </SelectContent>
        </Select>
      )}
      {def.type === "textarea" && <Textarea id={id} value={value} maxLength={def.maxLength} rows={2} onChange={(e) => onChange(e.target.value)} />}
      {["text", "email", "number", "time", "hostname"].includes(def.type) && (
        <Input
          id={id}
          type={def.type === "number" ? "number" : def.type === "time" ? "time" : def.type === "email" ? "email" : "text"}
          autoComplete="off"
          spellCheck={def.type === "hostname" ? false : undefined}
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
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          placeholder={secret.configured ? "Enter a new one to replace it" : secret.prefix ? `Paste the key (starts with ${secret.prefix})` : secret.group === "sms" ? "Paste it here" : "Enter the password"}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button onClick={save} disabled={busy || !value.trim() || !encryptionReady}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save key"}
        </Button>
        {secret.source === "saved" && (
          <ConfirmAction
            title={`Remove the ${secret.label}?`}
            description="The saved value is deleted. If one is also set on the server it will be used again; otherwise sending stops working until a new one is saved."
            confirmLabel="Remove key"
            destructive
            onConfirm={() => onClear(secret.name)}
          >
            <Button variant="outline">Remove</Button>
          </ConfirmAction>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{secret.help} Get it from: {secret.where}.</p>
      <p className="text-xs text-muted-foreground">{status}. It is stored encrypted and is never shown again.</p>
    </div>
  );
}

// The public website switch. Anyone with Settings can see whether the public website is open; only the super admin can change it
// (while no super admin has been set, any admin can). When it is closed, the home, booking, payment and privacy pages send visitors
// to the staff sign-in, and the booking and payment functions refuse. Staff dashboards are never affected.
function PublicSiteCard({ overview, onChange, busy }) {
  const open = overview.settings.find((s) => s.key === "public_site_enabled")?.value !== "false";
  const may = !overview.super_admin?.set || overview.super_admin?.you;
  return (
    <section className={`rounded-2xl border p-5 ${open ? "bg-card border-border" : "bg-amber-50 border-amber-200"}`} aria-label="Public website">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-accent" aria-hidden="true" /> Public website
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${open ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}>{open ? "Open" : "Closed"}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            {open
              ? "Visitors can see the home page, book and pay. Close it to run the system as staff-only: the public pages send visitors to the staff sign-in, and online booking and payment stop."
              : "The public website is closed. Visitors are taken to the staff sign-in, and online booking and payment are refused. Staff sign in and work as normal."}
          </p>
          {!may && <p className="text-xs text-muted-foreground mt-2">Only the super admin can change this.</p>}
        </div>
        {may && (
          <ConfirmAction
            title={open ? "Close the public website?" : "Open the public website?"}
            description={open
              ? "The home page, booking, payment and privacy pages stop working for visitors and send them to the staff sign-in. Bookings already made are not affected, and staff keep working as normal. You can open it again at any time."
              : "The home page, booking, payment and privacy pages become available to the public again."}
            confirmLabel={open ? "Close the website" : "Open the website"}
            destructive={open}
            onConfirm={() => onChange(open ? "false" : "true")}
          >
            <Button variant={open ? "outline" : "default"} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> : null}{open ? "Close the public website" : "Open the public website"}
            </Button>
          </ConfirmAction>
        )}
      </div>
    </section>
  );
}

// The admin Settings page. Everything is drawn from the list the adminSettings function sends, so the rules shown here are
// the rules the server enforces. API keys are written but never read back.
export default function AdminSettings() {
  const { refresh: refreshPublic } = useSettings();
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState(/** @type {Record<string, string>} */ ({}));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [savedGroup, setSavedGroup] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [checkingSmtp, setCheckingSmtp] = useState(false);
  const [presetNote, setPresetNote] = useState("");
  const [checkingKey, setCheckingKey] = useState(false);
  const [keyResult, setKeyResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsResult, setSmsResult] = useState(null);

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

  const [siteBusy, setSiteBusy] = useState(false);
  const setPublicSite = async (value) => {
    setSiteBusy(true);
    setError("");
    try {
      adopt((await call({ action: "save", changes: { public_site_enabled: value } })).overview);
      refreshPublic();
    } catch (e) {
      setError(e.message || "Could not change the public website.");
    } finally {
      setSiteBusy(false);
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

  const visible = (item) => !item.showWhen || drafts[item.showWhen.key] === item.showWhen.value;

  const applyPreset = (label) => {
    const p = SMTP_PRESETS.find((x) => x.label === label);
    if (!p) return;
    setDrafts((d) => ({ ...d, smtp_host: p.host, smtp_port: p.port, smtp_security: p.security, ...(p.username ? { smtp_username: p.username } : {}) }));
    setPresetNote(p.note || "");
  };

  const checkSmtp = async () => {
    setCheckingSmtp(true);
    setTestResult(null);
    try {
      setTestResult(await call({ action: "test_smtp" }));
    } catch (e) {
      setTestResult({ ok: false, message: e.message || "The connection check failed." });
    } finally {
      setCheckingSmtp(false);
    }
  };

  const checkPaystackKey = async () => {
    setCheckingKey(true);
    setKeyResult(null);
    try {
      setKeyResult(await api.payments.testKey());
    } catch (e) {
      setKeyResult({ ok: false, message: e.message || "The key check failed." });
    } finally {
      setCheckingKey(false);
    }
  };

  const copyWebhook = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const sendTestSms = async () => {
    setSmsTesting(true);
    setSmsResult(null);
    try {
      setSmsResult(await call({ action: "test_sms", phone: smsPhone }));
    } catch (e) {
      setSmsResult({ ok: false, message: e.message || "The test text could not be sent." });
    } finally {
      setSmsTesting(false);
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
  const order = ["email", "sms", "business", "bookings", "payments", "operations", "privacy"];
  const paystackKeySet = secrets.some((x) => x.name === "PAYSTACK_SECRET_KEY" && x.configured);

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

      <PublicSiteCard overview={overview} onChange={setPublicSite} busy={siteBusy} />

      {order.map((group) => {
        const allFields = (byGroup[group] || []).filter(visible).filter((f) => !f.superAdminOnly);
        // The way of sending comes first, because the keys and fields below depend on it.
        const leadFields = allFields.filter((f) => f.key === "email_provider");
        const fields = allFields.filter((f) => f.key !== "email_provider");
        const groupSecrets = secrets.filter((s) => s.group === group).filter(visible);
        const smtpOn = group === "email" && drafts.email_provider === "smtp";
        const changed = changedIn(group);
        return (
          <Card key={group} icon={group === "email" ? Mail : group === "sms" ? MessageSquareText : group === "payments" ? CreditCard : Settings2} title={groups[group].title} blurb={groups[group].blurb}>
            <div className="space-y-5">
              {leadFields.map((def) => (
                <SettingField
                  key={def.key}
                  def={def}
                  value={drafts[def.key] ?? ""}
                  source={def.source}
                  onChange={(v) => setDrafts((d) => ({ ...d, [def.key]: v }))}
                  onReset={() => resetOne(def.key)}
                />
              ))}
              {smtpOn && (
                <div className="space-y-1.5 rounded-lg bg-secondary/60 p-3">
                  <Label htmlFor="smtp-preset">Fill in from a provider</Label>
                  <Select value="" onValueChange={applyPreset}>
                    <SelectTrigger id="smtp-preset"><SelectValue placeholder="Choose your provider (optional)" /></SelectTrigger>
                    <SelectContent>
                      {SMTP_PRESETS.map((p) => (<SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Fills in the server, port and security below. Check your provider's current instructions, then save.</p>
                  {presetNote && <p className="text-xs text-amber-800" role="status">{presetNote}</p>}
                </div>
              )}
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
              {smtpOn && smtpHints({ port: drafts.smtp_port, security: drafts.smtp_security }).map((h) => (
                <p key={h} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2" role="note">{h}</p>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => saveGroup(group)} disabled={saving === group || changed.length === 0}>
                  {saving === group ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save {groups[group].title.toLowerCase()} settings
                </Button>
                {changed.length > 0 && <span className="text-xs text-muted-foreground">{changed.length} unsaved change{changed.length > 1 ? "s" : ""}</span>}
                {savedGroup === group && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Saved. Takes effect within a few seconds.</span>}
                {smtpOn && (
                  <Button variant="outline" onClick={checkSmtp} disabled={checkingSmtp || changed.length > 0}
                    title={changed.length > 0 ? "Save your changes first; the check uses the saved settings" : undefined}>
                    {checkingSmtp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Check connection
                  </Button>
                )}
                {group === "email" && (
                  <Button variant="outline" onClick={sendTest} disabled={testing || changed.length > 0}
                    title={changed.length > 0 ? "Save your changes first; the test uses the saved settings" : undefined}>
                    {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />} Send me a test email
                  </Button>
                )}
              </div>
              {group === "sms" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sms-test-phone" className="text-xs">Send a test text to</Label>
                      <Input id="sms-test-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} className="w-52" />
                    </div>
                    <Button variant="outline" onClick={sendTestSms} disabled={smsTesting || !smsPhone.trim() || changed.length > 0}
                      title={changed.length > 0 ? "Save your changes first; the test uses the saved settings" : undefined}>
                      {smsTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquareText className="w-4 h-4 mr-2" aria-hidden="true" />} Send test text
                    </Button>
                  </div>
                  {smsResult && <p className={`text-sm ${smsResult.ok ? "text-emerald-700" : "text-destructive"}`} role="status">{smsResult.message}</p>}
                  <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">Set up text messages (once)</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>In your Hubtel account, make sure SMS is switched on and has credit. Copy the SMS <span className="font-medium text-foreground">client ID and client secret</span> and save them above.</li>
                      <li>Ask Hubtel to approve your <span className="font-medium text-foreground">sender name</span> (up to 11 letters or numbers), then type it in above and save.</li>
                      <li>Type your own phone number here and press "Send test text". When it arrives, switch on "Text passengers about their booking" and save.</li>
                    </ol>
                    <p>Passengers are texted at the phone number they gave on the booking, when the booking is received, when a supervisor is assigned (with their name and number), and when the service starts, finishes, is cancelled or missed. Staff are not texted.</p>
                  </div>
                </div>
              )}
              {group === "payments" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={checkPaystackKey} disabled={checkingKey || !paystackKeySet}
                      title={!paystackKeySet ? "Save the Paystack secret key first" : undefined}>
                      {checkingKey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" aria-hidden="true" />} Test the key
                    </Button>
                    {keyResult && <span className={`text-sm ${keyResult.ok ? "text-emerald-700" : "text-destructive"}`} role="status">{keyResult.message}</span>}
                  </div>
                  {drafts.paystack_enabled === "true" && !paystackKeySet && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2" role="note">
                      Online payment is switched on, but no Paystack secret key is saved. Passengers will not see the "Pay now" button until one is.
                    </p>
                  )}
                  <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">Set up Paystack (once)</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Paystack dashboard &gt; Settings &gt; API Keys &amp; Webhooks. Copy the <span className="font-medium text-foreground">Test</span> secret key (starts sk_test_) and save it above. Use "Test the key".</li>
                      <li>On the same Paystack page, set the <span className="font-medium text-foreground">Test Webhook URL</span> to the address below. Do the same for the Live webhook when you go live.</li>
                      <li>Switch on "Let passengers pay online", save, and make a test booking. Pay with a Paystack test card. Check it appears in Accounts &gt; Payments.</li>
                      <li>To go live, replace the key with the Live secret key (sk_live_) and set the Live Webhook URL. Test payments move no real money.</li>
                    </ol>
                    {system.paystack_webhook_url ? (
                      <div className="flex items-center gap-2 pt-1">
                        <code className="flex-1 min-w-0 break-all rounded bg-secondary px-2 py-1.5 text-foreground">{system.paystack_webhook_url}</code>
                        <Button type="button" size="sm" variant="outline" onClick={() => copyWebhook(system.paystack_webhook_url)} aria-label="Copy the webhook address">
                          {copied ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                        </Button>
                      </div>
                    ) : <p>The webhook address could not be worked out here. It is your Supabase project address followed by /functions/v1/paystackWebhook.</p>}
                    <p>Paystack pays out to your bank after a day or two. When it does, record it in Accounts &gt; Banking as "Card takings settled into the bank".</p>
                  </div>
                </div>
              )}
              {group === "email" && testResult && (
                <p className={`text-sm ${testResult.ok ? "text-emerald-700" : "text-destructive"}`} role="status">{testResult.message}</p>
              )}
              {group === "email" && (
                <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Sign-up codes and password-reset emails</p>
                  <p>
                    These are sent by Supabase's own sign-in service, not by this page, so they have separate settings in the Supabase dashboard
                    (Authentication &gt; Emails &gt; SMTP Settings). To send them through the same mail server, enter these there:
                  </p>
                  {drafts.email_provider === "smtp" ? (
                    <ul className="list-disc pl-5">
                      <li>Host: <span className="font-mono text-foreground">{drafts.smtp_host || "(not set)"}</span>, port <span className="font-mono text-foreground">{drafts.smtp_port}</span></li>
                      <li>Username: <span className="font-mono text-foreground">{drafts.smtp_username || "(none)"}</span>, and the same password</li>
                      <li>Sender: <span className="font-mono text-foreground">{drafts.email_from || "(not set)"}</span></li>
                    </ul>
                  ) : (
                    <ul className="list-disc pl-5">
                      <li>Host <span className="font-mono text-foreground">smtp.resend.com</span>, port <span className="font-mono text-foreground">465</span>, username <span className="font-mono text-foreground">resend</span>, password = your Resend API key</li>
                      <li>Sender: <span className="font-mono text-foreground">{drafts.email_from || "(not set)"}</span></li>
                    </ul>
                  )}
                  <p className="pt-1">
                    <span className="font-medium text-foreground">Email confirmation at sign-up is currently a Supabase setting.</span>{" "}
                    While it is off, new passengers are signed in straight away. Once the mail server above works (use Send me a test email, and
                    enter the same details in Supabase), switch it on under Authentication &gt; Sign In / Providers &gt; Email &gt; Confirm email, and new
                    accounts will be asked to confirm their email.
                  </p>
                </div>
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
