import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import SupervisorPhoto from "./SupervisorPhoto";
import { Camera, Loader2, Save } from "lucide-react";

const EMPTY = { phone: "", whatsapp_number: "", email: "", languages: "", bio: "", photo_uri: "" };
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Edits a supervisor profile.
 * - Supervisors: their own record only (resolved from their own user_id).
 * - Admins: any record, and may also correct the supervisor's full name.
 * The photograph is uploaded to private storage; only the file URI is stored.
 */
export default function SupervisorProfileForm({ record = undefined, user = undefined, isAdmin = false, onSaved = undefined }) {
  const [entry, setEntry] = useState(record || null);
  const [loading, setLoading] = useState(!record);
  const [form, setForm] = useState(EMPTY);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    if (record) {
      setEntry(record);
      return undefined;
    }
    if (!user?.id) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    base44.entities.SupervisorDirectory.filter({ user_id: user.id })
      .then((res) => {
        const items = res?.items || res || [];
        if (active) setEntry(items[0] || null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [record, user?.id]);

  useEffect(() => {
    setForm({
      phone: entry?.phone || "",
      whatsapp_number: entry?.whatsapp_number || "",
      email: entry?.email || user?.email || "",
      languages: entry?.languages || "",
      bio: entry?.bio || "",
      photo_uri: entry?.photo_uri || "",
    });
    setFullName(entry?.full_name || user?.full_name || "");
  }, [entry, user?.email, user?.full_name]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Image too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      set("photo_uri", file_uri);
      toast({ title: "Photo uploaded", description: "Save the profile to keep this photograph." });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e.message || "The photograph could not be uploaded.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Check the email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        phone: form.phone.trim(),
        whatsapp_number: form.whatsapp_number.trim(),
        email,
        languages: form.languages.trim(),
        bio: form.bio.trim(),
        photo_uri: form.photo_uri,
      };
      let saved;
      if (entry) {
        if (isAdmin) payload.full_name = fullName.trim();
        saved = await base44.entities.SupervisorDirectory.update(entry.id, payload);
      } else if (user?.role === "supervisor") {
        saved = await base44.entities.SupervisorDirectory.create({
          user_id: user.id,
          full_name: fullName.trim() || user.full_name || "",
          email: email || user.email,
          active: true,
          ...payload,
        });
      }
      if (!saved) {
        toast({
          title: "No supervisor profile",
          description: "No supervisor profile is linked to this account. Please contact the Administrator.",
          variant: "destructive",
        });
        return;
      }
      setEntry(saved);
      toast({ title: "Profile saved", description: "The supervisor profile has been updated." });
      if (onSaved) onSaved(saved);
    } catch (e) {
      toast({
        title: "Could not save profile",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1">Supervisor Profile</h3>
      <p className="text-xs text-muted-foreground mb-5">
        {isAdmin
          ? "This information is shown to the passenger on the booking once this supervisor is assigned."
          : "These details are shown to your assigned passengers so they can reach you on the day."}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        <SupervisorPhoto fileUri={form.photo_uri} name={fullName} className="w-24 h-24" />
        <div>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />}
            {form.photo_uri ? "Replace photograph" : "Upload photograph"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2">JPG or PNG, up to 5 MB. Stored privately.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {isAdmin && (
          <div className="sm:col-span-2">
            <Label htmlFor="sup-name">Full name</Label>
            <Input id="sup-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="sup-phone">Contact number</Label>
          <Input
            id="sup-phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+233 20 000 0000"
          />
        </div>
        <div>
          <Label htmlFor="sup-wa">WhatsApp number</Label>
          <Input
            id="sup-wa"
            value={form.whatsapp_number}
            onChange={(e) => set("whatsapp_number", e.target.value)}
            placeholder="+233 20 000 0000"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="sup-email">Email address</Label>
          <Input
            id="sup-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="supervisor@airportassistghana.com"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="sup-lang">Languages spoken</Label>
          <Input
            id="sup-lang"
            value={form.languages}
            onChange={(e) => set("languages", e.target.value)}
            placeholder="English, Twi, French"
          />
          <p className="text-[11px] text-muted-foreground mt-1">Separate languages with commas.</p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="sup-bio">Short professional introduction</Label>
          <Textarea
            id="sup-bio"
            rows={4}
            value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="A few lines about your experience and how you assist passengers."
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving || uploading}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}