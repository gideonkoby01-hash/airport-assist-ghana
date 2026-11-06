import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatGHS } from "@/lib/packages";
import {
  codeStatus,
  DISCOUNT_STATUS_CLASSES,
  DISCOUNT_STATUS_LABELS,
  discountValueLabel,
  eligibilitySummary,
  remainingUses,
} from "@/lib/discounts";

export default function DiscountDetailDialog({ code, open, onOpenChange }) {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !code) return;
    setLoading(true);
    base44.entities.DiscountRedemption.filter(
      { discount_code_id: code.id },
      { sort: "-redeemed_at", limit: 100 }
    )
      .then((page) => setRedemptions(page.items || []))
      .catch(() => setRedemptions([]))
      .finally(() => setLoading(false));
  }, [open, code]);

  if (!code) return null;
  const status = codeStatus(code);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-mono">{code.code}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DISCOUNT_STATUS_CLASSES[status]}`}>
              {DISCOUNT_STATUS_LABELS[status]}
            </span>
          </DialogTitle>
          <DialogDescription>
            {code.recipient_name} · {code.recipient_type === "corporation" ? "Corporation" : "Individual"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Info label="Discount" value={discountValueLabel(code)} />
          <Info label="Validity" value={`${code.start_date} to ${code.expiry_date}`} />
          <Info label="Total redemptions" value={String(code.redemption_count || 0)} />
          <Info label="Remaining uses" value={remainingUses(code)} />
          <Info label="Discount granted" value={formatGHS(code.total_discount_granted || 0)} />
          <Info label="Eligibility" value={eligibilitySummary(code)} />
          {code.contact_name && <Info label="Contact" value={code.contact_name} />}
          {code.contact_email && <Info label="Contact email" value={code.contact_email} />}
          {code.contact_phone && <Info label="Contact phone" value={code.contact_phone} />}
        </div>

        {code.description && (
          <div className="rounded-lg bg-secondary p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Internal note</p>
            <p>{code.description}</p>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Redemption history</h4>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading redemptions…</p>
          ) : redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">This code has not been redeemed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-3">Booking</th>
                    <th className="pb-2 pr-3">Passenger</th>
                    <th className="pb-2 pr-3 text-right">Original</th>
                    <th className="pb-2 pr-3 text-right">Discount</th>
                    <th className="pb-2 pr-3 text-right">Final</th>
                    <th className="pb-2">Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-3">
                        <Link to={`/bookings/${r.booking_id}`} className="font-mono text-primary hover:underline">
                          {r.booking_reference || r.booking_id}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.user_email || "—"}</td>
                      <td className="py-2 pr-3 text-right">{formatGHS(r.gross_total)}</td>
                      <td className="py-2 pr-3 text-right text-emerald-700">−{formatGHS(r.discount_amount)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatGHS(r.net_total)}</td>
                      <td className="py-2 text-muted-foreground">
                        {r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
}