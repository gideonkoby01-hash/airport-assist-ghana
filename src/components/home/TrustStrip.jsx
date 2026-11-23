import React from "react";
import { Armchair, CalendarCheck, Clock, Plane, Tag, Wallet } from "lucide-react";
import Reveal from "@/components/home/Reveal";
import { useSettings } from "@/lib/SettingsContext";
import { payWording } from "@/lib/payments";

// Only things that are true of the service today. No ratings, counts or logos we cannot back up.
const ITEMS = [
  { icon: Clock, title: "Open 24/7", text: "Every hour of every day" },
  { icon: Tag, title: "Fixed prices", text: "Per passenger, no extras" },
  { icon: Wallet, key: "pay" },
  { icon: Plane, title: "Both directions", text: "Arrival and departure" },
  { icon: Armchair, title: "Lounge access", text: "In the full packages" },
  { icon: CalendarCheck, title: "Book in minutes", text: "Online, at any time" },
];

export default function TrustStrip() {
  const { settings } = useSettings();
  const pay = payWording(settings);
  const items = ITEMS.map((it) => (it.key === "pay" ? { ...it, title: pay.trustTitle, text: pay.trustText } : it));
  return (
    <section aria-label="Why people book with us" className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-20 pb-4">
      <p className="flex items-center justify-center gap-4 eyebrow text-gold">
        <span className="h-px w-10 bg-accent/60" aria-hidden="true" /> Trusted · Straightforward · Open 24/7 <span className="h-px w-10 bg-accent/60" aria-hidden="true" />
      </p>
      <ul className="mt-9 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-9">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <Reveal as="li" key={it.title} delay={i * 60} className="list-none text-center">
              <span className="mx-auto grid place-items-center w-12 h-12 rounded-full border border-border bg-card text-gold shadow-[0_6px_18px_-10px_hsl(var(--foreground)/0.4)]">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-[0.8rem] font-bold uppercase tracking-wide text-foreground">{it.title}</p>
              <p className="text-[0.8rem] text-muted-foreground">{it.text}</p>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
