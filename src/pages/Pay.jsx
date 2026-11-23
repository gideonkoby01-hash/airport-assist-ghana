import React from "react";
import { useLocation } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/use-document-title";
import PayNow from "@/components/booking/PayNow";
import PayShell from "@/components/booking/PayShell";
import { readPayLink } from "@/lib/payments";

// Where the "Pay now" link in the confirmation email lands. The booking's id and reference in the address are what let a passenger pay.
export default function Pay() {
  useDocumentTitle("Pay for your booking");
  const link = readPayLink(useLocation().search);
  return (
    <PayShell>
      <div className="text-center">
        <h1 className="serif text-3xl text-foreground">Pay for your booking</h1>
        {link && <p className="text-sm text-muted-foreground mt-2">Booking <span className="font-mono font-semibold text-foreground">{link.reference}</span></p>}
      </div>
      {link
        ? <PayNow bookingId={link.bookingId} reference={link.reference} />
        : <p className="text-sm text-muted-foreground text-center" role="status">This payment link is incomplete. Open it again from your booking confirmation email, or pay at the airport.</p>}
    </PayShell>
  );
}
