import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2 } from "lucide-react";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function blankForm() {
  return {
    code: "",
    recipient_type: "individual",
    recipient_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    start_date: isoToday(),
    expiry_date: isoInDays(90),
    max_uses: 0,
    max_uses_per_customer: 0,
    eligible_email: "",
    eligible_domain: "",
    eligible_emails: "",
    active: true,
  };
}

function toForm(record) {
  if (!record) return blankForm();
  return {
    code: record.code || "",
    recipient_type: record.recipient_type || "individual",
    recipient_name: record.recipient_name || "",
    contact_name: record.contact_name || "",
    contact_email: record.contact_email || "",
    contact_phone: record.contact_phone || "",
    description: record.description || "",
    discount_type: record.discount_type || "percentage",
    discount_value: record.discount_value ?? "",
    start_date: record.start_date || isoToday(),
    expiry_date: record.expiry_date || isoInDays(90),
    max_uses: record.max_uses ?? 0,
    max_uses_per_customer: record.max_uses_per_customer ?? 0,
    eligible_email: record.eligible_email || record.contact_email || "",
    eligible_domain: record.eligible_domain || "",
    eligible_emails: (record.eligible_emails || []).join(", "),
    active: record.active !== false,
  };
}

export default function DiscountFormDialog({ open, onOpenChange, discount, onSaved }) {
  const isEdit = Boolean(discount);
  const [form, setForm] = useState(toForm(discount));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(toForm(discount));
      setError("");
    }
  }, [open, discount]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageDiscountCode", { action: "generate" });
      const code = res?.data?.code;
      if (code) set("code", code);
      else setError(res?.data?.error || "Could not generate a code.");
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not generate a code.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        action: isEdit ? "update" : "create",
        id: discount?.id,
        code: form.code,
        recipient_type: form.recipient_type,
        recipient_name: form.recipient_name,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        description: form.description,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        start_date: form.start_date,
        expiry_date: form.expiry_date,
        max_uses: Number(form.max_uses || 0),
        max_uses_per_customer: Number(form.max_uses_per_customer || 0),
        eligible_email: form.eligible_email,
        eligible_domain: form.eligible_domain,
        eligible_emails: String(form.eligible_emails || "")
          .split(/[\s,;]+/)
          .filter(Boolean),
        active: form.active,
      };
      const res = await base44.functions.invoke("manageDiscountCode", payload);
      if (res?.data?.error) throw new Error(res.data.error);
      onSaved?.(res?.data?.record);
      onOpenChange(false);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not save the discount code.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit discount code" : "New discount code"}</DialogTitle>
          <DialogDescription>
            The code is validated and the discount is calculated on the server at booking time.
          </DialogDescription>
        </DialogHeader>

        {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

        <div className="space-y-5">
          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="e.g. AAG-7K2M9P"
                  className="uppercase"
                />
                <Button type="button" variant="outline" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Codes are unique and not case-sensitive.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issued to</Label>
                <Select value={form.recipient_type} onValueChange={(v) => set("recipient_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="corporation">Corporation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.recipient_type === "corporation" ? "Corporation name" : "Individual name"}</Label>
                <Input value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} placeholder="Full name" />
              </div>
            </div>
          </section>

          <section className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Contact name</Label>
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact email</Label>
              <Input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact phone</Label>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+233…" />
            </div>
          </section>

          <div className="space-y-1.5">
            <Label>Description / internal note</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Why this code was issued" />
          </div>

          <section className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Discount type</Label>
              <Select value={form.discount_type} onValueChange={(v) => set("discount_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount (GHS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.discount_type === "percentage" ? "Percentage off" : "Amount off (GHS)"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.discount_value}
                onChange={(e) => set("discount_value", e.target.value)}
                placeholder={form.discount_type === "percentage" ? "10" : "150.00"}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Maximum total uses</Label>
                <Input type="number" min={0} value={form.max_uses} onChange={(e) => set("max_uses", e.target.value)} />
                <p className="text-xs text-muted-foreground">0 = unlimited</p>
              </div>
              <div className="space-y-1.5">
                <Label>Maximum uses per customer</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_uses_per_customer}
                  onChange={(e) => set("max_uses_per_customer", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = unlimited</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4 space-y-3 bg-secondary/30">
            <p className="text-sm font-semibold text-foreground">Eligibility (verified from the passenger's account)</p>
            {form.recipient_type === "individual" ? (
              <div className="space-y-1.5">
                <Label>Customer account email</Label>
                <Input
                  value={form.eligible_email}
                  onChange={(e) => set("eligible_email", e.target.value)}
                  placeholder="customer@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Only the signed-in passenger with this account email can redeem the code.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Approved email domain</Label>
                  <Input
                    value={form.eligible_domain}
                    onChange={(e) => set("eligible_domain", e.target.value)}
                    placeholder="e.g. acme.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Any passenger whose account email is on this domain is eligible.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Approved member emails</Label>
                  <Textarea
                    value={form.eligible_emails}
                    onChange={(e) => set("eligible_emails", e.target.value)}
                    rows={2}
                    placeholder="name@acme.com, other@acme.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate with commas. Add at least one approved email when no domain is set.
                  </p>
                </div>
              </>
            )}
          </section>

          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">Inactive codes are rejected for every passenger.</p>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Create code"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}