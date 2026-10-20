import React from "react";
import { Clock, ShieldCheck, Plane, Route, Layers } from "lucide-react";
import { Image } from "@/components/ui/image";

const COMPANY_DESCRIPTION =
  "Airport Assist Ghana provides personalised airport concierge and passenger assistance services at Accra International Airport in Accra, Ghana. Our mission is to make airport journeys smoother, more comfortable and less stressful through professional guidance, practical support and attentive service. Available 24 hours a day, seven days a week, our team assists passengers throughout key stages of their arrival and departure, helping them navigate airport procedures with greater confidence and peace of mind. From personalised meet and greet and baggage assistance to priority check-in, eligible fast-track escort services and premium lounge access where included, we help make every journey more convenient.";

const MISSION =
  "To take the stress out of airport navigation by delivering courteous, personalised and efficient assistance that helps passengers travel with greater comfort, confidence and peace of mind.";

const REASONS = [
  {
    icon: Clock,
    title: "24/7 Availability",
    text: "Our team is on hand around the clock, seven days a week, to meet every flight.",
  },
  {
    icon: ShieldCheck,
    title: "Professional & Discreet",
    text: "Courteous, attentive staff who handle your journey with care and discretion.",
  },
  {
    icon: Plane,
    title: "Arrival & Departure",
    text: "Support through key stages of both arrival and departure, end to end.",
  },
  {
    icon: Route,
    title: "Priority-route Assistance",
    text: "Eligible fast-track escort services to help you move through the airport.",
  },
  {
    icon: Layers,
    title: "Flexible Packages",
    text: "Choose the level of service that suits your journey and budget.",
  },
];

export default function About() {
  return (
    <section id="about" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <span className="text-[#d4af37] font-semibold uppercase tracking-[0.2em] text-sm">
              Who We Are
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-[#0b213c]">
              A smoother way through Accra International Airport
            </h2>
            <p className="mt-6 text-[#5a697c] leading-relaxed">
              {COMPANY_DESCRIPTION}
            </p>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-lg">
              <Image
                src="https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=1200&q=80"
                alt="Airport lounge and concierge service"
                className="w-full h-full object-cover"
                fittingType="fill"
                focalPointX={0.5}
                focalPointY={0.5}
              />
            </div>
            <div className="absolute -bottom-5 -left-5 hidden sm:block bg-[#0b213c] text-white rounded-xl px-6 py-4 shadow-xl">
              <p className="text-2xl font-bold text-[#d4af37]">24/7</p>
              <p className="text-xs text-white/80">Always available</p>
            </div>
          </div>
        </div>

        <div className="mt-16 lg:mt-20 bg-[#0b213c] rounded-2xl px-6 py-10 lg:px-12 lg:py-12 text-center">
          <span className="text-[#d4af37] font-semibold uppercase tracking-[0.2em] text-sm">
            Our Mission
          </span>
          <p className="mt-4 text-xl sm:text-2xl text-white font-medium leading-relaxed max-w-3xl mx-auto">
            {MISSION}
          </p>
        </div>

        <div className="mt-16">
          <div className="text-center max-w-2xl mx-auto">
            <h3 className="text-2xl sm:text-3xl font-bold text-[#0b213c]">
              Why choose Airport Assist
            </h3>
            <p className="mt-3 text-[#5a697c]">
              Practical, dependable support designed around the traveller.
            </p>
          </div>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {REASONS.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.title}
                  className="bg-[#f7f9fc] rounded-2xl border border-[#e3e9f2] p-6"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#d4af37]/15 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#d4af37]" />
                  </div>
                  <h4 className="mt-4 font-semibold text-[#0b213c]">{r.title}</h4>
                  <p className="mt-2 text-sm text-[#5a697c] leading-relaxed">
                    {r.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}