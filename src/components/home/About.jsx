import React from "react";
import { Clock, Footprints, Gauge, HeartHandshake, SlidersHorizontal } from "lucide-react";
import Reveal from "@/components/home/Reveal";

const FACTS = [
  { icon: Clock, title: "Open all hours", text: "Our team is on hand 24 hours a day, seven days a week, so we can meet any flight." },
  { icon: HeartHandshake, title: "Courteous and discreet", text: "Attentive staff who handle your journey with care and keep your business to themselves." },
  { icon: Footprints, title: "Both directions", text: "Help on the way in and on the way out, from the airbridge to the car and from the kerb to the gate." },
  { icon: Gauge, title: "The quick route", text: "Fast-track escort through immigration and security where your package includes it." },
  { icon: SlidersHorizontal, title: "Pick what you need", text: "From a porter on his own to a full service with lounge access. Choose the level that suits the trip and the budget." },
];

export default function About() {
  return (
    <section id="about" className="bg-secondary">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="text-center max-w-3xl mx-auto">
          <p className="flex items-center justify-center gap-4 eyebrow text-gold"><span className="h-px w-10 bg-accent/60" aria-hidden="true" /> About Airport Assist Ghana <span className="h-px w-10 bg-accent/60" aria-hidden="true" /></p>
          <h2 className="serif mt-4 text-[clamp(2rem,4.4vw,3.2rem)] text-foreground">
            A smoother way through <span className="serif-i text-gold">the airport.</span>
          </h2>
        </Reveal>

        {/* An editorial card in the serif voice: the mission, with the story beside it. */}
        <Reveal className="mt-12 mx-auto max-w-5xl overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_26px_60px_-36px_hsl(var(--foreground)/0.5)]">
          <div className="flex items-center justify-between gap-3 px-6 sm:px-8 py-4 border-b border-border bg-secondary/60">
            <span className="eyebrow text-muted-foreground">Our story</span>
            <span className="eyebrow text-muted-foreground">Accra International Airport</span>
          </div>
          <div className="grid md:grid-cols-12">
            <div className="md:col-span-7 p-6 sm:p-9">
              <h3 className="serif text-[clamp(1.6rem,3vw,2.3rem)] leading-tight text-foreground">Personalised help at every stage of the journey.</h3>
              <div className="mt-5 space-y-4 text-muted-foreground leading-[1.75] serif-body">
                <p className="serif-first">
                  Airport Assist Ghana provides personalised airport concierge and passenger assistance at Accra International Airport in Accra, Ghana.
                  We help passengers through the key stages of their arrival and departure, so they get through the airport with more confidence and less worry.
                </p>
                <p>That means meeting you on arrival, helping with bags, priority check-in, eligible fast-track escort, and premium lounge access where your package includes it.</p>
              </div>
            </div>
            <div className="md:col-span-5 p-6 sm:p-9 md:border-l border-t md:border-t-0 border-border flex flex-col justify-center">
              <svg viewBox="0 0 24 24" className="w-9 h-9 text-accent" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 6 3 7.9 3 10.2V18h7v-7.8H6.4c0-1.1.9-2 2-2V6H7.2zm9 0C13.9 6 12 7.9 12 10.2V18h7v-7.8h-3.6c0-1.1.9-2 2-2V6h-1.2z" /></svg>
              <blockquote className="serif mt-3 text-[1.35rem] leading-snug text-foreground font-semibold">
                To take the stress out of airport navigation with courteous, personalised and efficient help, so you travel in comfort and with confidence.
              </blockquote>
              <p className="mt-5 pt-4 border-t border-border eyebrow text-muted-foreground">Our mission</p>
            </div>
          </div>
        </Reveal>

        <ul className="mt-12 grid sm:grid-cols-2 lg:grid-cols-6 gap-5">
          {FACTS.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal as="li" key={f.title} delay={(i % 3) * 90} className={`list-none ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}>
                <div className="lift h-full rounded-[18px] border border-border bg-card p-6">
                  <span className="grid place-items-center w-11 h-11 rounded-full text-white" style={{ background: "var(--grad-brand)" }}><Icon className="w-5 h-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 text-lg font-bold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed text-[0.95rem]">{f.text}</p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
