import React, { useEffect, useState } from "react";
import { notifyError } from "@/lib/notify";
import { api } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgeDollarSign, Loader2, Save, UserPlus, Trash2, Wallet, Users, Armchair, ClipboardList } from "lucide-react";
import {
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatGHS,
} from "@/lib/packages";
import { PaymentBadge } from "@/components/StatusBadge";
import { useSettings } from "@/lib/SettingsContext";
import { acceptsPayments, canAssignPorter, isClosed, nextStatuses, ALL_STATUSES } from "@/lib/bookingRules";

const METHODS = ["cash", "mobile_money", "card", "corporate_account"];

export default function BookingActions({ booking, user, onUpdated }) {
  const { settings } = useSettings();
  const commissionPerPassenger = Number(settings.porter_commission_per_passenger);
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

  const [porterRegister, setPorterRegister] = useState([]);
  const [porterId, setPorterId] = useState("");
  const covered = (booking.porters || []).reduce((n, p) => n + (Number(p.passengers_handled) || 0), 0);
  // A meet and assist does not always need a porter: staff can mark passengers who need none.
  const waived = Number(booking.porters_waived) || 0;
  const passengersLeft = Math.max(0, (booking.num_passengers || 1) - covered - waived);
  const canGoWithoutPorter = booking.package_code !== "porter_only";
  const setWaived = async (count) => {
    setSavingPorter(true);
    try {
      await callBooking("updateBookingOperations", { action: "set_porters_waived", count });
    } catch (err) {
      notifyError(err.message || "Could not update the porters.");
    } finally {
      setSavingPorter(false);
    }
  };
  const mayAssignPorter = canAssignPorter(user, booking);
  // The supervisor's own commission on a meet and assist is added automatically when the payment is recorded, and comes off the day's takings in the shift report.
  const supervisorCommission = Number(settings.supervisor_commission_per_signup);
  const mayTickCommission =
    booking.package_code !== "porter_only" && !["cancelled", "no_show"].includes(booking.status) && Boolean(booking.assigned_supervisor_id) &&
    (role === "supervisor" ? booking.assigned_supervisor_id === user?.id : ["management", "admin"].includes(role));
  const commissionTicked = Number(booking.supervisor_commission || 0) > 0;
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

  // The register of porters, for whoever may assign one on this booking.
  useEffect(() => {
    if (!mayAssignPorter) return;
    api.entities.Porter.filter({ active: true }, { sort: "full_name" })
      .then((page) => setPorterRegister(page.items || []))
      .catch(() => setPorterRegister([]));
  }, [mayAssignPorter]);

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
    if (!porterId) return notifyError("Choose a porter from the list.");
    setSavingPorter(true);
    try {
      await callBooking("updateBookingOperations", {
        action: "add_porter",
        porter_id: porterId,
      });
      setPorterId("");
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

        </>
      )}

      {mayTickCommission && (
        <Panel icon={BadgeDollarSign} title="Supervisor commission">
          <p className="text-sm">
            <span className="font-medium text-foreground">
              {commissionTicked ? `Commission earned on this meet and assist: ${formatGHS(booking.supervisor_commission)}` : `Every meet and assist earns the supervisor ${formatGHS(supervisorCommission)}`}
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {commissionTicked
                ? booking.supervisor_commission_locked
                  ? "Added automatically, and already in a submitted shift report."
                  : "Added automatically when the payment was recorded. It is taken off the day's takings in the shift report."
                : "It is added automatically when the payment is recorded, and taken off the day's takings in the shift report."}
            </span>
          </p>
        </Panel>
      )}

      {mayAssignPorter && (
        <Panel icon={Users} title="Porters & Commission">
          <p className="text-xs text-muted-foreground mb-3">
            {booking.booking_channel === "walk_in"
              ? "A walk-in at the desk: you choose the porter."
              : "A service requested on the website: management assigns the porter."}{" "}
            One porter handles one passenger, and each porter earns {formatGHS(commissionPerPassenger)} for the job, paid to them daily.
            {" "}<span className="font-medium text-foreground">{Math.min(covered, booking.num_passengers || 1)} of {booking.num_passengers || 1} passenger(s) have a porter{waived > 0 ? `, ${waived} need${waived === 1 ? "s" : ""} none` : ""}.</span>
          </p>
          {canGoWithoutPorter && (passengersLeft > 0 || waived > 0) && (
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              {passengersLeft > 0 && (
                <Button type="button" variant="outline" size="sm" disabled={savingPorter} onClick={() => setWaived(waived + passengersLeft)}>
                  No porter needed for {passengersLeft === 1 ? "the other passenger" : `the other ${passengersLeft} passengers`}
                </Button>
              )}
              {waived > 0 && (
                <Button type="button" variant="ghost" size="sm" disabled={savingPorter} onClick={() => setWaived(0)}>
                  Undo: these passengers do need a porter
                </Button>
              )}
            </div>
          )}
          {passengersLeft === 0 ? (
            <p className="text-sm text-muted-foreground">{waived > 0 ? "Every passenger is covered: a porter, or none needed." : "Every passenger has a porter."}</p>
          ) : porterRegister.length === 0 ? (
            <p className="text-sm text-muted-foreground">No porters on the list yet. An admin adds them under Porters.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[170px]">
                <Label htmlFor="porter-pick" className="text-xs">Porter</Label>
                <Select value={porterId} onValueChange={setPorterId}>
                  <SelectTrigger id="porter-pick"><SelectValue placeholder="Choose a porter" /></SelectTrigger>
                  <SelectContent>
                    {porterRegister.filter((p) => !(booking.porters || []).some((x) => x.porter_id === p.id)).map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground pb-2">
                Commission: <span className="font-semibold text-foreground">{formatGHS(commissionPerPassenger)}</span> for this job
              </div>
              <Button onClick={addPorter} disabled={savingPorter || !porterId}>
                {savingPorter ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                Assign
              </Button>
            </div>
          )}
          {booking.porters?.length > 0 && (
            <div className="mt-3 space-y-2">
              {booking.porters.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{p.porter_name}</span>
                    {p.extra ? <> · <span className="text-xs font-semibold rounded-full bg-accent/20 px-2 py-0.5">Extra porter +{formatGHS(p.fee)}</span></> : <> · 1 passenger</>} ·{" "}
                    {formatGHS(p.commission)}
                  </span>
                  <button aria-label={`Remove ${p.porter_name}`} onClick={() => removePorter(i)} className="text-rose-500 hover:text-rose-700">
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