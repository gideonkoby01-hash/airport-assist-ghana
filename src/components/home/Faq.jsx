import React from "react";

const FAQS = [
  { q: "Are services available around the clock?", a: "Yes. Airport Assist Ghana operates 24 hours a day, 7 days a week, so we can meet flights arriving or departing at any time." },
  { q: "Do you issue or guarantee visas or entry?", a: "No. We do not issue or guarantee visas or entry. Visa-on-arrival assistance is provided where applicable, but all visa and entry decisions rest with the relevant authorities." },
  { q: "Is lounge access included in every package?", a: "No. Full Arrival and Full Departure include lounge access; Departure Priority Only and Porter Service Only do not." },
  { q: "Do you offer luggage delivery?", a: "Not yet. We are working on adding luggage delivery to our services. In the meantime we handle baggage inside the terminal as part of eligible packages." },
  { q: "How do I book a service?", a: "Choose Book assistance, pick your package, and give us your flight and passenger details. Our team then prepares your assistance." },
];

export default function Faq() {
  return (
    <section id="faq" className="bg-secondary">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-14">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground lg:col-span-5">Questions we get asked.</h2>
        <div className="lg:col-span-7 border-t-2 border-foreground">
          {FAQS.map((f, i) => (
            <details key={f.q} open={i === 0} className="group border-b border-border">
              <summary className="flex items-start justify-between gap-6 py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="text-lg font-semibold text-foreground">{f.q}</span>
                <span aria-hidden="true" className="display text-2xl text-gold leading-none mt-0.5 group-open:hidden">+</span>
                <span aria-hidden="true" className="display text-2xl text-gold leading-none mt-0.5 hidden group-open:inline">&minus;</span>
              </summary>
              <p className="pb-6 pr-10 text-muted-foreground leading-relaxed max-w-[38rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
