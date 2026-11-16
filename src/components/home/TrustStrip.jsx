import React from "react";
import { Armchair, CalendarCheck, Clock, Plane, Tag, Wallet } from "lucide-react";
import Reveal from "@/components/home/Reveal";

// Only things that are true of the service today. No ratings, counts or logos we cannot back up.
const ITEMS = [
  { icon: Clock, title: "Open 24/7", text: "Every hour of every day" },
  { icon: Tag, title: "Fixed prices", text: "Per passenger, no extras" },
  { icon: Wallet, title: "Pay at the airport", text: "Nothing taken online" },
  { icon: Plane, title: "Both directions", text: "Arrival and departure" },
  { icon: Armchair, title: "Lounge access", text: "In the full packages" },
  { icon: CalendarCheck, title: "Book in minutes", text: "Online, at any time" },
];

export default function TrustStrip() {
  return (
    <section aria-label="Why people book with us" className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-20">
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-8">
        {ITEMS.map((it, i) => {
          const Icon = it.icon;
          return (
            <Reveal as="li" key={it.title} delay={i * 60} className="list-none text-center">
              <span className="mx-auto grid place-items-center w-12 h-12 rounded-full border border-border bg-card text-gold">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <p className="mt-3 font-semibold text-foreground">{it.title}</p>
              <p className="text-sm text-muted-foreground">{it.text}</p>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
