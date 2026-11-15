import React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { receiptHtml } from "@/lib/receiptHtml";

// A receipt the passenger can print or save as PDF through the browser's print dialog. Shown once something has been paid.
export default function BookingReceipt({ booking }) {
  if (!(Number(booking.amount_collected) > 0)) return null;

  const print = () => {
    // Print from a hidden frame so the app's menus and buttons never appear on the page.
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(receiptHtml(booking));
    doc.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60_000);
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Receipt</h3>
        <p className="text-xs text-muted-foreground mt-1">Shows what you paid for booking {booking.reference}.</p>
      </div>
      <Button size="sm" variant="outline" onClick={print}><Printer className="w-4 h-4 mr-1" /> Print or save as PDF</Button>
    </div>
  );
}
