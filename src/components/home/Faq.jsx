import React, { useState } from "react";
import { Plus } from "lucide-react";
import Reveal, { inertWhen } from "@/components/home/Reveal";

const FAQS = [
  { q: "Are services available around the clock?", a: "Yes. Airport Assist Ghana operates 24 hours a day, 7 days a week, so we can meet flights arriving or departing at any time." },
  { q: "Do you issue or guarantee visas or entry?", a: "No. We do not issue or guarantee visas or entry. Visa-on-arrival assistance is provided where applicable, but all visa and entry decisions rest with the relevant authorities." },
  { q: "Is lounge access included in every package?", a: "No. Full Arrival and Full Departure include lounge access; Departure Priority Only and Porter Service Only do not." },
  { q: "Do you offer luggage delivery?", a: "Not yet. We are working on adding luggage delivery to our services. In the meantime we handle baggage inside the terminal as part of eligible packages." },
  { q: "How do I book a service?", a: "Choose Book assistance, pick your package, and give us your flight and passenger details. Our team then prepares your assistance." },
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="bg-secondary">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-14">
        <Reveal className="lg:col-span-5">
          <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">Questions we get asked.</h2>
        </Reveal>
        <ul className="lg:col-span-7 space-y-3">
          {FAQS.map((f, i) => {
            const on = open === i;
            return (
              <Reveal as="li" key={f.q} delay={i * 70} className="list-none">
                <div className={`rounded-[14px] border bg-card transition-colors duration-300 ${on ? "border-gold/50" : "border-border hover:border-gold/40"}`}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(on ? -1 : i)}
                      aria-expanded={on}
                      aria-controls={`faq-${i}`}
                      className="w-full flex items-center justify-between gap-6 px-5 py-4 text-left"
                    >
                      <span className="text-lg font-semibold text-foreground">{f.q}</span>
                      <Plus className={`w-5 h-5 shrink-0 text-gold transition-transform duration-300 ${on ? "rotate-45" : ""}`} aria-hidden="true" />
                    </button>
                  </h3>
                  {/* The answer opens by animating its row height from 0 to its natural size. */}
                  <div id={`faq-${i}`} role="region" className={`grid transition-[grid-template-rows] duration-300 ease-out ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden" {...inertWhen(!on)}>
                      <p className={`px-5 pb-5 pr-12 text-muted-foreground leading-relaxed max-w-[38rem] transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`}>{f.a}</p>
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
