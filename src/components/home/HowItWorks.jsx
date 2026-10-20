import React from "react";
import { Link } from "react-router-dom";
import { MousePointerClick, CalendarCheck, Plane, HandHeart } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Choose your package",
    text: "Select the arrival, departure, priority or porter service that fits your journey.",
  },
  {
    icon: CalendarCheck,
    title: "Share your flight details",
    text: "Add your flight number, date and passenger information so we can prepare.",
  },
  {
    icon: Plane,
    title: "Meet your assistant",
    text: "Our team meets you at the airport and guides you through every stage.",
  },
  {
    icon: HandHeart,
    title: "Travel with ease",
    text: "Relax as we handle the procedures and help you on your way.",
  },
];

export default function HowItWorks() {
  const { bookDest } = useHomeCta();

  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-[#0b213c]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-[#d4af37] font-semibold uppercase tracking-[0.2em] text-sm">
            How It Works
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">
            Four simple steps to an effortless journey
          </h2>
          <p className="mt-4 text-white/70">
            From booking to boarding, we make the process straightforward.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="relative">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-[#d4af37] flex items-center justify-center">
                      <Icon className="w-6 h-6 text-[#0b213c]" />
                    </div>
                    <span className="text-4xl font-bold text-white/15">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm text-white/70 leading-relaxed">
                    {s.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            to={bookDest}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[#d4af37] text-[#0b213c] font-semibold hover:bg-[#c39a2e] transition-colors"
          >
            Start your booking
          </Link>
        </div>
      </div>
    </section>
  );
}