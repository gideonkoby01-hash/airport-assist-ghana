import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import Reveal, { inertWhen } from "@/components/home/Reveal";

const FAQS = [
  { q: "Are services available around the clock?", a: "Yes. Airport Assist Ghana operates 24 hours a day, 7 days a week, so we can meet flights arriving or departing at any time." },
  { q: "Do you issue or guarantee visas or entry?", a: "No. We do not issue or guarantee visas or entry. Visa-on-arrival assistance is provided where applicable, but all visa and entry decisions rest with the relevant authorities." },
  { q: "Is lounge access included in every package?", a: "No. Full Arrival and Full Departure include lounge access; Departure Priority Only and Porter Service Only do not." },
  { q: "Do you offer luggage delivery?", a: "Not yet. We are working on adding luggage delivery to our services. In the meantime we handle baggage inside the terminal as part of eligible packages." },
  { q: "How do I book a service?", a: "Choose Book assistance, pick your package, and give us your flight and passenger details. Our team then prepares your assistance." },
  { q: "How do I pay?", a: "You pay in person at the airport when you meet our team. No payment is taken online when you book." },
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="bg-background">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="text-center">
          <p className="eyebrow" style={{ color: "hsl(var(--violet))" }}>Good to know</p>
          <h2 className="display mt-3 text-[clamp(2rem,4.2vw,3rem)] text-foreground">Frequently asked questions</h2>
          <span className="block mx-auto mt-4 h-[3px] w-14 rounded-full" style={{ background: "var(--grad-brand)" }} aria-hidden="true" />
        </Reveal>
        <ul className="mt-10 space-y-3">
          {FAQS.map((f, i) => {
            const on = open === i;
            return (
              <Reveal as="li" key={f.q} delay={i * 60} className="list-none">
                <div className={`relative rounded-[16px] border bg-card transition-all duration-300 ${on ? "border-accent/60 shadow-[0_14px_30px_-22px_hsl(var(--foreground)/0.5)]" : "border-border hover:border-accent/40"}`}>
                  <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full" style={{ background: "var(--grad-brand)" }} aria-hidden="true" />
                  <h3>
                    <button type="button" onClick={() => setOpen(on ? -1 : i)} aria-expanded={on} aria-controls={`faq-${i}`} className="w-full flex items-center justify-between gap-6 pl-6 pr-5 py-4 text-left">
                      <span className="font-semibold text-foreground">{f.q}</span>
                      <ChevronDown className={`w-5 h-5 shrink-0 text-gold transition-transform duration-300 ${on ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </h3>
                  <div id={`faq-${i}`} role="region" className={`grid transition-[grid-template-rows] duration-300 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden" {...inertWhen(!on)}>
                      <p className={`pl-6 pr-12 pb-5 text-muted-foreground leading-relaxed transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`}>{f.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
