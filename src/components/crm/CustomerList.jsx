import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Plus, Search } from "lucide-react";
import { SEGMENTS, SEGMENT_HELP, SEGMENT_STYLES, customerLabel, followUpState } from "@/lib/crm";
import { todayUtc } from "@/lib/bookingFormRules";
import { formatGHS } from "@/lib/packages";
import { initials } from "@/lib/profile";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError } from "@/lib/notify";

const PAGE = 50;

export function SegmentBadge({ segment }) {
  if (!segment || !SEGMENT_STYLES[segment]) return null;
  const label = SEGMENTS.find((s) => s.key === segment)?.label;
  return (
    <span title={SEGMENT_HELP[segment]} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SEGMENT_STYLES[segment]}`}>
      {label}
    </span>
  );
}

function FollowUps({ onOpen }) {
  const [rows, setRows] = useState(null);
  const today = todayUtc();

  const load = useCallback(async () => {
    try {
      const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const page = await api.entities.CustomerNote.filter({ done: false, follow_up_on: { $lte: soon } }, { sort: "follow_up_on", limit: 12 });
      const notes = page.items || [];
      const ids = [...new Set(notes.map((n) => n.customer_id))];
      const customers = ids.length ? (await api.entities.Customer.filter({ id: { $in: ids } }, { limit: 50 })).items || [] : [];
      const byId = Object.fromEntries(customers.map((c) => [c.id, c]));
      setRows(notes.map((n) => ({ ...n, customer: byId[n.customer_id] })));
    } catch {
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const markDone = async (n) => {
    try {
      await api.entities.CustomerNote.update(n.id, { done: true });
      setRows((r) => r.filter((x) => x.id !== n.id));
    } catch (e) {
      notifyError(e.message || "Could not update that follow-up.");
    }
  };

  if (!rows || rows.length === 0) return null;
  const STATE = { overdue: ["Overdue", "bg-rose-100 text-rose-800"], today: ["Today", "bg-amber-100 text-amber-900"], later: ["This week", "bg-secondary text-muted-foreground"] };
  return (
    <section className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground">Follow-ups</h3>
      <p className="text-xs text-muted-foreground mt-0.5">Calls and messages you promised, due in the next 7 days or overdue.</p>
      <ul className="mt-2 divide-y divide-border">
        {rows.map((n) => {
          const [label, cls] = STATE[followUpState(n, today)] || STATE.later;
          return (
            <li key={n.id} className="flex items-center gap-3 py-2.5">
              <button type="button" onClick={() => n.customer && onOpen(n.customer.id)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-foreground truncate">{customerLabel(n.customer)}</p>
                <p className="text-xs text-muted-foreground truncate">{n.body}</p>
              </button>
              <span className={`shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${cls}`}>{label} · {n.follow_up_on}</span>
              <Button size="sm" variant="outline" onClick={() => markDone(n)}>Done</Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewCustomer({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim() && !phone.trim()) return setError("Enter a name or a phone number.");
    setSaving(true);
    try {
      const c = await api.entities.Customer.create({ full_name: name.trim(), phone: phone.trim(), email: email.trim() });
      setOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      onCreated(c.id);
    } catch (err) {
      setError(/customers_phone_idx|23505|duplicate/i.test(err.message || "") ? "A customer with that phone number already exists. Search for them instead." : err.message || "Could not add the customer.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" /> New customer
      </Button>
    );
  }
  return (
    <form onSubmit={save} className="w-full bg-card rounded-2xl border border-border p-5 space-y-3" noValidate>
      <h3 className="text-sm font-semibold text-foreground">New customer</h3>
      <p className="text-xs text-muted-foreground">For someone who has asked about a service but not booked yet. Bookings add customers automatically.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label htmlFor="nc-name" className="text-xs">Name</Label><Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="nc-phone" className="text-xs">Phone or WhatsApp</Label><Input id="nc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1.5"><Label htmlFor="nc-email" className="text-xs">Email</Label><Input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add customer</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export default function CustomerList({ onOpen }) {
  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("recent");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api.crm.list({ search, segment, sort, limit: PAGE, offset: 0 })
      .then((r) => {
        if (!live) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) => live && setError(e.message || "Could not load customers."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [search, segment, sort]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await api.crm.list({ search, segment, sort, limit: PAGE, offset: rows.length });
      setRows((x) => [...x, ...r.rows]);
    } catch (e) {
      notifyError(e.message || "Could not load more customers.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Only people who ticked "happy to receive offers" are exported for marketing.
  const exportConsented = async () => {
    try {
      let all = [];
      for (let offset = 0; offset < 5000; offset += 200) {
        const r = await api.crm.list({ segment: "all", sort: "name", limit: 200, offset });
        all = all.concat(r.rows);
        if (r.rows.length < 200) break;
      }
      const list = all.filter((c) => c.marketing_consent && (c.phone || c.email));
      if (!list.length) return notifyError("Nobody has agreed to offers yet.");
      downloadCsv(`customers_agreed_to_offers_${todayUtc()}.csv`, toCsv(list, [
        { key: "full_name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
        { key: "segment", label: "Segment" }, { key: "bookings_count", label: "Bookings" }, { key: "last_flight", label: "Last flight" },
      ]));
    } catch (e) {
      notifyError(e.message || "Could not export.");
    }
  };

  return (
    <div className="space-y-5">
      <FollowUps onOpen={onOpen} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Show customers">
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={segment === s.key}
                onClick={() => setSegment(s.key)}
                title={SEGMENT_HELP[s.key]}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  segment === s.key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <NewCustomer onCreated={onOpen} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="Search customers by name, phone or email" placeholder="Name, phone or email" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-9 bg-card" />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="sm:w-52 bg-card" aria-label="Sort customers"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent flight</SelectItem>
              <SelectItem value="value">Highest spend</SelectItem>
              <SelectItem value="bookings">Most bookings</SelectItem>
              <SelectItem value="name">Name A to Z</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportConsented} title="Download the people who agreed to receive offers">
            <Download className="w-4 h-4 mr-1.5" /> Export offers list
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading customers…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {search || segment !== "all" ? "No customers match that." : "No customers yet. They appear here as bookings come in."}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">{total} customer{total === 1 ? "" : "s"}</p>
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="w-full text-left bg-card rounded-xl border border-border p-4 hover:border-accent transition-colors flex items-center gap-4"
                >
                  <span className="w-10 h-10 shrink-0 rounded-full bg-secondary text-foreground flex items-center justify-center text-xs font-semibold" aria-hidden="true">
                    {initials(c.full_name, c.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">{customerLabel(c)}</span>
                      <SegmentBadge segment={c.segment} />
                      {(c.tags || []).filter((t) => t !== "vip").slice(0, 3).map((t) => (
                        <span key={t} className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">{t}</span>
                      ))}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate mt-0.5">{[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </span>
                  <span className="hidden sm:flex gap-6 text-right shrink-0">
                    <span><span className="tabular block text-sm font-semibold text-foreground">{c.bookings_count}</span><span className="text-xs text-muted-foreground">booking{Number(c.bookings_count) === 1 ? "" : "s"}</span></span>
                    <span><span className="tabular block text-sm font-semibold text-foreground">{formatGHS(c.collected)}</span><span className="text-xs text-muted-foreground">paid</span></span>
                    <span className="w-24"><span className="tabular block text-sm font-semibold text-foreground">{c.last_flight || "None"}</span><span className="text-xs text-muted-foreground">last flight</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length < total && (
            <div className="text-center pt-1">
              <button type="button" onClick={more} disabled={loadingMore} className="text-sm text-primary font-medium hover:underline disabled:opacity-60">
                {loadingMore ? "Loading…" : "Show more customers"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
