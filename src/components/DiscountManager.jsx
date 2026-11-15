import React, { useEffect, useMemo, useState } from "react";
import ConfirmAction from "@/components/ConfirmAction";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatCard from "@/components/StatCard";
import DiscountFormDialog from "@/components/DiscountFormDialog";
import DiscountDetailDialog from "@/components/DiscountDetailDialog";
import { formatGHS } from "@/lib/packages";
import {
  codeStatus,
  DISCOUNT_STATUS_CLASSES,
  DISCOUNT_STATUS_LABELS,
  discountValueLabel,
  eligibilitySummary,
  remainingUses,
} from "@/lib/discounts";
import { Plus, Search, Tag, Ticket, Wallet, AlertCircle, Pencil, Power, Trash2, Eye } from "lucide-react";

export default function DiscountManager() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [expiryBefore, setExpiryBefore] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailCode, setDetailCode] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const page = await api.entities.DiscountCode.filter({}, { sort: "-created_date", limit: 200 });
      setCodes(page.items || []);
    } catch {
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const active = codes.filter((c) => codeStatus(c) === "active").length;
    const redemptions = codes.reduce((s, c) => s + (Number(c.redemption_count) || 0), 0);
    const granted = codes.reduce((s, c) => s + (Number(c.total_discount_granted) || 0), 0);
    const lapsed = codes.filter((c) => ["expired", "inactive", "exhausted"].includes(codeStatus(c))).length;
    return { active, redemptions, granted, lapsed };
  }, [codes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return codes.filter((c) => {
      const status = codeStatus(c);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (recipientFilter !== "all" && c.recipient_type !== recipientFilter) return false;
      if (expiryBefore && (!c.expiry_date || c.expiry_date > expiryBefore)) return false;
      if (!term) return true;
      return [c.code, c.recipient_name, c.contact_name, c.contact_email, c.eligible_email, c.eligible_domain]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [codes, search, statusFilter, recipientFilter, expiryBefore]);

  const toggle = async (record) => {
    setBusyId(record.id);
    try {
      await api.functions.invoke("manageDiscountCode", { action: "toggle", id: record.id });
      await load();
    } catch (err) {
      notifyError(err?.response?.data?.error || err.message || "Could not update that code.");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (record) => {
    setBusyId(record.id);
    try {
      const res = await api.functions.invoke("manageDiscountCode", { action: "delete", id: record.id });
      if (res?.data?.error) throw new Error(res.data.error);
      await load();
    } catch (err) {
      notifyError(err?.response?.data?.error || err.message || "Could not delete that code.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Codes" value={stats.active} icon={Tag} accent />
        <StatCard label="Total Redemptions" value={stats.redemptions} icon={Ticket} />
        <StatCard label="Discount Value Granted" value={formatGHS(stats.granted)} icon={Wallet} />
        <StatCard label="Expired / Inactive" value={stats.lapsed} icon={AlertCircle} />
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, individual or corporation"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="exhausted">Used up</SelectItem>
            </SelectContent>
          </Select>
          <Select value={recipientFilter} onValueChange={setRecipientFilter}>
            <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All recipients</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="corporation">Corporation</SelectItem>
            </SelectContent>
          </Select>
          <div className="lg:w-44">
            <Input
              type="date"
              value={expiryBefore}
              onChange={(e) => setExpiryBefore(e.target.value)}
              title="Expiring on or before"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> New code
          </Button>
        </div>
        {expiryBefore && (
          <p className="text-xs text-muted-foreground mt-2">Showing codes expiring on or before {expiryBefore}.</p>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading discount codes…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {codes.length === 0 ? "No discount codes yet. Create one to get started." : "No codes match these filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-secondary/60">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const status = codeStatus(c);
                  const busy = busyId === c.id;
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-primary">{c.code}</span>
                        <span className="block text-xs text-muted-foreground">{eligibilitySummary(c)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{c.recipient_name}</span>
                        <span className="block text-xs text-muted-foreground capitalize">{c.recipient_type}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{discountValueLabel(c)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{c.expiry_date || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium">{c.redemption_count || 0}</span>
                        <span className="text-muted-foreground"> / {Number(c.max_uses) > 0 ? c.max_uses : "∞"}</span>
                        <span className="block text-xs text-muted-foreground">{remainingUses(c)} left</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DISCOUNT_STATUS_CLASSES[status]}`}>
                          {DISCOUNT_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Details" onClick={() => setDetailCode(c)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            onClick={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Activate / deactivate" onClick={() => toggle(c)} disabled={busy}>
                            <Power className={`w-4 h-4 ${c.active === false ? "text-muted-foreground" : "text-emerald-600"}`} />
                          </Button>
                          <ConfirmAction title={`Delete code ${c.code}?`} description="Codes that have been redeemed cannot be deleted; deactivate those instead." confirmLabel="Delete code" destructive onConfirm={() => remove(c)}>
                            <Button variant="ghost" size="icon" title="Delete" aria-label={`Delete code ${c.code}`} disabled={busy}>
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </Button>
                          </ConfirmAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DiscountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        discount={editing}
        onSaved={load}
      />
      <DiscountDetailDialog
        open={Boolean(detailCode)}
        onOpenChange={(open) => !open && setDetailCode(null)}
        code={detailCode}
      />
    </div>
  );
}