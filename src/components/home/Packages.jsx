import React from "react";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useHomeCta } from "@/components/home/useHomeCta";

// Fixed public pricing per passenger. The booking flow reads live
// ServicePackage records; prices shown here are the advertised rates and
// match the canonical PACKAGE_DEFINITIONS in src/lib/packages.js.
const PACKAGES = [
  {
    code: "full_arrival",
    name: "Full Arrival Service",
    price: 700,
    description:
      "Meet & greet at the airbridge with fast-track immigration, baggage assistance and ground transfer coordination.",
    inclusions: [
      "Meet & greet at the airbridge",
      "Fast-track immigration",
      "Baggage assistance",
      "Ground transfer coordination",
    ],
    image:
      "https://images.unsplash.com/photo-1561131668-f63504fc549d?auto=format&fit=crop&w=900&q=80",
    excludesLounge: false,
  },
  {
    code: "full_departure",
    name: "Full Departure Service",
    price: 850,
    description:
      "Curbside meet & greet, check-in assistance, fast-track security and premium lounge access for a smooth departure.",
    inclusions: [
      "Curbside meet & greet",
      "Check-in assistance",
      "Fast-track security & immigration",
      "Premium lounge access",
    ],
    image:
      "https://images.unsplash.com/photo-1783768813434-21bca14a41db?auto=format&fit=crop&w=900&q=80",
    excludesLounge: false,
  },
  {
    code: "departure_priority",
    name: "Departure Priority Only",
    price: 500,
    description:
      "Priority fast-track security and immigration escort to get you to your gate quickly. Lounge access is not included.",
    inclusions: [
      "Check-in assistance",
      "Fast-track security & immigration",
    ],
    image:
      "https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=900&q=80",
    excludesLounge: true,
  },
  {
    code: "porter_only",
    name: "Porter Service Only",
    price: 100,
    description:
      "A dedicated porter handles your luggage across the terminal and escorts you to and from checkpoints.",
    inclusions: [
      "Luggage handling across the terminal",
      "Porter escort to checkpoints",
    ],
    image:
      "https://images.unsplash.com/photo-1767710096520-9246565a9d31?auto=format&fit=crop&w=900&q=80",
    excludesLounge: true,
  },
];

export default function Packages() {
  const { bookDest } = useHomeCta();

  return (
    <section id="services" className="py-20 lg:py-28 bg-[#f7f9fc]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-[#8a6a00] font-semibold uppercase tracking-[0.2em] text-sm">
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
          {PACKAGES.map((p) => (
            <div
              key={p.code}
              className="relative flex flex-col rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 min-h-[460px] group"
            >
              <div className="absolute inset-0">
                <Image
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  fittingType="fill"
                  focalPointY={0.4}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b213c] via-[#0b213c]/80 to-[#0b213c]/30" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0b213c]/70 to-transparent" />
              </div>

              <div className="relative flex flex-col flex-1 p-6 justify-end">
                <div className="w-10 h-1 bg-[#d4af37] rounded-full mb-3" />
                <h3 className="font-semibold text-white text-lg leading-tight">
                  {p.name}
                </h3>
                <p className="mt-2 text-sm text-white/80 leading-snug">
                  {p.description}
                </p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#d4af37]">
                    GHS {p.price}
                  </span>
                  <span className="text-sm text-white/70">/ passenger</span>
                </div>

                <ul className="mt-4 space-y-1.5">
                  {p.inclusions.map((inc) => (
                    <li
                      key={inc}
                      className="flex items-start gap-2 text-sm text-white/90"
                    >
                      <Check className="w-4 h-4 text-[#d4af37] mt-0.5 shrink-0" />
                      <span>{inc}</span>
                    </li>
                  ))}
                  {p.excludesLounge && (
                    <li className="flex items-start gap-2 text-sm text-white/60">
                      <X className="w-4 h-4 text-[#e0857a] mt-0.5 shrink-0" />
                      <span>Lounge access not included</span>
                    </li>
                  )}
                </ul>

                <Link
                  to={bookDest}
                  className="mt-5 w-full text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0b213c] text-sm font-semibold hover:bg-[#c39a2e] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  Book Now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-[#5a697c]">
          Lounge access depends on the selected package. Departure Priority Only
          excludes lounge access.
        </p>
      </div>
    </section>
  );
}