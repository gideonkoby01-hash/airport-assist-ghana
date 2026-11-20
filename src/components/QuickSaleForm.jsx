import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, CheckCircle2, Zap } from "lucide-react";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PACKAGE_DEFINITIONS, PAYMENT_METHOD_LABELS, formatGHS } from "@/lib/packages";
import { useSettings } from "@/lib/SettingsContext";
import { AIRLINES, OTHER_AIRLINE, airlineCode, isListedAirline } from "@/lib/airlines";

const METHODS = ["cash", "mobile_money", "card", "corporate_account"];

// A walk-in sale at the desk. It becomes a booking with its payment in one step, so it appears in the shift report
// and the books like every other sale. The price comes from the package; it can be lowered with a reason, never raised.
export default function QuickSaleForm({ onRecorded = undefined }) {
  const { settings } = useSettings();
  const commissionPerPassenger = Number(settings.porter_commission_per_passenger);
  const supervisorCommission = Number(settings.supervisor_commission_per_signup);
  const [packages, setPackages] = useState(PACKAGE_DEFINITIONS);
  const [porters, setPorters] = useState([]);
  const [code, setCode] = useState("");
  const [count, setCount] = useState(1);
  const [direction, setDirection] = useState("arrival");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [airline, setAirline] = useState("");
  // The airline is picked from a list; "Another airline" opens a box for any that is not on it.
  const [otherAirline, setOtherAirline] = useState(false);
  const [flightTime, setFlightTime] = useState("");
  const [method, setMethod] = useState("cash");
  const [discounted, setDiscounted] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  // One porter handles one passenger: the sale has one porter choice for each passenger.
  const [porterIds, setPorterIds] = useState([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  // One key per sale: a double tap or a retry after a timeout returns the first sale instead of recording a second.
  const key = useRef(crypto.randomUUID());

  useEffect(() => {
    api.entities.ServicePackage.filter({ active: true }, { sort: "price" })
      .then((page) => { if (page.items?.length) setPackages(page.items); })
      .catch(() => {});
    api.entities.Porter.filter({ active: true }, { sort: "full_name" })
      .then((page) => setPorters(page.items || []))
      .catch(() => {});
  }, []);

  const pkg = useMemo(() => packages.find((p) => p.code === code), [packages, code]);
  const gross = pkg ? Number(pkg.price) * Math.max(1, Number(count) || 1) : 0;
  const charge = discounted && amount !== "" ? Number(amount) : gross;
  const tooHigh = discounted && Number(amount) > gross;

  const reset = () => {
    setDone(null); setCode(""); setCount(1); setName(""); setPhone(""); setDiscounted(false); setAmount("");
    setReason(""); setPorterIds([""]); setFlightNumber(""); setAirline(""); setOtherAirline(false); setFlightTime(""); setError("");
    key.current = crypto.randomUUID();
  };

  const passengerCount = Math.max(1, Math.min(50, Math.trunc(Number(count)) || 1));
  const slots = Array.from({ length: passengerCount }, (_, i) => porterIds[i] || "");
  const NO_PORTER = "none"; // a meet and assist does not always need a porter
  const mayGoWithoutPorter = Boolean(pkg) && pkg.code !== "porter_only";
  const waivedCount = slots.filter((v) => v === NO_PORTER).length;
  const setSlot = (i, value) => setPorterIds(slots.map((v, k) => (k === i ? value : v)));

  const onAirlineChange = (value) => {
    if (value === OTHER_AIRLINE) {
      setOtherAirline(true);
      if (isListedAirline(airline)) setAirline("");
      return;
    }
    setOtherAirline(false);
    setAirline(value);
    // Start the flight number with the airline's code (KQ for Kenya Airways) when it is empty or holds only another code.
    const code = airlineCode(value);
    const keep = flightNumber.trim() && !/^[A-Za-z0-9]{2}\s?$/.test(flightNumber.trim());
    if (code && !keep) setFlightNumber(`${code} `);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!pkg) return setError("Choose the service sold.");
    if (discounted && (!(Number(amount) > 0) || tooHigh)) return setError(`Enter a price above zero and not more than ${formatGHS(gross)}.`);
    if (discounted && reason.trim().length < 3) return setError("Give a reason for the lower price.");
    if (flightNumber.trim() && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(flightNumber.trim())) return setError("Enter the flight number as letters and numbers, for example KQ 510.");
    if (!porters.length && !(mayGoWithoutPorter && slots.every((v) => v === NO_PORTER))) return setError("No porters are on the list yet. Ask an admin to add them under Porters.");
    if (slots.some((v) => !v)) return setError(passengerCount === 1 ? "Choose the porter handling this service." : `Choose a porter for each of the ${passengerCount} passengers. One porter handles one passenger.`);
    if (waivedCount > 0 && !mayGoWithoutPorter) return setError("Porter Service Only needs a porter for each passenger.");
    const chosenPorters = slots.filter((v) => v !== NO_PORTER);
    if (new Set(chosenPorters).size !== chosenPorters.length) return setError("Each porter can handle only one passenger. Choose a different porter for each.");
    setSaving(true);
    try {
      const res = await api.functions.invoke("createQuickSale", {
        idempotency_key: key.current,
        package_code: pkg.code,
        count: Number(count),
        direction,
        name: name.trim(),
        phone: phone.trim(),
        method,
        override_amount: discounted ? Number(amount) : undefined,
        override_reason: discounted ? reason.trim() : undefined,
        flight_number: flightNumber.trim() || undefined,
        airline: airline.trim() || undefined,
        flight_time: flightTime || undefined,
        porter_ids: chosenPorters,
        porters_waived: waivedCount,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      setDone(res.data.booking);
      if (onRecorded) onRecorded(res.data.booking);
    } catch (err) {
      setError(err.message || "The sale could not be saved. Check your connection and try again; it will not be recorded twice.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="bg-card rounded-2xl border border-emerald-200 p-6 text-center max-w-lg">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" aria-hidden="true" />
        <h3 className="text-lg font-bold">Sale recorded</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {done.reference} · {done.package_name} · {formatGHS(done.total_value)} ({PAYMENT_METHOD_LABELS[done.payment_method] || done.payment_method})
        </p>
        {done.package_code !== "porter_only" && (
          <p className="text-xs text-emerald-700 mt-2">Your commission of {formatGHS(supervisorCommission)} is added automatically and comes off today's takings.</p>
        )}
        <Button className="mt-4" onClick={reset}>Record another sale</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-card rounded-2xl border border-border p-5 space-y-4 max-w-lg">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-accent" aria-hidden="true" /> Sales</h3>
      <p className="text-xs text-muted-foreground">
        For a passenger paying at the desk now. It is saved as a completed booking with its payment and appears in your shift report.
        Use the Walk-in Booking tab instead when the passenger is travelling later and needs the full details.
      </p>
      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">{error}</div>}

      <div className="space-y-1.5">
        <Label htmlFor="qs-service">Service</Label>
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger id="qs-service"><SelectValue placeholder="Choose a service" /></SelectTrigger>
          <SelectContent>
            {packages.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.name} · {formatGHS(p.price)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qs-count">Passengers</Label>
          <Input id="qs-count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        {pkg?.flight_type === "both" && (
          <div className="space-y-1.5">
            <Label htmlFor="qs-direction">Direction</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger id="qs-direction"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arrival">Arrival</SelectItem>
                <SelectItem value="departure">Departure</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qs-name">Name (optional)</Label>
          <Input id="qs-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-phone">Phone (optional)</Label>
          <Input id="qs-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <fieldset className="rounded-lg border border-border p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">Flight (optional)</legend>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qs-flight">Flight number</Label>
            <Input id="qs-flight" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} placeholder="e.g. KQ 510" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qs-airline">Airline</Label>
            <Select value={otherAirline ? OTHER_AIRLINE : isListedAirline(airline) ? airline : ""} onValueChange={onAirlineChange}>
              <SelectTrigger id="qs-airline"><SelectValue placeholder="Choose the airline" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {AIRLINES.map((a) => (<SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>))}
                <SelectItem value={OTHER_AIRLINE}>Another airline…</SelectItem>
              </SelectContent>
            </Select>
            {(otherAirline || (airline && !isListedAirline(airline))) && (
              <Input id="qs-airline-other" aria-label="Airline name" value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Type the airline's name" autoComplete="off" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qs-ftime">Flight time</Label>
            <Input id="qs-ftime" type="time" value={flightTime} onChange={(e) => setFlightTime(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Today's date is used. The flight shows on the booking and in your records.</p>
      </fieldset>

      <div className="bg-secondary rounded-lg p-3 text-sm flex items-center justify-between">
        <span className="text-muted-foreground">Amount to collect</span>
        <span className="text-lg font-bold">{formatGHS(charge || 0)}</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={discounted} onChange={(e) => setDiscounted(e.target.checked)} />
        Charge less than the package price
      </label>
      {discounted && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qs-amount">Price charged (GHS)</Label>
            <Input id="qs-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {tooHigh && <p className="text-xs text-destructive">Cannot be more than {formatGHS(gross)}.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qs-reason">Reason</Label>
            <Input id="qs-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="qs-method">Paid by</Label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger id="qs-method"><SelectValue /></SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (<SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          One porter handles one passenger, and each earns {formatGHS(commissionPerPassenger)}, paid daily.
          {passengerCount > 1 && <> This sale needs {passengerCount} different porters{mayGoWithoutPorter ? ", unless a passenger needs none" : ""}.</>}
          {mayGoWithoutPorter && <> A meet and assist does not always need a porter: choose "No porter needed" for a passenger who does not.</>}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {slots.map((value, i) => (
            <div key={i} className="space-y-1.5">
              <Label htmlFor={`qs-porter-${i}`}>{passengerCount === 1 ? "Porter" : `Porter for passenger ${i + 1}`}</Label>
              <Select value={value} onValueChange={(v) => setSlot(i, v)}>
                <SelectTrigger id={`qs-porter-${i}`}><SelectValue placeholder="Choose a porter" /></SelectTrigger>
                <SelectContent>
                  {porters.length === 0 && <SelectItem value="_none" disabled>No porters on the list yet</SelectItem>}
                  {mayGoWithoutPorter && <SelectItem value={NO_PORTER}>No porter needed</SelectItem>}
                  {porters.filter((p) => p.id === value || !slots.includes(p.id)).map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {pkg && pkg.code !== "porter_only" && (
        <p className="text-xs text-muted-foreground rounded-lg border border-border p-3">
          Every meet and assist earns you a commission of <span className="font-medium text-foreground">{formatGHS(supervisorCommission)}</span>. It is added automatically and comes off today's takings in your shift report.
        </p>
      )}

      <Button type="submit" className="w-full h-12" disabled={saving || !pkg}>
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : `Record sale · ${formatGHS(charge || 0)}`}
      </Button>
    </form>
  );
}
