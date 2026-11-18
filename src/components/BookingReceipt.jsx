import React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { receiptHtml } from "@/lib/receiptHtml";
import { notifyError } from "@/lib/notify";

// A receipt that opens in its own browser tab, so the booking stays open here. From the new tab it can be printed or
// saved as PDF. Shown once something has been paid.
export default function BookingReceipt({ booking }) {
  if (!(Number(booking.amount_collected) > 0)) return null;

  const open = () => {
    const win = window.open("", "_blank");
    if (!win) {
      notifyError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      return;
    }
    win.document.open();
    win.document.write(receiptHtml(booking));
    win.document.close();
    win.document.title = `Receipt ${booking.reference}`;

    // A print button at the top of the new tab. It is added from here (not written into the page) and left out of the printout.
    const style = win.document.createElement("style");
    style.textContent = "@media print{.no-print{display:none!important}}";
    win.document.head.appendChild(style);
    const bar = win.document.createElement("div");
    bar.className = "no-print";
    bar.style.cssText = "margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid #dde5ea";
    const btn = win.document.createElement("button");
    btn.type = "button";
    btn.textContent = "Print or save as PDF";
    btn.style.cssText = "font:600 14px Arial,Helvetica,sans-serif;background:#0b213c;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer";
    btn.addEventListener("click", () => win.print());
    bar.appendChild(btn);
    win.document.body.insertBefore(bar, win.document.body.firstChild);
    win.focus();
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Receipt</h3>
        <p className="text-xs text-muted-foreground mt-1">Shows what you paid for booking {booking.reference}. It opens in a new tab.</p>
      </div>
      <Button size="sm" variant="outline" onClick={open}><ExternalLink className="w-4 h-4 mr-1" /> Open receipt</Button>
    </div>
  );
}
