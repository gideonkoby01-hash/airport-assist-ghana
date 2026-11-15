import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/lib/SettingsContext";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users, Plane, CheckCircle2 } from "lucide-react";
import { validateBooking, todayUtc } from "@/lib/bookingFormRules";
import PaymentInformation from "@/components/PaymentInformation";
import DiscountCodeInput from "@/components/DiscountCodeInput";
import {
  PACKAGE_DEFINITIONS,
  computeTotal,
  formatGHS,
  packageByCode } from
"@/lib/packages";

const emptyPassenger = { name: "", contact: "", nationality: "", total_bags: 0, special_requests: "" };

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

// `user` and `supervisor` are still passed by the callers; the server now decides who a booking belongs to.
// eslint-disable-next-line unused-imports/no-unused-vars
export default function BookingForm({ channel = "online", user, supervisor = undefined, onCreated }) {
  const [packages, setPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [form, setForm] = useState({
    package_code: "",
    flight_type: "arrival",
    airline: "",
    flight_number: "",
    flight_date: "",
    scheduled_flight_time: "",
    contact: "",
    nationality: "",
    total_bags: 0,
    special_requests: "",
    lounge_used: ""
  });
  const [passengers, setPassengers] = useState([{ ...emptyPassenger }]);
  const [submitting, setSubmitting] = useState(false);
  const [consented, setConsented] = useState(false);
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

  const onPackageChange = (code) => {
    const pkg = packages.find((p) => p.code === code) || packageByCode(code);
    const ft = pkg?.flight_type === "departure" ? "departure" : pkg?.flight_type === "arrival" ? "arrival" : form.flight_type;
    setAppliedDiscount(null);
    clearError("package_code");
    setForm((f) => ({ ...f, package_code: code, flight_type: ft }));
  };

  const setPassenger = (i, k, v) => {
    if (k === "name") clearError(`passenger_${i}_name`);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const found = validateBooking({ form, passengers, channel, consented });
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      setErrors(found);
      setError(`Please fix ${Object.keys(found).length === 1 ? "the highlighted field" : "the highlighted fields"} and try again.`);
      document.getElementById(`bf-${firstKey}`)?.focus({ preventScroll: false });
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
          const upload = await api.storage.uploadPrivateFile({ file: photoFile });
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
          Total: <span className="font-semibold text-foreground">{formatGHS(created.total_value)}</span> ·{" "}
          {created.num_passengers} passenger{created.num_passengers !== 1 ? "s" : ""}
        </p>
        {Number(created.discount_amount || 0) > 0 && (
          <p className="text-xs text-emerald-700 mt-1">
            Discount {created.discount_code} applied (−{formatGHS(created.discount_amount)} from{" "}
            {formatGHS(created.original_total)})
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-4">
          {channel === "walk_in"
            ? "It is assigned to you. Record payment and progress from the booking."
            : "Keep your reference. You can follow this booking, and see your supervisor's details once one is assigned, from your dashboard."}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Button variant="outline" asChild>
            <Link to={`/bookings/${created.id}`}>View booking</Link>
          </Button>
          <Button
            onClick={() => {
              setCreated(null);
              setForm({
                package_code: "",
                flight_type: "arrival",
                airline: "",
                flight_number: "",
                flight_date: "",
                scheduled_flight_time: "",
                contact: "",
                nationality: "",
                total_bags: 0,
                special_requests: "",
                lounge_used: ""
              });
              setPassengers([{ ...emptyPassenger }]);
              onPhotoRemove();
            }}>
            
            {channel === "walk_in" ? "New walk-in booking" : "Book another service"}
          </Button>
        </div>
      </div>);

  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div ref={errorBox} role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {/* Package selection */}
      <section id="bf-package_code" tabIndex={-1} className="bg-card rounded-2xl border border-border p-5 outline-none">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plane className="w-4 h-4 text-accent" /> Service Package
        </h3>
        {loadingPkgs ?
        <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading packages…
          </div> :

        <div className="grid sm:grid-cols-2 gap-3">
            {packages.map((p) =>
          <button
            type="button"
            key={p.code}
            aria-pressed={form.package_code === p.code}
            onClick={() => onPackageChange(p.code)}
            className={`text-left rounded-xl border p-4 transition-all ${
            form.package_code === p.code ?
            "border-accent ring-2 ring-accent/40 bg-accent/5" :
            "border-border hover:border-accent/50"}`
            }>
            
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="text-lg font-bold text-primary">{formatGHS(p.price)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.inclusions}</p>
              </button>
          )}
          </div>
        }
        {fieldError("package_code")}
      </section>

      {/* Flight details */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Flight Details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bf-direction">Direction</Label>
            <Select value={form.flight_type} onValueChange={(v) => setField("flight_type", v)}>
              <SelectTrigger id="bf-direction"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arrival">Arrival</SelectItem>
                <SelectItem value="departure">Departure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-airline">Airline</Label>
            <Input id="bf-airline" value={form.airline} onChange={(e) => setField("airline", e.target.value)} placeholder="e.g. Kenya Airways" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-flight_number">Flight number *</Label>
            <Input {...fp("flight_number")} value={form.flight_number} onChange={(e) => setField("flight_number", e.target.value)} placeholder="e.g. KQ 510" />
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
          <div className="space-y-1.5">
            <Label htmlFor="bf-contact">Primary contact *</Label>
            <Input {...fp("contact")} type="tel" inputMode="tel" autoComplete="tel" value={form.contact} onChange={(e) => setField("contact", e.target.value)} placeholder="Phone / WhatsApp, e.g. 024 123 4567" />
            {fieldError("contact")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-nationality">Nationality</Label>
            <Input id="bf-nationality" value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} placeholder="e.g. Ghanaian" />
          </div>
          {selectedPkg?.includes_lounge &&
          <div className="space-y-1.5">
              <Label htmlFor="bf-lounge">Lounge preference</Label>
              <Input id="bf-lounge" value={form.lounge_used} onChange={(e) => setField("lounge_used", e.target.value)} placeholder="e.g. Akwaaba Lounge" />
            </div>
          }
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bf-special_requests">Special requests</Label>
          <Textarea
            id="bf-special_requests"
            value={form.special_requests}
            onChange={(e) => setField("special_requests", e.target.value)}
            placeholder="Wheelchair, unaccompanied minor, VIP, etc."
            rows={2} />
          
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

      <DiscountCodeInput
        applied={appliedDiscount}
        onApplied={setAppliedDiscount}
        onRemoved={() => setAppliedDiscount(null)}
        packageCode={form.package_code}
        numPassengers={numPassengers}
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
            onChange={(e) => { setConsented(e.target.checked); clearError("consent"); }} />
          <span>
            I have read the <Link to="/privacy" target="_blank" className="text-primary underline">privacy notice</Link> and agree that
            Airport Assist Ghana may use my details to provide this service. I understand the photo of my ID is kept for 30 days after my flight and then deleted.
            {fieldError("consent")}
          </span>
        </label>
      )}

      {/* Summary */}
      <div className="bg-primary text-primary-foreground rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-80">
            {selectedPkg ? selectedPkg.name : "Select a package"}
          </p>
          <p className="text-2xl font-bold">
            {formatGHS(appliedDiscount ? appliedDiscount.final_total : totalValue)}
          </p>
          <p className="text-xs opacity-80">
            {formatGHS(pricePerPassenger)} × {numPassengers} passenger{numPassengers !== 1 ? "s" : ""}
          </p>
          {appliedDiscount && (
            <div className="mt-2 space-y-0.5 text-xs">
              <p className="opacity-80">
                Original total: <span className="line-through">{formatGHS(appliedDiscount.gross_total)}</span>
              </p>
              <p className="text-accent font-medium">
                Discount ({appliedDiscount.code}): −{formatGHS(appliedDiscount.discount_amount)}
              </p>
            </div>
          )}
        </div>
        <Button type="submit" size="lg" disabled={submitting || paused} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {submitting ?
          <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {photoUploading ? "Uploading photo…" : "Saving…"}
            </> :
          channel === "walk_in" ?
          "Save walk-in booking" :

          "Confirm booking"
          }
        </Button>
      </div>
    </form>);

}