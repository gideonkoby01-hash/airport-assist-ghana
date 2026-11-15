import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";

// Fixed public pricing per passenger. The booking flow reads live ServicePackage records; prices shown here are the
// advertised rates and match the canonical PACKAGE_DEFINITIONS in src/lib/packages.js.
const PACKAGES = [
  {
    code: "full_arrival",
    name: "Full Arrival Service",
    price: 700,
    description: "Met at the airbridge and taken through the airport to your transfer.",
    inclusions: ["Meet and greet at the airbridge", "Fast-track immigration", "Baggage assistance", "Ground transfer coordination"],
    lounge: true,
  },
  {
    code: "full_departure",
    name: "Full Departure Service",
    price: 850,
    description: "Met at the kerb, checked in, taken through security and into the lounge.",
    inclusions: ["Curbside meet and greet", "Check-in assistance", "Fast-track security and immigration", "Premium lounge access"],
    lounge: true,
  },
  {
    code: "departure_priority",
    name: "Departure Priority Only",
    price: 500,
    description: "The quick route to your gate, without the lounge.",
    inclusions: ["Check-in assistance", "Fast-track security and immigration"],
    lounge: false,
  },
  {
    code: "porter_only",
    name: "Porter Service Only",
    price: 100,
    description: "A porter for your luggage, and an escort to the checkpoints.",
    inclusions: ["Luggage handling across the terminal", "Porter escort to checkpoints"],
    lounge: false,
  },
];

export default function Packages() {
  const { bookDest } = useHomeCta();
  return (
    <section id="prices" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
      <div className="grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground lg:col-span-6">Fixed prices, per passenger.</h2>
        <p className="lg:col-span-6 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[34rem]">
          What you see is what you pay. There are no extras added at the desk, and you can book any of these online.
        </p>
      </div>

      <ul className="mt-10 border-t-2 border-foreground">
        {PACKAGES.map((p) => (
          <li key={p.code} className="grid md:grid-cols-12 gap-x-8 gap-y-3 py-7 border-b border-border">
            <div className="md:col-span-5">
              <h3 className="display text-[1.7rem] text-foreground">{p.name}</h3>
              <p className="mt-2 text-muted-foreground leading-snug">{p.description}</p>
            </div>
            <div className="md:col-span-4">
              <ul className="text-[0.95rem] text-foreground space-y-1">
                {p.inclusions.map((i) => <li key={i}>{i}</li>)}
                {!p.lounge && <li className="text-muted-foreground">Lounge access is not included</li>}
              </ul>
            </div>
            <div className="md:col-span-3 flex md:flex-col items-baseline md:items-end justify-between md:justify-start gap-2">
              <p className="tabular display text-[2.4rem] text-foreground">
                <span className="text-base font-semibold text-muted-foreground mr-1.5 align-middle" style={{ fontStretch: "100%" }}>GHS</span>
                {p.price}
              </p>
              <Link to={bookDest} className="text-foreground font-semibold underline underline-offset-[6px] decoration-gold decoration-2 hover:decoration-foreground">
                Book this
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-muted-foreground">
        Lounge access depends on the package. Full Arrival and Full Departure include it; Departure Priority Only and Porter Service Only do not.
      </p>
    </section>
  );
}
