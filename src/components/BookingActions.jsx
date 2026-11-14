import React, { useEffect, useState } from "react";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, UserPlus, Trash2, Wallet, Users, Armchair, ClipboardList } from "lucide-react";
import {
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatGHS,
} from "@/lib/packages";
import { PaymentBadge } from "@/components/StatusBadge";
import { useSettings } from "@/lib/SettingsContext";
import { acceptsPayments, isClosed, nextStatuses, ALL_STATUSES } from "@/lib/bookingRules";

const METHODS = ["cash", "mobile_money", "card", "corporate_account"];

export default function BookingActions({ booking, user, onUpdated }) {
  const commissionPerPassenger = Number(useSettings().settings.porter_commission_per_passenger);
  const role = user?.role || "passenger";
  const canOperate = ["supervisor", "management", "admin"].includes(role);
  const canAssignSupervisor = ["management", "admin"].includes(role);
  const canAdjust = ["management", "admin"].includes(role);
  const isAdmin = role === "admin";
  const closed = isClosed(booking.status);

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

  const [adjType, setAdjType] = useState("refund");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjMethod, setAdjMethod] = useState("cash");
  const [adjReason, setAdjReason] = useState("");
  const [savingAdj, setSavingAdj] = useState(false);

  const [fixStatus, setFixStatus] = useState("");
  const [fixReason, setFixReason] = useState("");
  const [savingFix, setSavingFix] = useState(false);

  const [assignId, setAssignId] = useState(booking.assigned_supervisor_id || "");
  const [savingAssign, setSavingAssign] = useState(false);

  useEffect(() => {
    if (canAssignSupervisor) {
      setLoadingSupers(true);
      api.entities.SupervisorDirectory.filter({ active: true }, { sort: "full_name" })
        .then((page) => setSupervisors(page.items || []))
        .catch(() => setSupervisors([]))
        .finally(() => setLoadingSupers(false));
    }
  }, [canAssignSupervisor]);

  // Staff edits go through backend functions: browsers cannot write bookings directly,
  // and the server (not this form) works out balances and commissions.
  const callBooking = async (fn, payload) => {
    const res = await api.functions.invoke(fn, { booking_id: booking.id, ...payload });
    if (res?.data?.error) throw new Error(res.data.error);
    const updated = res?.data?.booking;
    if (updated && onUpdated) onUpdated(updated);
    return updated;
  };

  const saveStatus = async () => {
    setSavingStatus(true);
    try {
      const res = await api.functions.invoke("updateBookingStatus", {
        booking_id: booking.id,
        new_status: status,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      if (res?.data?.booking && onUpdated) onUpdated(res.data.booking);
    } catch (err) {
      notifyError(err.message || "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const saveAdjustment = async () => {
    const amt = Number(adjAmount || 0);
    if (!(amt > 0)) return notifyError("Enter an amount greater than zero.");
    if (adjReason.trim().length < 3) return notifyError("Give a reason. It is kept on the record.");
    setSavingAdj(true);
    try {
      await callBooking("recordAdjustment", { type: adjType, amount: amt, method: adjType === "refund" ? adjMethod : undefined, reason: adjReason.trim() });
      setAdjAmount("");
      setAdjReason("");
    } catch (err) {
      notifyError(err.message || "Could not record that.");
    } finally {
      setSavingAdj(false);
    }
  };

  const saveCorrection = async () => {
    if (!fixStatus) return notifyError("Choose the correct status.");
    if (fixReason.trim().length < 3) return notifyError("Give a reason. It is kept on the record.");
    setSavingFix(true);
    try {
      await callBooking("correctBookingStatus", { status: fixStatus, reason: fixReason.trim() });
      setFixStatus("");
      setFixReason("");
    } catch (err) {
      notifyError(err.message || "Could not correct the status.");
    } finally {
      setSavingFix(false);
    }
  };

  const recordPayment = async () => {
    const amt = Number(payAmount || 0);
    if (!(amt > 0)) return notifyError("Enter an amount greater than zero.");
    setSavingPay(true);
    try {
      await callBooking("recordPayment", { amount: amt, method: payMethod });
      setPayAmount("");
    } catch (err) {
      notifyError(err.message || "Failed to record payment");
    } finally {
      setSavingPay(false);
    }
  };

  const addPorter = async () => {
    if (!porterName.trim()) return notifyError("Enter the porter's name.");
    setSavingPorter(true);
    try {
      await callBooking("updateBookingOperations", {
        action: "add_porter",
        porter_name: porterName.trim(),
        passengers_handled: Number(porterHandled || 0),
      });
      setPorterName("");
      setPorterHandled(1);
    } catch (err) {
      notifyError(err.message || "Failed to assign porter");
    } finally {
      setSavingPorter(false);
    }
  };

  const removePorter = async (idx) => {
    try {
      await callBooking("updateBookingOperations", { action: "remove_porter", index: idx });
    } catch (err) {
      notifyError(err.message || "Failed to remove porter");
    }
  };

  const saveLounge = async () => {
    setSavingLounge(true);
    try {
      await callBooking("updateBookingOperations", { action: "set_lounge", lounge_used: lounge.trim() });
    } catch (err) {
      notifyError(err.message || "Failed to record lounge");
    } finally {
      setSavingLounge(false);
    }
  };

  const assignSupervisor = async () => {
    if (!assignId) return notifyError("Select a supervisor.");
    setSavingAssign(true);
    try {
      const res = await api.functions.invoke("assignSupervisor", {
        booking_id: booking.id,
        supervisor_user_id: assignId,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      if (onUpdated && res?.data?.booking) onUpdated(res.data.booking);
    } catch (err) {
      notifyError(err.message || "Failed to assign supervisor");
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
              Commission: <span className="font-semibold text-foreground">{formatGHS(commissionPerPassenger * Number(porterHandled || 0))}</span>
            </div>
            <Button onClick={addPorter} disabled={savingPorter}>
              {savingPorter ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatGHS(commissionPerPassenger)} commission per passenger handled.
          </p>
          {booking.porters?.length > 0 && (
            <div className="mt-3 space-y-2">
              {booking.porters.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{p.porter_name}</span> · {p.passengers_handled} passenger(s) ·{" "}
                    {formatGHS(p.commission)}
                  </span>
                  <button aria-label="Remove porter" onClick={() => removePorter(i)} className="text-rose-500 hover:text-rose-700">
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
              <Select value={status} onValueChange={setStatus} disabled={closed}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[booking.status, ...nextStatuses(booking.status)].map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={saveStatus} disabled={savingStatus || status === booking.status || closed}>
                {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Update
              </Button>
            </div>
            {closed && (
              <p className="mt-2 text-xs text-muted-foreground">
                This booking is {STATUS_LABELS[booking.status].toLowerCase()} and cannot be changed. If it was marked by mistake, an admin can correct it.
              </p>
            )}
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
              <Button onClick={recordPayment} disabled={savingPay || !acceptsPayments(booking.status)}>
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

          {canAdjust && (
            <Panel icon={Wallet} title="Refund or write off">
              <p className="text-xs text-muted-foreground mb-3">
                A refund records money handed back. A write-off forgives a balance the passenger will not pay. Both stay on the record with your name and reason.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={adjType} onValueChange={setAdjType}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="refund">Refund</SelectItem>
                      <SelectItem value="write_off">Write off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (GHS)</Label>
                  <Input type="number" min={0} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="0.00" className="w-32" />
                </div>
                {adjType === "refund" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Paid back by</Label>
                    <Select value={adjMethod} onValueChange={setAdjMethod}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-xs">Reason</Label>
                  <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Why?" />
                </div>
                <Button onClick={saveAdjustment} disabled={savingAdj}>
                  {savingAdj ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record"}
                </Button>
              </div>
              {Number(booking.written_off) > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Written off so far: {formatGHS(booking.written_off)}</p>
              )}
            </Panel>
          )}

          {isAdmin && closed && (
            <Panel icon={ClipboardList} title="Admin correction">
              <p className="text-xs text-muted-foreground mb-3">
                Use only to fix a status set by mistake. The reason is recorded in the audit log. Discounts released by a cancellation are not claimed again.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Correct status</Label>
                  <Select value={fixStatus} onValueChange={setFixStatus}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.filter((x) => x !== booking.status).map((x) => (
                        <SelectItem key={x} value={x}>{STATUS_LABELS[x]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-xs">Reason</Label>
                  <Input value={fixReason} onChange={(e) => setFixReason(e.target.value)} placeholder="What went wrong?" />
                </div>
                <Button variant="outline" onClick={saveCorrection} disabled={savingFix}>
                  {savingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : "Correct"}
                </Button>
              </div>
            </Panel>
          )}

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