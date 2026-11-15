import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Are services available around the clock?",
    a: "Yes. Airport Assist Ghana operates 24 hours a day, 7 days a week, so we can meet flights arriving or departing at any time.",
  },
  {
    q: "Do you issue or guarantee visas or entry?",
    a: "No. We do not issue or guarantee visas or entry. Visa-on-arrival assistance is provided where applicable, but all visa and entry decisions rest with the relevant authorities.",
  },
  {
    q: "Is lounge access included in every package?",
    a: "Lounge access depends on the selected package. Full Arrival and Full Departure include lounge access; Departure Priority Only and Porter Service Only do not.",
  },
  {
    q: "Do you offer luggage delivery?",
    a: "Coming soon. Efforts are underway to introduce luggage delivery as part of our service portfolio. In the meantime, we assist with baggage handling within the terminal as part of eligible packages.",
  },
  {
    q: "How do I book a service?",
    a: "Use the Book Now button to open the booking flow, choose your package, and share your flight and passenger details. Our team then prepares your assistance.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="py-20 lg:py-28 bg-[#f7f9fc]">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-[#8a6a00] font-semibold uppercase tracking-[0.2em] text-sm">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-[#0b213c]">
            Frequently asked questions
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className="bg-white rounded-xl border border-[#e3e9f2] overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                >
                  <span className="font-semibold text-[#0b213c]">{f.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#d4af37] shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-[#5a697c] leading-relaxed">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}