import React from "react";
import { Link } from "react-router-dom";
import { Check, X, Plane, Briefcase, Clock, Sparkles } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";

// Fixed public pricing per passenger. The booking flow reads live
// ServicePackage records; prices shown here are the advertised rates.
const PACKAGES = [
  {
    code: "full_arrival",
    name: "Full Arrival Service",
    price: 700,
    tagline: "Meet & greet on arrival",
    icon: Plane,
    inclusions: [
      "Personalised meet & greet at the airbridge",
      "Fast-track immigration assistance",
      "Baggage assistance and customs support",
      "Ground transfer coordination",
    ],
    excludesLounge: false,
  },
  {
    code: "full_departure",
    name: "Full Departure Service",
    price: 850,
    tagline: "Door to gate on departure",
    icon: Plane,
    inclusions: [
      "Curbside meet & greet",
      "Check-in assistance",
      "Fast-track security & immigration escort",
      "Premium lounge access",
    ],
    excludesLounge: false,
  },
  {
    code: "departure_priority",
    name: "Departure Priority Only",
    price: 500,
    tagline: "Priority route, no lounge",
    icon: Clock,
    inclusions: [
      "Check-in assistance",
      "Fast-track security & immigration escort",
    ],
    excludesLounge: true,
  },
  {
    code: "porter_only",
    name: "Porter Service Only",
    price: 100,
    tagline: "Luggage handled with care",
    icon: Briefcase,
    inclusions: [
      "Luggage handling across the terminal",
      "Porter escort to and from checkpoints",
    ],
    excludesLounge: true,
  },
];

export default function Packages() {
  const { bookDest } = useHomeCta();

  return (
    <section id="services" className="py-20 lg:py-28 bg-[#f7f9fc]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-[#d4af37] font-semibold uppercase tracking-[0.2em] text-sm">
            Our Services
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-[#0b213c]">
            Fixed-price service packages
          </h2>
          <p className="mt-4 text-[#5a697c]">
            Choose the level of assistance that fits your journey. Prices are per
            passenger and clearly stated, with no hidden charges.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PACKAGES.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.code}
                className="relative flex flex-col bg-white rounded-2xl border border-[#e3e9f2] shadow-sm hover:shadow-lg transition-shadow overflow-hidden"
              >
                <div className="h-1 tricolor-bar" />
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#0b213c]/5 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-[#0b213c]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#0b213c] leading-tight">
                        {p.name}
                      </h3>
                      <p className="text-xs text-[#5a697c]">{p.tagline}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#0b213c]">GHS {p.price}</span>
                    <span className="text-sm text-[#5a697c]">/ passenger</span>
                  </div>

                  <ul className="mt-5 space-y-2.5 flex-1">
                    {p.inclusions.map((inc) => (
                      <li key={inc} className="flex items-start gap-2 text-sm text-[#3a4658]">
                        <Check className="w-4 h-4 text-[#1f8a4c] mt-0.5 shrink-0" />
                        <span>{inc}</span>
                      </li>
                    ))}
                    {p.excludesLounge && (
                      <li className="flex items-start gap-2 text-sm text-[#8a94a6]">
                        <X className="w-4 h-4 text-[#b04a3a] mt-0.5 shrink-0" />
                        <span>Lounge access not included</span>
                      </li>
                    )}
                  </ul>

                  <Link
                    to={bookDest}
                    className="mt-6 w-full text-center py-2.5 rounded-lg bg-[#0b213c] text-white text-sm font-semibold hover:bg-[#16335a] transition-colors"
                  >
                    Book this service
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-[#5a697c] flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-[#d4af37]" />
          Lounge access depends on the selected package. Departure Priority Only
          excludes lounge access.
        </p>
      </div>
    </section>
  );
}