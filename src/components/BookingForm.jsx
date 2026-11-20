import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMoney } from "@/lib/currency";
import { formatGHS } from "@/lib/packages";
import { inclusionList, readDraft, saveDraft, clearDraft } from "@/lib/bookingDraft";
import { useSettings } from "@/lib/SettingsContext";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Loader2, Users, Plane, CheckCircle2, Pencil } from "lucide-react";
import { validateBooking, todayUtc } from "@/lib/bookingFormRules";
import { parseBookingPrefill } from "@/lib/bookingPrefill";
import { AIRLINES, OTHER_AIRLINE, airlineCode, isListedAirline } from "@/lib/airlines";
import PaymentInformation from "@/components/PaymentInformation";
import DiscountCodeInput from "@/components/DiscountCodeInput";
import {
  PACKAGE_DEFINITIONS,
  computeTotal,
  packageByCode } from
"@/lib/packages";

// The booking is made in four short steps. Each step checks only its own fields before moving on.
const STEPS = ["Service", "Flight", "Travellers", "Review"];
const STEP_FIELDS = [
  (k) => k === "package_code",
  (k) => ["flight_number", "flight_date", "scheduled_flight_time"].includes(k),
  (k) => k === "contact" || k === "contact_email" || k.startsWith("passenger_"),
  (k) => k === "consent",
];

// The services are listed under Arrival and Departure. A service that works in both directions (Porter Service Only) is
// listed under each, so there is one under Arrival and one under Departure.
const SERVICE_GROUPS = [
  { key: "arrival", label: "Arrival services" },
  { key: "departure", label: "Departure services" },
];
const inGroup = (/** @type {{ flight_type?: string }} */ p, /** @type {string} */ group) => p.flight_type === group || (p.flight_type !== "arrival" && p.flight_type !== "departure");

const emptyPassenger = { name: "", contact: "", nationality: "", total_bags: 0, special_requests: "" };

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

// `user` and `supervisor` are still passed by the callers; the server now decides who a booking belongs to.
// eslint-disable-next-line unused-imports/no-unused-vars
export default function BookingForm({ channel = "online", user = undefined, supervisor = undefined, onCreated = undefined, standalone = false }) {
  const { user: me } = useAuth();
  const { format: money, isUsd } = useMoney();
  // Choices made in the website's quick quote arrive in the address (package, date, number of travellers).
  const [searchParams] = useSearchParams();
  const prefill = useMemo(() => parseBookingPrefill(searchParams.toString()), []); // read once, when the form opens
  // On the booking page, answers are kept as the person goes (and through signing in), unless the address brings a fresh quote.
  const hasPrefill = Boolean(prefill.package_code || prefill.flight_date || prefill.passengers > 1);
  const draft = useMemo(() => (standalone && !hasPrefill ? readDraft() : null), []);
  const [packages, setPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [form, setForm] = useState(() => draft?.form || {
    package_code: prefill.package_code,
    flight_type: prefill.flight_type || "arrival",
    airline: "",
    flight_number: "",
    flight_date: prefill.flight_date,
    scheduled_flight_time: "",
    // A passenger's own number is filled in from their profile; staff booking for walk-ins start blank.
    contact: channel === "online" ? me?.phone || "" : "",
    // Everything about an online booking is emailed here: passengers do not have accounts.
    contact_email: channel === "online" ? me?.email || "" : "",
    nationality: "",
    total_bags: 0,
    special_requests: "",
    lounge_used: ""
  });
  const [passengers, setPassengers] = useState(() => draft?.passengers?.length ? draft.passengers : Array.from({ length: prefill.passengers }, () => ({ ...emptyPassenger })));
  const [submitting, setSubmitting] = useState(false);
  const [consented, setConsented] = useState(Boolean(draft?.consented));
  const { settings } = useSettings();
  // Online booking can be paused from Admin > Settings. Staff at the desk are never blocked.
  const paused = channel === "online" && settings.online_bookings_enabled === "false";
  // One key per form: if a submit is retried after a timeout, the server returns the first booking instead of a second.
  const idempotencyKey = useRef(crypto.randomUUID());
  const [error, setError] = useState("");
  // Messages beside the fields that need fixing, keyed as in validateBooking.
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const errorBox = useRef(null);
  const [created, setCreated] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [step, setStep] = useState(() => Math.min(Number(draft?.step) || 0, STEPS.length - 1));
  // The airline is picked from a list; "Other" opens a box for anything not on it.
  const [otherAirline, setOtherAirline] = useState(Boolean(draft?.otherAirline));
  const top = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const page = await api.entities.ServicePackage.filter({ active: true }, { sort: "price" });
        if (active) setPackages(page.items?.length ? page.items : PACKAGE_DEFINITIONS);
      } catch {
        if (active) setPackages(PACKAGE_DEFINITIONS);
      } finally {
        if (active) setLoadingPkgs(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep the answers so signing in, a refresh or leaving and coming back does not start the booking again.
  useEffect(() => {
    if (!standalone || created) return;
    saveDraft({ form, passengers, step, consented, otherAirline });
  }, [standalone, created, form, passengers, step, consented, otherAirline]);

  // Each step is a page in the browser's history, so Back goes to the previous step instead of out of the booking.
  useEffect(() => {
    if (!standalone) return undefined;
    window.history.replaceState({ ...(window.history.state || {}), bookingStep: step }, "");
    const onPop = (e) => {
      const at = e.state?.bookingStep;
      if (Number.isInteger(at) && at >= 0 && at < STEPS.length) {
        setError("");
        setStep(at);
        requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [standalone]);

  // A passenger's own number comes from their profile once they are signed in, if they have not typed one.
  useEffect(() => {
    if (channel === "online" && me?.phone) setForm((f) => (f.contact ? f : { ...f, contact: me.phone }));
  }, [me?.phone, channel]);

  const selectedPkg = useMemo(() => {
    const fromList = packages.find((p) => p.code === form.package_code);
    return fromList || packageByCode(form.package_code);
  }, [packages, form.package_code]);

  const pricePerPassenger = Number(selectedPkg?.price || 0);
  const numPassengers = passengers.length;
  const totalValue = computeTotal(pricePerPassenger, numPassengers);

  const clearError = (/** @type {string} */ key) => setErrors((e) => {
    if (!e[key]) return e;
    const { [key]: _gone, ...rest } = e;
    return rest;
  });
  const setField = (k, v) => {
    clearError(k);
    setError("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  // After a field is left, show its message straight away instead of waiting for the submit button.
  const checkField = (/** @type {string} */ key) => {
    const found = validateBooking({ form, passengers, channel, consented })[key];
    if (found) setErrors((e) => ({ ...e, [key]: found }));
  };
  const fp = (/** @type {string} */ key) => ({
    id: `bf-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `bf-${key}-err` : undefined,
    onBlur: () => checkField(key),
  });
  const fieldError = (/** @type {string} */ key) =>
    errors[key] ? <p id={`bf-${key}-err`} className="text-xs text-destructive">{errors[key]}</p> : null;

  // A message at the top is easy to miss when the button is at the bottom: bring it into view.
  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  // `group` is the list the card was chosen from: it sets the direction for a service that works both ways.
  const onPackageChange = (code, group) => {
    const pkg = packages.find((p) => p.code === code) || packageByCode(code);
    const ft = pkg?.flight_type === "departure" ? "departure" : pkg?.flight_type === "arrival" ? "arrival" : group || form.flight_type;
    setAppliedDiscount(null);
    clearError("package_code");
    setForm((f) => ({ ...f, package_code: code, flight_type: ft }));
  };

  const setPassenger = (i, k, v) => {
    if (k === "name") { clearError(`passenger_${i}_name`); setError(""); }
    setPassengers((ps) => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  };
  const addPassenger = () => {
    setAppliedDiscount(null);
    setPassengers((ps) => [...ps, { ...emptyPassenger }]);
  };
  const removePassenger = (i) => {
    setAppliedDiscount(null);
    setPassengers((ps) => ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps);
  };

  const onPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    const type = (file.type || "").toLowerCase();
    if (!ACCEPTED_PHOTO_TYPES.includes(type)) {
      setPhotoError("Photo must be a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError("Photo must be 5MB or smaller.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const onPhotoRemove = () => {
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const goTo = (n) => {
    setError("");
    if (standalone) {
      if (n > step) window.history.pushState({ bookingStep: n }, "");
      else window.history.replaceState({ bookingStep: n }, "");
    }
    setStep(n);
    // Bring the new step to the top of the screen so nobody has to scroll back up.
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Moves on only when this step's own fields are fine; otherwise shows what to fix and stays.
  const next = () => {
    const found = validateBooking({ form, passengers, channel, consented });
    const mine = Object.fromEntries(Object.entries(found).filter(([k]) => STEP_FIELDS[step](k)));
    const firstKey = Object.keys(mine)[0];
    if (firstKey) {
      setErrors((e) => ({ ...e, ...mine }));
      setError(`Please fix ${Object.keys(mine).length === 1 ? "the highlighted field" : "the highlighted fields"} to continue.`);
      document.getElementById(`bf-${firstKey}`)?.focus({ preventScroll: false });
      return;
    }
    goTo(step + 1);
  };

  const onAirlineChange = (value) => {
    clearError("flight_number");
    if (value === OTHER_AIRLINE) {
      setOtherAirline(true);
      setForm((f) => ({ ...f, airline: isListedAirline(f.airline) ? "" : f.airline }));
      return;
    }
    setOtherAirline(false);
    setForm((f) => {
      // Start the flight number with the airline's code (KQ for Kenya Airways) when it is still empty or only holds another code.
      const code = airlineCode(value);
      const keep = f.flight_number.trim() && !/^[A-Za-z0-9]{2}\s?$/.test(f.flight_number.trim());
      return { ...f, airline: value, flight_number: keep || !code ? f.flight_number : `${code} ` };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const found = validateBooking({ form, passengers, channel, consented });
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      setErrors(found);
      setError(`Please fix ${Object.keys(found).length === 1 ? "the highlighted field" : "the highlighted fields"} and try again.`);
      const at = STEP_FIELDS.findIndex((match) => match(firstKey));
      if (at >= 0 && at !== step) setStep(at);
      setTimeout(() => document.getElementById(`bf-${firstKey}`)?.focus({ preventScroll: false }), 50);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const pkg = selectedPkg;
      let passenger_photo_uri = "";
      if (photoFile) {
        setPhotoUploading(true);
        try {
          // Signed-in staff upload to their own folder; a passenger (no account) uses a single-use upload link.
          const upload = me ? await api.storage.uploadPrivateFile({ file: photoFile }) : await api.storage.uploadGuestPhoto({ file: photoFile });
          passenger_photo_uri = upload.file_uri;
        } catch (err) {
          setPhotoUploading(false);
          setSubmitting(false);
          setError(err.message || "Failed to upload photo. Please try again.");
          return;
        } finally {
          setPhotoUploading(false);
        }
      }
      // Price, discount and totals are recalculated on the server: the browser
      // never sets the amount that is saved.
      const res = await api.functions.invoke("createBooking", {
        idempotency_key: idempotencyKey.current,
        consent: channel === "online" ? true : undefined,
        channel,
        package_code: pkg.code,
        flight_type: form.flight_type,
        airline: form.airline,
        flight_number: form.flight_number,
        flight_date: form.flight_date,
        scheduled_flight_time: form.scheduled_flight_time,
        contact: form.contact,
        contact_email: channel === "online" ? form.contact_email.trim() : undefined,
        nationality: form.nationality,
        total_bags: form.total_bags,
        special_requests: form.special_requests,
        lounge_used: form.lounge_used,
        passengers,
        passenger_photo_uri,
        discount_code: appliedDiscount?.code || "",
      });
      const data = res?.data || {};
      if (data.error) throw new Error(data.error);
      if (!data.booking) throw new Error("The booking could not be saved. Please try again.");
      setCreated(data.booking);
      idempotencyKey.current = crypto.randomUUID(); // the next booking is a new submission
      clearDraft();
      setAppliedDiscount(null);
      if (onCreated) onCreated(data.booking);
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Failed to create booking. Please try again.";
      setError(message);
      if (/discount/i.test(message)) setAppliedDiscount(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (paused) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-6 text-sm" role="status">
        <p className="font-semibold mb-1">Online booking is paused</p>
        <p>{settings.online_bookings_message}</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="bg-card rounded-2xl border border-emerald-200 p-8 text-center max-w-lg mx-auto">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-foreground">Booking confirmed</h3>
        <p className="text-muted-foreground mt-1">
          Your booking has been saved{channel === "walk_in" ? " as a walk-in" : ""}.
        </p>
        <div className="mt-5 inline-flex flex-col items-center bg-secondary rounded-xl px-6 py-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Booking Reference</span>
          <span className="text-2xl font-bold text-primary tracking-wider mt-1">{created.reference}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Total: <span className="font-semibold text-foreground">{money(created.total_value)}</span> ·{" "}
          {created.num_passengers} passenger{created.num_passengers !== 1 ? "s" : ""}
        </p>
        {isUsd && <p className="text-xs text-muted-foreground mt-1">You pay in cedis at the airport: {formatGHS(created.total_value)}.</p>}
        {Number(created.discount_amount || 0) > 0 && (
          <p className="text-xs text-emerald-700 mt-1">
            Discount {created.discount_code} applied (−{money(created.discount_amount)} from{" "}
            {money(created.original_total)})
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-4">
          {channel === "walk_in"
            ? "It is assigned to you. Record payment and progress from the booking."
            : `We are emailing your confirmation to ${created.contact_email || form.contact_email}. You will get another email when a supervisor is assigned, and if the status or a payment changes. Keep your reference. If you do not receive an email, the Airport Assist desk will contact you by phone.`}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          {channel === "walk_in" && (
            <Button variant="outline" asChild>
              <Link to={`/bookings/${created.id}`}>View booking</Link>
            </Button>
          )}
          <Button
            onClick={() => {
              clearDraft();
              setCreated(null);
              setForm({
                package_code: "",
                flight_type: "arrival",
                airline: "",
                flight_number: "",
                flight_date: "",
                scheduled_flight_time: "",
                contact: "",
                contact_email: "",
                nationality: "",
                total_bags: 0,
                special_requests: "",
                lounge_used: ""
              });
              setPassengers([{ ...emptyPassenger }]);
              setStep(0);
              setOtherAirline(false);
              onPhotoRemove();
            }}>
            
            {channel === "walk_in" ? "New walk-in booking" : "Book another service"}
          </Button>
        </div>
      </div>);

  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step < STEPS.length - 1) next(); else handleSubmit(e); }} className="space-y-6" noValidate>
      <div ref={top} className="scroll-mt-24" />
      <ol className="flex items-center" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
            <button
              type="button"
              onClick={() => (i < step ? goTo(i) : undefined)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-2 text-sm font-medium ${i === step ? "text-foreground" : i < step ? "text-primary" : "text-muted-foreground"}`}
            >
              <span className={`grid place-items-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-colors ${i < step ? "bg-primary border-primary text-primary-foreground" : i === step ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted-foreground"}`}>
                {i < step ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={i === step ? "" : "hidden sm:inline"}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={`mx-2 sm:mx-3 h-0.5 flex-1 rounded ${i < step ? "bg-primary" : "bg-border"}`} aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {error && <div ref={errorBox} role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {step === 0 && (
      <section id="bf-package_code" tabIndex={-1} className="bg-card rounded-2xl border border-border p-5 outline-none">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Plane className="w-4 h-4 text-accent" aria-hidden="true" /> Choose your service
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">Prices are per passenger. You pay at the airport; nothing is taken online.{isUsd && " Dollar prices are for your information; you pay in cedis at the airport."}</p>
        {loadingPkgs ?
        <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading packages…
          </div> :

        <div className="space-y-5">
            {SERVICE_GROUPS.map((group) => {
              const list = packages.filter((p) => inGroup(p, group.key));
              if (!list.length) return null;
              return (
                <div key={group.key}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group.label}</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {list.map((p) =>
          <button
            type="button"
            key={p.code}
            aria-pressed={form.package_code === p.code && (p.flight_type === "arrival" || p.flight_type === "departure" || form.flight_type === group.key)}
            onClick={() => onPackageChange(p.code, group.key)}
            className={`text-left flex flex-col justify-start rounded-xl border p-4 transition-all ${
            form.package_code === p.code && (p.flight_type === "arrival" || p.flight_type === "departure" || form.flight_type === group.key) ?
            "border-accent ring-2 ring-accent/40 bg-accent/5" :
            "border-border hover:border-accent/50"}`
            }>
            
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="text-lg font-bold text-primary">{money(p.price)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {inclusionList(p.inclusions).map((item) => (
                    <li key={item} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 mt-px shrink-0 text-accent" aria-hidden="true" /><span>{item}</span></li>
                  ))}
                </ul>
              </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        }
        {fieldError("package_code")}
      </section>

      )}

      {step === 1 && (
        <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Your flight</h3>
            <p className="text-xs text-muted-foreground mt-0.5">We use this to meet you at the right place and time.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bf-direction">Direction</Label>
              <Select value={form.flight_type} onValueChange={(v) => setField("flight_type", v)}>
                <SelectTrigger id="bf-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="arrival">Arrival into Accra</SelectItem>
                  <SelectItem value="departure">Departure from Accra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-airline">Airline</Label>
              <Select value={otherAirline ? OTHER_AIRLINE : isListedAirline(form.airline) ? form.airline : ""} onValueChange={onAirlineChange}>
                <SelectTrigger id="bf-airline"><SelectValue placeholder="Choose your airline" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {AIRLINES.map((a) => (<SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>))}
                  <SelectItem value={OTHER_AIRLINE}>Another airline…</SelectItem>
                </SelectContent>
              </Select>
              {(otherAirline || (form.airline && !isListedAirline(form.airline))) && (
                <Input id="bf-airline-other" aria-label="Airline name" value={form.airline} onChange={(e) => setField("airline", e.target.value)} placeholder="Type the airline's name" autoComplete="off" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-flight_number">Flight number *</Label>
              <Input {...fp("flight_number")} value={form.flight_number} onChange={(e) => setField("flight_number", e.target.value.toUpperCase())} placeholder="e.g. KQ 510" autoComplete="off" />
              {fieldError("flight_number")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-flight_date">Flight date *</Label>
              <Input {...fp("flight_date")} type="date" min={channel === "online" ? todayUtc() : undefined} value={form.flight_date} onChange={(e) => setField("flight_date", e.target.value)} />
              {fieldError("flight_date")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-scheduled_flight_time">Scheduled flight time *</Label>
              <Input {...fp("scheduled_flight_time")} type="time" value={form.scheduled_flight_time} onChange={(e) => setField("scheduled_flight_time", e.target.value)} />
              {fieldError("scheduled_flight_time")}
            </div>
            {selectedPkg?.includes_lounge && (
              <div className="space-y-1.5">
                <Label htmlFor="bf-lounge">Lounge preference <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="bf-lounge" value={form.lounge_used} onChange={(e) => setField("lounge_used", e.target.value)} placeholder="e.g. Akwaaba Lounge" />
              </div>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <>
      <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Who should we call?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Your supervisor uses this number to find you at the airport.</p>
          </div>
          {channel === "online" && (
            <div className="space-y-1.5">
              <Label htmlFor="bf-contact_email">Email address *</Label>
              <Input {...fp("contact_email")} type="email" inputMode="email" autoComplete="email" value={form.contact_email} onChange={(e) => setField("contact_email", e.target.value)} placeholder="you@example.com" />
              {fieldError("contact_email")}
              <p className="text-xs text-muted-foreground">You do not need an account. We email your confirmation, your supervisor's details and any update on your booking to this address. If you do not receive an email, the Airport Assist desk will contact you by phone.</p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bf-contact">Phone / WhatsApp *</Label>
              <Input {...fp("contact")} type="tel" inputMode="tel" autoComplete="tel" value={form.contact} onChange={(e) => setField("contact", e.target.value)} placeholder="e.g. 024 123 4567" />
              {fieldError("contact")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-nationality">Nationality <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="bf-nationality" value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} placeholder="e.g. Ghanaian" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-special_requests">Anything we should know? <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="bf-special_requests" value={form.special_requests} onChange={(e) => setField("special_requests", e.target.value)} placeholder="Wheelchair, unaccompanied minor, VIP, etc." rows={2} />
          </div>
        </section>

      {/* Passengers */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Passengers ({numPassengers})
          </h3>
          <Button type="button" variant="outline" size="sm" onClick={addPassenger}>
            <Plus className="w-4 h-4 mr-1" /> Add passenger
          </Button>
        </div>
        <div className="space-y-3">
          {passengers.map((p, i) =>
          <div key={i} className="rounded-xl border border-border p-4 bg-secondary/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passenger {i + 1}</span>
                {passengers.length > 1 &&
              <button type="button" aria-label={`Remove passenger ${i + 1}`} onClick={() => removePassenger(i)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
              }
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`bf-passenger_${i}_name`} className="text-xs">Full name *</Label>
                  <Input {...fp(`passenger_${i}_name`)} value={p.name} onChange={(e) => setPassenger(i, "name", e.target.value)} placeholder="As on their passport" autoComplete="off" />
                  {fieldError(`passenger_${i}_name`)}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`bf-passenger_${i}_contact`} className="text-xs">Contact</Label>
                  <Input id={`bf-passenger_${i}_contact`} type="tel" inputMode="tel" value={p.contact} onChange={(e) => setPassenger(i, "contact", e.target.value)} placeholder="Phone" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`bf-passenger_${i}_nationality`} className="text-xs">Nationality</Label>
                  <Input id={`bf-passenger_${i}_nationality`} value={p.nationality} onChange={(e) => setPassenger(i, "nationality", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`bf-passenger_${i}_bags`} className="text-xs">Bags</Label>
                  <Input
                  id={`bf-passenger_${i}_bags`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={p.total_bags}
                  onChange={(e) => setPassenger(i, "total_bags", e.target.value)} />
                
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <Label htmlFor={`bf-passenger_${i}_requests`} className="text-xs">Special requests</Label>
                <Input id={`bf-passenger_${i}_requests`} value={p.special_requests} onChange={(e) => setPassenger(i, "special_requests", e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Passenger identification photo */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Passenger Identification Photo
        </h3>
        <p className="text-xs text-muted-foreground">Optional. Helps your supervisor recognise you at meet & greet. JPG, PNG or WEBP, up to 5MB; it is made smaller automatically.

        </p>
        {photoError &&
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs">{photoError}</div>
        }
        {photoPreview ?
        <div className="flex items-center gap-4">
            <img
            src={photoPreview}
            alt="Passenger photo preview"
            className="w-24 h-24 rounded-xl object-cover border border-border" />
          
            <div className="flex gap-3">
              <label className="cursor-pointer text-xs font-medium text-accent hover:underline">
                Replace
                <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPhotoSelect} />
              
              </label>
              <button type="button" onClick={onPhotoRemove} className="text-xs font-medium text-rose-500 hover:underline">
                Remove
              </button>
            </div>
          </div> :

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-6 cursor-pointer hover:border-accent/50 transition-colors">
            <Users className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Tap to take or choose a photo</span>
            <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPhotoSelect} />
          
          </label>
        }
      </section>

        </>
      )}

      {step === 3 && (
        <>
          <section className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Check your booking</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Make sure everything is right, then confirm.</p>
            </div>
            <dl className="divide-y divide-border text-sm">
              <div className="px-5 py-3 flex items-start justify-between gap-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Service</dt>
                  <dd className="font-medium text-foreground mt-0.5">{selectedPkg?.name || "—"}</dd>
                  <dd className="text-xs text-muted-foreground">{money(pricePerPassenger)} per passenger</dd>
                </div>
                <button type="button" onClick={() => goTo(0)} className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"><Pencil className="w-3 h-3" aria-hidden="true" /> Change</button>
              </div>
              <div className="px-5 py-3 flex items-start justify-between gap-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Flight</dt>
                  <dd className="font-medium text-foreground mt-0.5">{form.flight_type === "departure" ? "Departure" : "Arrival"} · {form.airline ? `${form.airline} ` : ""}{form.flight_number}</dd>
                  <dd className="text-xs text-muted-foreground">{form.flight_date} at {form.scheduled_flight_time}</dd>
                </div>
                <button type="button" onClick={() => goTo(1)} className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"><Pencil className="w-3 h-3" aria-hidden="true" /> Change</button>
              </div>
              <div className="px-5 py-3 flex items-start justify-between gap-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Travellers ({numPassengers})</dt>
                  <dd className="font-medium text-foreground mt-0.5">{passengers.map((p) => p.name.trim()).filter(Boolean).join(", ")}</dd>
                  <dd className="text-xs text-muted-foreground">Contact {form.contact}</dd>
                </div>
                <button type="button" onClick={() => goTo(2)} className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"><Pencil className="w-3 h-3" aria-hidden="true" /> Change</button>
              </div>
            </dl>
          </section>

          <DiscountCodeInput
            applied={appliedDiscount}
            onApplied={setAppliedDiscount}
            onRemoved={() => setAppliedDiscount(null)}
            packageCode={form.package_code}
            numPassengers={numPassengers}
            contactEmail={form.contact_email}
            disabled={submitting}
          />

          <PaymentInformation />

      {channel === "online" && (
        <label className="flex items-start gap-3 text-sm bg-card rounded-xl border border-border p-4">
          <input
            id="bf-consent"
            type="checkbox"
            className="mt-1"
            checked={consented}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "bf-consent-err" : undefined}
            onChange={(e) => { setConsented(e.target.checked); clearError("consent"); setError(""); }} />
          <span>
            I have read the <Link to="/privacy" target="_blank" className="text-primary underline">privacy notice</Link> and agree that
            Airport Assist Ghana may use my details to provide this service. I understand the photo of my ID is kept for 30 days after my flight and then deleted.
            {fieldError("consent")}
          </span>
        </label>
      )}

        </>
      )}

      {/* Price and navigation: always in view at the bottom of the screen */}
      <div className="sticky bottom-3 z-10">
        <div className="bg-primary text-primary-foreground rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 shadow-[0_18px_40px_-20px_hsl(var(--foreground)/0.6)]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide opacity-80 truncate">{selectedPkg ? selectedPkg.name : "Choose a service"}</p>
            <p className="text-xl sm:text-2xl font-bold tabular">{money(appliedDiscount ? appliedDiscount.final_total : totalValue)}</p>
            <p className="text-xs opacity-80">
              {money(pricePerPassenger)} × {numPassengers} passenger{numPassengers !== 1 ? "s" : ""}
              {appliedDiscount && <span className="text-accent font-medium"> · {appliedDiscount.code} −{money(appliedDiscount.discount_amount)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={submitting} className="bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <ArrowLeft className="w-4 h-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Back</span>
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="submit" size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                Continue <ArrowRight className="w-4 h-4 ml-1.5" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={submitting || paused} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {photoUploading ? "Uploading photo…" : "Saving…"}</>
                ) : channel === "walk_in" ? "Save walk-in booking" : "Confirm booking"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>);

}
