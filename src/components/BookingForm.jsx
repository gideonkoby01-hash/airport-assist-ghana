import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users, Plane, CheckCircle2 } from "lucide-react";
import {
  PACKAGE_DEFINITIONS,
  PACKAGE_LABELS,
  computeTotal,
  generateReference,
  formatGHS,
  packageByCode } from
"@/lib/packages";

const emptyPassenger = { name: "", contact: "", nationality: "", total_bags: 0, special_requests: "" };

const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export default function BookingForm({ channel = "online", user, supervisor, onCreated }) {
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
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const page = await base44.entities.ServicePackage.filter({ active: true }, { sort: "price" });
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

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPackageChange = (code) => {
    const pkg = packages.find((p) => p.code === code) || packageByCode(code);
    const ft = pkg?.flight_type === "departure" ? "departure" : pkg?.flight_type === "arrival" ? "arrival" : form.flight_type;
    setForm((f) => ({ ...f, package_code: code, flight_type: ft }));
  };

  const setPassenger = (i, k, v) =>
  setPassengers((ps) => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const addPassenger = () => setPassengers((ps) => [...ps, { ...emptyPassenger }]);
  const removePassenger = (i) =>
  setPassengers((ps) => ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps);

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

  const validate = () => {
    if (!form.package_code) return "Please select a service package.";
    if (!form.flight_number.trim()) return "Flight number is required.";
    if (!form.flight_date) return "Flight date is required.";
    if (!form.scheduled_flight_time) return "Scheduled flight time is required.";
    if (!form.contact.trim()) return "A contact number is required.";
    for (let i = 0; i < passengers.length; i++) {
      if (!passengers[i].name.trim()) return `Passenger ${i + 1}: name is required.`;
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      const pkg = selectedPkg;
      const ref = generateReference();
      let passenger_photo_uri = "";
      if (photoFile) {
        setPhotoUploading(true);
        try {
          const res = await base44.integrations.Core.UploadPrivateFile({ file: photoFile });
          passenger_photo_uri = res.file_uri;
        } catch (err) {
          setPhotoUploading(false);
          setSubmitting(false);
          setError(err.message || "Failed to upload photo. Please try again.");
          return;
        } finally {
          setPhotoUploading(false);
        }
      }
      const payload = {
        reference: ref,
        package_code: pkg.code,
        package_name: pkg.name,
        price_per_passenger: Number(pkg.price),
        num_passengers: numPassengers,
        total_value: totalValue,
        flight_type: form.flight_type,
        airline: form.airline.trim(),
        flight_number: form.flight_number.trim(),
        flight_date: form.flight_date,
        scheduled_flight_time: form.scheduled_flight_time,
        contact: form.contact.trim(),
        nationality: form.nationality.trim(),
        total_bags: Number(form.total_bags || 0),
        special_requests: form.special_requests.trim(),
        lounge_used: pkg.includes_lounge ? form.lounge_used.trim() : "",
        passengers: passengers.map((p) => ({
          name: p.name.trim(),
          contact: p.contact.trim(),
          nationality: p.nationality.trim(),
          total_bags: Number(p.total_bags || 0),
          special_requests: p.special_requests.trim()
        })),
        porters: [],
        status: channel === "walk_in" ? "assigned" : "confirmed",
        payment_status: "unpaid",
        amount_collected: 0,
        outstanding_balance: totalValue,
        booking_channel: channel,
        passenger_photo_uri
      };
      if (channel === "walk_in" && supervisor) {
        payload.assigned_supervisor_id = supervisor.id;
        payload.assigned_supervisor_name = supervisor.name || supervisor.email;
      }
      const booking = await base44.entities.Booking.create(payload);
      setCreated(booking);
      if (onCreated) onCreated(booking);
    } catch (err) {
      setError(err.message || "Failed to create booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <div className="flex gap-3 justify-center mt-6">
          <Button variant="outline" onClick={() => window.location.assign(`/bookings/${created.id}`)}>
            View booking
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
      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {/* Package selection */}
      <section className="bg-card rounded-2xl border border-border p-5">
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
      </section>

      {/* Flight details */}
      <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Flight Details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <Select value={form.flight_type} onValueChange={(v) => setField("flight_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arrival">Arrival</SelectItem>
                <SelectItem value="departure">Departure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Airline</Label>
            <Input value={form.airline} onChange={(e) => setField("airline", e.target.value)} placeholder="e.g. Kenya Airways" />
          </div>
          <div className="space-y-1.5">
            <Label>Flight number *</Label>
            <Input value={form.flight_number} onChange={(e) => setField("flight_number", e.target.value)} placeholder="e.g. KQ 510" />
          </div>
          <div className="space-y-1.5">
            <Label>Flight date *</Label>
            <Input type="date" value={form.flight_date} onChange={(e) => setField("flight_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Scheduled flight time *</Label>
            <Input type="time" value={form.scheduled_flight_time} onChange={(e) => setField("scheduled_flight_time", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Primary contact *</Label>
            <Input value={form.contact} onChange={(e) => setField("contact", e.target.value)} placeholder="Phone / WhatsApp" />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} placeholder="e.g. Ghanaian" />
          </div>
          {selectedPkg?.includes_lounge &&
          <div className="space-y-1.5">
              <Label>Lounge preference</Label>
              <Input value={form.lounge_used} onChange={(e) => setField("lounge_used", e.target.value)} placeholder="e.g. Akwaaba Lounge" />
            </div>
          }
        </div>
        <div className="space-y-1.5">
          <Label>Special requests</Label>
          <Textarea
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
              <button type="button" onClick={() => removePassenger(i)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
              }
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Full name *</Label>
                  <Input value={p.name} onChange={(e) => setPassenger(i, "name", e.target.value)} placeholder="Passenger name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact</Label>
                  <Input value={p.contact} onChange={(e) => setPassenger(i, "contact", e.target.value)} placeholder="Phone" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nationality</Label>
                  <Input value={p.nationality} onChange={(e) => setPassenger(i, "nationality", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bags</Label>
                  <Input
                  type="number"
                  min={0}
                  value={p.total_bags}
                  onChange={(e) => setPassenger(i, "total_bags", e.target.value)} />
                
                </div>
              </div>
              <div className="space-y-1 mt-2">
                <Label className="text-xs">Special requests</Label>
                <Input value={p.special_requests} onChange={(e) => setPassenger(i, "special_requests", e.target.value)} />
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
        <p className="text-xs text-muted-foreground">Optional. This will help with easy identifation  (JPG, PNG, or WEBP, up to 5MB).

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
            <span className="text-xs text-muted-foreground">Click to upload a photo</span>
            <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPhotoSelect} />
          
          </label>
        }
      </section>

      {/* Summary */}
      <div className="bg-primary text-primary-foreground rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-80">
            {selectedPkg ? selectedPkg.name : "Select a package"}
          </p>
          <p className="text-2xl font-bold">{formatGHS(totalValue)}</p>
          <p className="text-xs opacity-80">
            {formatGHS(pricePerPassenger)} × {numPassengers} passenger{numPassengers !== 1 ? "s" : ""}
          </p>
        </div>
        <Button type="submit" size="lg" disabled={submitting || !selectedPkg} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {submitting ?
          <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </> :
          channel === "walk_in" ?
          "Save walk-in booking" :

          "Confirm booking"
          }
        </Button>
      </div>
    </form>);

}