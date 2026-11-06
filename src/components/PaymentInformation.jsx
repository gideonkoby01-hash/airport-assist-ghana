import React from "react";
import { Wallet } from "lucide-react";

/**
 * Passenger-facing payment notice.
 * Payments are collected in person at the terminal — no online gateway is used,
 * and no payment details are requested at booking time.
 */
export default function PaymentInformation() {
  return (
    <section className="rounded-2xl border border-accent/50 bg-accent/5 overflow-hidden">
      <div className="bg-primary px-5 py-3.5 flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-accent" />
        <Wallet className="w-4 h-4 text-accent shrink-0" />
        <h3 className="text-sm font-semibold tracking-wide uppercase text-primary-foreground">
          Payment Information
        </h3>
      </div>
      <div className="p-5 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-accent" />
        </div>
        <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
          <p>
            All payments for Airport Assist services are made in person at the airport terminal. Payment is
            collected by our authorized Airport Assist personnel when you arrive for your service.
          </p>
          <p className="font-semibold text-primary">
            Please proceed with your booking. No online payment is required at this stage.
          </p>
        </div>
      </div>
    </section>
  );
}