import React from "react";
import { ArrowUpRight, Check } from "lucide-react";
import Reveal from "@/components/home/Reveal";

// What the escort does, in the three situations people book for. The dark band breaks up the white page.
const SERVICES = [
  {
    title: "Arrival",
    link: "Explore arrival",
    image: "/images/lounge.webp",
    position: "50% 40%",
    text: "Long queues, heavy bags, a family to look after? We meet you at the airbridge and stay with you to the car.",
    points: ["Met at the airbridge with your name", "Fast-track through immigration", "Help with your luggage", "Handed over to your driver or transfer"],
  },
  {
    title: "Departure",
    link: "Explore departure",
    image: "/images/porter-hero.webp",
    position: "40% 30%",
    text: "We meet you at the kerb, take the bags, and get you checked in, through security and on towards your gate.",
    points: ["Curbside welcome", "Check-in assistance", "Fast-track security and immigration", "Lounge access in the full package"],
  },
  {
    title: "Porter",
    link: "Explore porter service",
    image: "/images/porter-hero.webp",
    position: "85% 95%",
    zoom: true,
    text: "Just need the bags handled? A porter takes your luggage across the terminal and walks you to the checkpoints.",
    points: ["Luggage handled across the terminal", "Escort to the checkpoints", "Add it to any trip"],
  },
];

export default function ServicesBand() {
  return (
    <section id="services" className="mt-16 sm:mt-24 bg-[hsl(var(--site-dark))] text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="max-w-3xl">
          <span className="block h-[3px] w-10 rounded-full mb-5" style={{ background: "var(--grad-brand)" }} aria-hidden="true" />
          <p className="eyebrow text-accent">Three services · One dedicated agent</p>
          <h2 className="display sora mt-4 text-[clamp(2.1rem,4.6vw,3.6rem)] text-white">
            One personal escort. <span className="text-accent">Every airport moment covered.</span>
          </h2>
          <p className="mt-5 text-[1.08rem] leading-relaxed text-white/80">
            Whether you are landing, flying out or just need a hand with the bags, a member of our team personally meets you and walks you through check-in, priority lanes,
            immigration, luggage and boarding. No apps. No guesswork. No hunting for signs. You are simply walked through.
          </p>
        </Reveal>

        <ul className="mt-12 grid md:grid-cols-3 gap-6">
          {SERVICES.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 110} className="list-none">
              <article className="lift group relative h-full min-h-[27rem] flex flex-col overflow-hidden rounded-[20px] border border-white/15 bg-[hsl(var(--site-dark-soft))]">
                <img src={s.image} alt="" loading="lazy" width="1024" height="1024" style={{ objectPosition: s.position }} aria-hidden="true"
                  className={`absolute inset-0 w-full h-full object-cover opacity-30 blur-[3px] transition-transform duration-[1000ms] ease-out ${s.zoom ? "scale-[1.7] origin-[85%_95%]" : "scale-110"} group-hover:scale-[1.18]`} />
                <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--site-dark)/0.45)] to-[hsl(var(--site-dark)/0.92)]" aria-hidden="true" />
                <div className="relative p-6 sm:p-7 flex-1 flex flex-col">
                  <h3 className="sora text-[1.8rem] font-semibold text-white">{s.title}</h3>
                  <p className="mt-3 text-white/80 leading-snug">{s.text}</p>
                  <ul className="mt-5 mb-6 space-y-2.5 text-[0.93rem] text-white/90">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5"><Check className="w-4 h-4 mt-1 shrink-0 text-accent" aria-hidden="true" /><span>{p}</span></li>
                    ))}
                  </ul>
                  <a href="#prices" className="mt-auto pt-5 border-t border-white/15 flex items-center justify-between text-white font-medium">
                    {s.link}
                    <span className="grid place-items-center w-9 h-9 rounded-full text-[#15121c] transition-transform duration-300 group-hover:rotate-12" style={{ background: "var(--grad-gold)" }}>
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </a>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-12 text-center">
          <a href="#how-it-works" className="press inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-[#15121c]" style={{ background: "var(--grad-gold)" }}>
            See how it works, start to finish <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
