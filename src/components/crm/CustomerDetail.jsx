import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/db";
import BookingList from "@/components/BookingList";
import ConfirmAction from "@/components/ConfirmAction";
import { SegmentBadge } from "@/components/crm/CustomerList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Phone } from "lucide-react";
import { NOTE_KINDS, TAG_SUGGESTIONS, customerLabel, followUpState, parseTags } from "@/lib/crm";
import { todayUtc } from "@/lib/bookingFormRules";
import { formatGHS } from "@/lib/packages";
import { isPhone } from "@/lib/bookingFormRules";
import { notifyError } from "@/lib/notify";

const kindLabel = (k) => NOTE_KINDS.find((x) => x.key === k)?.label || "Note";
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

// Same grouping as the customer list: what they have booked and paid, without cancelled bookings.
function summarise(bookings) {
  const live = bookings.filter((b) => b.status !== "cancelled");
  const open = live.filter((b) => b.status !== "no_show");
  const dates = live.map((b) => b.flight_date).filter(Boolean).sort();
  return {
    count: live.length,
    collected: live.reduce((s, b) => s + Number(b.amount_collected || 0), 0),
    outstanding: open.reduce((s, b) => s + Number(b.outstanding_balance || 0), 0),
    first: dates[0] || "",
    last: dates[dates.length - 1] || "",
  };
}

function segmentOf(customer, s) {
  if ((customer.tags || []).includes("vip")) return "vip";
  if (s.count === 0) return "new";
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  if (s.last && s.last < cutoff) return "lapsed";
  return s.count >= 2 ? "returning" : "new";
}

export default function CustomerDetail({ id, isAdmin, onBack }) {
  const [customer, setCustomer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, b, n] = await Promise.all([
        api.entities.Customer.get(id),
        api.entities.Booking.filter({ customer_id: id }, { sort: "-created_date", limit: 200 }),
        api.entities.CustomerNote.filter({ customer_id: id }, { sort: "-created_date", limit: 200 }),
      ]);
      setCustomer(c);
      setBookings(b.items || []);
      setNotes(n.items || []);
    } catch (e) {
      setLoadError(e.status === 404 ? "That customer was not found." : e.message || "Could not load this customer.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const stats = useMemo(() => summarise(bookings), [bookings]);

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>;
  if (loadError || !customer) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <p role="alert" className="text-sm text-destructive">{loadError || "That customer was not found."}</p>
      </div>
    );
  }

  const segment = segmentOf(customer, stats);
  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />

      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-foreground">{customerLabel(customer)}</h2>
            <SegmentBadge segment={segment} />
            {customer.user_id && <span className="text-xs border border-border rounded-full px-2 py-0.5 text-muted-foreground">Has a website account</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline mr-3">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> {customer.phone}
              </a>
            )}
            {customer.email}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Fact label="Bookings" value={stats.count} />
        <Fact label="Paid so far" value={formatGHS(stats.collected)} />
        <Fact label="Still owed" value={formatGHS(stats.outstanding)} />
        <Fact label="Last flight" value={stats.last || "None yet"} small />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Details customer={customer} onSaved={setCustomer} />
        <Notes customerId={customer.id} notes={notes} setNotes={setNotes} />
      </div>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">Bookings</h3>
        <BookingList bookings={bookings} loading={false} emptyMessage="No bookings linked to this customer yet." />
      </section>

      {isAdmin && (
        <section className="bg-card rounded-2xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground">Delete personal data</h3>
          {customer.user_id ? (
            <p className="text-xs text-muted-foreground mt-1">This customer has a website account. To delete their data, use Erase on their row in Staff accounts, which also removes their login and files.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mt-1">For a customer who asks to be forgotten. Their name, phone, email, tags and notes are removed and their bookings no longer name them. Payments stay for the accounts.</p>
              <ConfirmAction
                title={`Delete the personal data of ${customerLabel(customer)}?`}
                description="This removes their details, notes and the names on their bookings. It cannot be undone."
                confirmLabel="Delete personal data"
                destructive
                onConfirm={async () => {
                  try {
                    await api.crm.erase(customer.id);
                    onBack();
                  } catch (e) {
                    notifyError(e.message || "Could not delete.");
                  }
                }}
              >
                <Button variant="outline" className="mt-3 text-destructive">Delete personal data</Button>
              </ConfirmAction>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function BackButton({ onBack }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All customers
    </button>
  );
}

function Fact({ label, value, small = false }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`tabular font-semibold tracking-tight text-foreground mt-1 ${small ? "text-base" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function Details({ customer, onSaved }) {
  const [name, setName] = useState(customer.full_name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [nationality, setNationality] = useState(customer.nationality || "");
  const [tags, setTags] = useState((customer.tags || []).join(", "));
  const [consent, setConsent] = useState(Boolean(customer.marketing_consent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });

  const save = async (e) => {
    e.preventDefault();
    setMessage({ kind: "", text: "" });
    if (phone.trim() && !isPhone(phone)) return setMessage({ kind: "error", text: "Enter a phone number with at least 7 digits. Add the country code if it is not a Ghana number." });
    setSaving(true);
    try {
      const saved = await api.entities.Customer.update(customer.id, {
        full_name: name.trim(), phone: phone.trim(), email: email.trim(), nationality: nationality.trim(),
        tags: parseTags(tags), marketing_consent: consent,
      });
      onSaved(saved);
      setTags((saved.tags || []).join(", "));
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: /customers_phone_idx|23505|duplicate/i.test(err.message || "") ? "Another customer already has that phone number." : err.message || "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const addTag = (t) => {
    const list = parseTags(tags);
    if (!list.includes(t)) setTags([...list, t].join(", "));
  };

  return (
    <form onSubmit={save} noValidate className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Details</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="cd-name" className="text-xs">Name</Label><Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="cd-phone" className="text-xs">Phone or WhatsApp</Label><Input id="cd-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="cd-email" className="text-xs">Email</Label><Input id="cd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="cd-nat" className="text-xs">Nationality</Label><Input id="cd-nat" value={nationality} onChange={(e) => setNationality(e.target.value)} autoComplete="off" /></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cd-tags" className="text-xs">Tags</Label>
        <Input id="cd-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, corporate" autoComplete="off" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TAG_SUGGESTIONS.map((t) => (
            <button key={t} type="button" onClick={() => addTag(t)} className="text-xs border border-border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-accent">+ {t}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Separate tags with commas. "vip" marks a VIP customer.</p>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          This customer has agreed to receive offers and news from us.
          <span className="block text-xs text-muted-foreground">Tick only if they said yes. Only these customers appear in the offers export.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save details</Button>
        {message.text && <span role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-emerald-700"}`}>{message.text}</span>}
      </div>
    </form>
  );
}

function Notes({ customerId, notes, setNotes }) {
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const today = todayUtc();

  const add = async (e) => {
    e.preventDefault();
    setError("");
    if (!body.trim()) return setError("Write what was said or agreed.");
    setSaving(true);
    try {
      const n = await api.entities.CustomerNote.create({ customer_id: customerId, kind, body: body.trim(), follow_up_on: followUp || null });
      setNotes((x) => [n, ...x]);
      setBody("");
      setFollowUp("");
      setKind("note");
    } catch (err) {
      setError(err.message || "Could not save the note.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (n) => {
    try {
      const saved = await api.entities.CustomerNote.update(n.id, { done: !n.done });
      setNotes((x) => x.map((y) => (y.id === n.id ? saved : y)));
    } catch (err) {
      notifyError(err.message || "Could not update the follow-up.");
    }
  };

  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">Notes and follow-ups</h3>
      <form onSubmit={add} noValidate className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cn-kind" className="text-xs">What happened</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="cn-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{NOTE_KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-follow" className="text-xs">Follow up on (optional)</Label>
            <Input id="cn-follow" type="date" min={today} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cn-body" className="text-xs">Note</Label>
          <Textarea id="cn-body" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was said or agreed" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add note</Button>
      </form>

      <ul className="mt-5 divide-y divide-border">
        {notes.length === 0 && <li className="text-sm text-muted-foreground py-3">No notes yet. Record calls, requests and promises here so anyone on the team can pick up where you left off.</li>}
        {notes.map((n) => {
          const state = followUpState(n, today);
          return (
            <li key={n.id} className="py-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{kindLabel(n.kind)}</span> · {n.author_name || "Staff"} · {when(n.created_date)}
              </p>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">{n.body}</p>
              {n.follow_up_on && (
                <p className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${n.done ? "bg-secondary text-muted-foreground" : state === "overdue" ? "bg-rose-100 text-rose-800" : state === "today" ? "bg-amber-100 text-amber-900" : "bg-secondary text-foreground"}`}>
                    {n.done ? "Followed up" : state === "overdue" ? "Overdue" : "Follow up"} · {n.follow_up_on}
                  </span>
                  <button type="button" onClick={() => toggleDone(n)} className="text-primary hover:underline">{n.done ? "Reopen" : "Mark done"}</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
