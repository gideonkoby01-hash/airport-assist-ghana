import React from "react";
import { Check } from "lucide-react";
import Reveal from "@/components/home/Reveal";

// What the escort does, in the three situations people book for. A dark band breaks up the white page.
const SERVICES = [
  {
    title: "On arrival",
    from: 700,
    image: "/images/lounge.webp",
    position: "50% 40%",
    text: "Long queues, heavy bags, a family to look after? We meet you at the airbridge and stay with you to the car.",
    points: ["Met at the airbridge", "Fast-track through immigration", "Help with your luggage", "Handed over to your driver or transfer"],
  },
  {
    title: "On departure",
    from: 500,
    image: "/images/porter-hero.webp",
    position: "40% 30%",
    text: "We meet you at the kerb, take the bags, and get you checked in, through security and on towards your gate.",
    points: ["Curbside welcome", "Check-in assistance", "Fast-track security and immigration", "Lounge access in the full package"],
  },
  {
    title: "Porter only",
    from: 100,
    image: "/images/porter-hero.webp",
    position: "85% 95%",
    zoom: true,
    text: "Just need the bags handled? A porter takes your luggage across the terminal and walks you to the checkpoints.",
    points: ["Luggage handled across the terminal", "Porter escort to the checkpoints", "Add it to any trip"],
  },
];

export default function ServicesBand() {
  return (
    <section id="services" className="mt-16 sm:mt-24 bg-sidebar text-sidebar-foreground">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="max-w-3xl">
          <h2 className="display text-[clamp(2.2rem,4.8vw,3.6rem)] text-white">One escort for every part of the airport.</h2>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-sidebar-foreground/80">
            Landing, flying out or just needing a hand with the bags, someone from our team walks you through. No guessing, no hunting for signs.
          </p>
        </Reveal>

        <ul className="mt-12 grid md:grid-cols-3 gap-6">
          {SERVICES.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 110} className="list-none">
              <article className="lift group h-full flex flex-col rounded-[18px] border border-white/15 bg-white/[0.04] overflow-hidden hover:bg-white/[0.07]">
                <div className="h-44 overflow-hidden">
                  <img src={s.image} alt="" loading="lazy" width="1024" height="1024" style={{ objectPosition: s.position }}
                    className={`w-full h-full object-cover transition-transform duration-[900ms] ease-out ${s.zoom ? "scale-[1.7] origin-[85%_95%] group-hover:scale-[1.78]" : "group-hover:scale-[1.06]"}`} />
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="display text-[1.9rem] text-white">{s.title}</h3>
                  <p className="mt-2 text-sidebar-foreground/80 leading-snug">{s.text}</p>
                  <ul className="mt-5 mb-6 space-y-2 text-[0.95rem] text-white/90">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5"><Check className="w-4 h-4 mt-1 shrink-0 text-accent" aria-hidden="true" /><span>{p}</span></li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-5 border-t border-white/15 flex items-center justify-between">
                    <p className="text-sidebar-foreground/80 text-sm">From <span className="tabular display text-[1.5rem] text-white align-middle">GHS {s.from}</span></p>
                    <a href="#prices" className="link-grow pb-0.5 text-white font-medium">See prices</a>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
