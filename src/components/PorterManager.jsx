import React, { useEffect, useState } from "react";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2, Pencil, X, Luggage } from "lucide-react";

const normalizePhone = (p) => (p || "").replace(/[\s\-()]/g, "");

export default function PorterManager() {
  const [porters, setPorters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editErr, setEditErr] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.Porter.filter({}, { sort: "full_name" });
      setPorters(page.items || []);
    } catch (e) {
      setErr(e.message || "Failed to load porters.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setErr("");
    if (!name.trim() || !phone.trim()) {
      setErr("Full name and phone number are required.");
      return;
    }
    setSaving(true);
    try {
      const dup = await api.entities.Porter.filter({
        phone_number: normalizePhone(phone),
        active: true,
      });
      if ((dup.items || []).length > 0) {
        setErr("An active porter with this phone number already exists.");
        return;
      }
      await api.entities.Porter.create({
        full_name: name.trim(),
        phone_number: normalizePhone(phone),
        active: true,
      });
      setName("");
      setPhone("");
      load();
    } catch (e) {
      setErr(e.message || "Failed to add porter.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.full_name);
    setEditPhone(p.phone_number);
    setEditErr("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
    setEditErr("");
  };

  const saveEdit = async (p) => {
    setEditErr("");
    if (!editName.trim() || !editPhone.trim()) {
      setEditErr("Full name and phone number are required.");
      return;
    }
    const normalized = normalizePhone(editPhone);
    try {
      const dup = await api.entities.Porter.filter({
        phone_number: normalized,
        active: true,
      });
      const dupItem = (dup.items || []).find((d) => d.id !== p.id);
      if (dupItem) {
        setEditErr("Another active porter uses this phone number.");
        return;
      }
      await api.entities.Porter.update(p.id, {
        full_name: editName.trim(),
        phone_number: normalized,
      });
      cancelEdit();
      load();
    } catch (e) {
      setEditErr(e.message || "Failed to update porter.");
    }
  };

  const toggle = async (p) => {
    try {
      await api.entities.Porter.update(p.id, { active: !p.active });
      load();
    } catch (e) {
      notifyError(e.message || "Failed to update porter.");
    }
  };

  const remove = async (p) => {
    try {
      await api.entities.Porter.delete(p.id);
      load();
    } catch (e) {
      notifyError(e.message || "Failed to delete porter.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-accent" /> Add Porter
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kwame Mensah" />
          </div>
          <div className="space-y-1.5 flex-1 w-full">
            <Label className="text-xs">Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 024 123 4567" />
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>
        {err && <p className="text-sm text-destructive mt-3">{err}</p>}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Luggage className="w-4 h-4 text-accent" /> Porter Directory
        </h3>
        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {porters.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="border border-accent/40 rounded-lg p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2 items-end">
                    <div className="space-y-1 flex-1 w-full">
                      <Label className="text-xs">Full name</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="space-y-1 flex-1 w-full">
                      <Label className="text-xs">Phone number</Label>
                      <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(p)}>
                        <Save className="w-4 h-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {editErr && <p className="text-sm text-destructive">{editErr}</p>}
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.phone_number}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={!!p.active} onCheckedChange={() => toggle(p)} />
                      {p.active ? "Active" : "Inactive"}
                    </label>
                    <button aria-label={`Edit porter ${p.full_name}`} onClick={() => startEdit(p)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <ConfirmAction title={`Delete porter "${p.full_name}"?`} description="They will be removed from the porter list. Past bookings and reports keep their name." confirmLabel="Delete porter" destructive onConfirm={() => remove(p)}>
                      <button aria-label={`Delete porter ${p.full_name}`} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </ConfirmAction>
                  </div>
                </div>
              )
            )}
            {porters.length === 0 && <p className="text-sm text-muted-foreground">No porters yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}