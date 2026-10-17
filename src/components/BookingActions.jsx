import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, UserPlus, Trash2, Wallet, Users, Armchair, ClipboardList } from "lucide-react";
import {
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PORTER_COMMISSION_PER_PASSENGER,
  porterCommission,
  formatGHS,
} from "@/lib/packages";
import { BookingStatusBadge, PaymentBadge } from "@/components/StatusBadge";

const STATUSES = ["confirmed", "assigned", "in_progress", "completed", "cancelled", "no_show"];
const METHODS = ["cash", "mobile_money", "card", "corporate_account"];

export default function BookingActions({ booking, user, onUpdated }) {
  const role = user?.role || "passenger";
  const canOperate = ["supervisor", "management", "admin"].includes(role);
  const canAssignSupervisor = ["management", "admin"].includes(role);

  const [supervisors, setSupervisors] = useState([]);
  const [loadingSupers, setLoadingSupers] = useState(false);
  const [status, setStatus] = useState(booking.status);
  const [savingStatus, setSavingStatus] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState(booking.payment_method || "cash");
  const [savingPay, setSavingPay] = useState(false);

  const [porterName, setPorterName] = useState("");
  const [porterHandled, setPorterHandled] = useState(1);
  const [savingPorter, setSavingPorter] = useState(false);

  const [lounge, setLounge] = useState(booking.lounge_used || "");
  const [savingLounge, setSavingLounge] = useState(false);

  const [assignId, setAssignId] = useState(booking.assigned_supervisor_id || "");
  const [savingAssign, setSavingAssign] = useState(false);

  useEffect(() => {
    if (canAssignSupervisor) {
      setLoadingSupers(true);
      base44.entities.SupervisorDirectory.filter({ active: true }, { sort: "full_name" })
        .then((page) => setSupervisors(page.items || []))
        .catch(() => setSupervisors([]))
        .finally(() => setLoadingSupers(false));
    }
  }, [canAssignSupervisor]);

  const patch = async (data) => {
    const updated = await base44.entities.Booking.update(booking.id, data);
    if (onUpdated) onUpdated(updated);
    return updated;
  };

  const saveStatus = async () => {
    setSavingStatus(true);
    try {
      const res = await base44.functions.invoke("updateBookingStatus", {
        booking_id: booking.id,
        new_status: status,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      if (res?.data?.booking && onUpdated) onUpdated(res.data.booking);
    } catch (err) {
      alert(err.message || "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const recordPayment = async () => {
    const amt = Number(payAmount || 0);
    if (amt < 0) return alert("Amount cannot be negative.");
    const collected = Number(booking.amount_collected || 0) + amt;
    const total = Number(booking.total_value || 0);
    const outstanding = Math.max(0, total - collected);
    const paymentStatus = collected >= total ? "paid" : collected > 0 ? "partially_paid" : "unpaid";
    setSavingPay(true);
    try {
      await patch({
        amount_collected: collected,
        outstanding_balance: outstanding,
        payment_status: paymentStatus,
        payment_method: payMethod,
      });
      setPayAmount("");
    } catch (err) {
      alert(err.message || "Failed to record payment");
    } finally {
      setSavingPay(false);
    }
  };

  const addPorter = async () => {
    if (!porterName.trim()) return alert("Enter the porter's name.");
    const handled = Number(porterHandled || 0);
    const newPorter = {
      porter_name: porterName.trim(),
      passengers_handled: handled,
      commission: porterCommission(handled),
    };
    const porters = [...(booking.porters || []), newPorter];
    setSavingPorter(true);
    try {
      await patch({ porters });
      setPorterName("");
      setPorterHandled(1);
    } catch (err) {
      alert(err.message || "Failed to assign porter");
    } finally {
      setSavingPorter(false);
    }
  };

  const removePorter = async (idx) => {
    const porters = (booking.porters || []).filter((_, i) => i !== idx);
    try {
      await patch({ porters });
    } catch (err) {
      alert(err.message || "Failed to remove porter");
    }
  };

  const saveLounge = async () => {
    setSavingLounge(true);
    try {
      await patch({ lounge_used: lounge.trim() });
    } catch (err) {
      alert(err.message || "Failed to record lounge");
    } finally {
      setSavingLounge(false);
    }
  };

  const assignSupervisor = async () => {
    if (!assignId) return alert("Select a supervisor.");
    setSavingAssign(true);
    try {
      const res = await base44.functions.invoke("assignSupervisor", {
        booking_id: booking.id,
        supervisor_user_id: assignId,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      if (onUpdated && res?.data?.booking) onUpdated(res.data.booking);
    } catch (err) {
      alert(err.message || "Failed to assign supervisor");
    } finally {
      setSavingAssign(false);
    }
  };

  if (!canOperate && !canAssignSupervisor) return null;

  return (
    <div className="space-y-5">
      {/* Supervisor assignment */}
      {canAssignSupervisor && (
        <>
        <Panel icon={UserPlus} title="Responsible Supervisor">
          {loadingSupers ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={assignId} onValueChange={setAssignId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map((s) => (
                    <SelectItem key={s.id} value={s.user_id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={assignSupervisor} disabled={savingAssign || !assignId}>
                {savingAssign ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
              </Button>
            </div>
          )}
          {booking.assigned_supervisor_name && (
            <p className="text-sm text-muted-foreground mt-2">
              Currently assigned: <span className="font-medium text-foreground">{booking.assigned_supervisor_name}</span>
            </p>
          )}
        </Panel>

        {/* Porters */}
        <Panel icon={Users} title="Porters & Commission">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs">Porter name</Label>
              <Input value={porterName} onChange={(e) => setPorterName(e.target.value)} placeholder="Porter name" />
            </div>
            <div className="space-y-1 w-28">
              <Label className="text-xs">Passengers handled</Label>
              <Input
                type="number"
                min={1}
                value={porterHandled}
                onChange={(e) => setPorterHandled(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              Commission: <span className="font-semibold text-foreground">{formatGHS(porterCommission(Number(porterHandled || 0)))}</span>
            </div>
            <Button onClick={addPorter} disabled={savingPorter}>
              {savingPorter ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatGHS(PORTER_COMMISSION_PER_PASSENGER)} commission per passenger handled.
          </p>
          {booking.porters?.length > 0 && (
            <div className="mt-3 space-y-2">
              {booking.porters.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{p.porter_name}</span> · {p.passengers_handled} passenger(s) ·{" "}
                    {formatGHS(p.commission)}
                  </span>
                  <button onClick={() => removePorter(i)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border">
                <span>Total commission</span>
                <span>{formatGHS((booking.porters || []).reduce((s, p) => s + (p.commission || 0), 0))}</span>
              </div>
            </div>
          )}
        </Panel>
        </>
      )}

      {canOperate && (
        <>
          {/* Status */}
          <Panel icon={ClipboardList} title="Service Status">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={saveStatus} disabled={savingStatus || status === booking.status}>
                {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Update
              </Button>
            </div>
          </Panel>

          {/* Payment */}
          <Panel icon={Wallet} title="Payment">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount collected (GHS)</Label>
                <Input
                  type="number"
                  min={0}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-36"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-xs">Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={recordPayment} disabled={savingPay}>
                {savingPay ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record"}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="bg-secondary rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="font-semibold">{formatGHS(booking.amount_collected)}</p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-semibold text-rose-600">{formatGHS(booking.outstanding_balance)}</p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Status</p>
                <PaymentBadge status={booking.payment_status} />
              </div>
            </div>
          </Panel>

          {/* Lounge */}
          <Panel icon={Armchair} title="Lounge Used">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input value={lounge} onChange={(e) => setLounge(e.target.value)} placeholder="Lounge name (if used)" className="flex-1" />
              <Button onClick={saveLounge} disabled={savingLounge}>
                {savingLounge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Panel({ icon: Icon, title, children }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" /> {title}
      </h4>
      {children}
    </div>
  );
}