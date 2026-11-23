import React from "react";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/home/Reveal";

export default function ServicesBand() {
  return (
    <section id="services" className="mt-16 sm:mt-24 bg-[hsl(var(--site-dark))] text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <Reveal className="max-w-3xl">
          <span className="block h-[3px] w-10 rounded-full mb-5" style={{ background: "var(--grad-brand)" }} aria-hidden="true" />
          <p className="eyebrow text-accent">Who we are</p>
          <h2 className="display sora mt-4 text-[clamp(2.1rem,4.6vw,3.6rem)] text-white">
            A smoother way through <span className="text-accent">Accra International Airport</span>
          </h2>
          <p className="mt-5 text-[1.08rem] leading-relaxed text-white/80">
            Airport Assist Ghana provides personalised airport concierge and passenger assistance services at Accra International Airport in Accra, Ghana. Our mission is to make
            airport journeys smoother, more comfortable and less stressful through professional guidance, practical support and attentive service. Available 24 hours a day,
            seven days a week, our team assists passengers throughout key stages of their arrival and departure, helping them navigate airport procedures with greater confidence
            and peace of mind. From personalised meet and greet and baggage assistance to priority check-in, eligible fast-track escort services and premium lounge access where
            included, we help make every journey more convenient.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <img src="/images/escort-family.webp" alt="An Airport Assist Ghana agent in a navy suit walks a smiling family through the departures hall at Accra airport"
            width="1024" height="1024" loading="lazy" className="w-full max-w-md lg:max-w-none mx-auto aspect-square lg:aspect-[4/3] object-cover object-[50%_35%] rounded-[20px] border border-white/15 shadow-xl" />
        </Reveal>
        </div>

        <Reveal className="mt-12 text-center">
          <a href="#how-it-works" className="press inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-[hsl(var(--site-dark))]" style={{ background: "var(--grad-gold)" }}>
            See how it works, start to finish <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
