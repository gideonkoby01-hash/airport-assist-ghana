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
    <section id="about" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <Reveal as="figure" className="lg:col-span-5">
          <div className="overflow-hidden rounded-[14px]">
            <img
              src="/images/porter-hero.webp"
              alt="A porter with a luggage trolley, standing with three travellers in the check-in hall"
              width="1024"
              height="1024"
              loading="lazy"
              className="w-full h-auto aspect-[4/5] object-cover object-[50%_40%] transition-transform duration-[900ms] ease-out hover:scale-[1.04]"
            />
          </div>
          <figcaption className="mt-3 text-sm text-muted-foreground">Porters take the bags; escorts take you through the terminal.</figcaption>
        </Reveal>

        <Reveal className="lg:col-span-7" delay={100}>
          <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">A smoother way through the airport.</h2>
          <div className="mt-6 space-y-4 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[38rem]">
            <p>
              Airport Assist Ghana provides personalised airport concierge and passenger assistance at Accra International Airport in Accra, Ghana.
              We help passengers through the key stages of their arrival and departure, so they get through the airport with more confidence and less worry.
            </p>
            <p>
              That means meeting you on arrival, helping with bags, priority check-in, eligible fast-track escort, and premium lounge access where your package includes it.
            </p>
          </div>
        </Reveal>
      </div>

      <ul className="mt-14 grid sm:grid-cols-2 lg:grid-cols-6 gap-5">
        {FACTS.map((f, i) => {
          const Icon = f.icon;
          return (
            <Reveal as="li" key={f.title} delay={(i % 3) * 90} className={`list-none ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <div className="lift h-full rounded-[14px] border border-border bg-card p-6">
                <Icon className="w-6 h-6 text-gold" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed text-[0.95rem]">{f.text}</p>
              </div>
            </Reveal>
          );
        })}
      </ul>

      <Reveal as="blockquote" className="mt-16 lg:mt-24 border-l-4 border-accent pl-6 sm:pl-10 max-w-4xl">
        <p className="display text-[clamp(1.7rem,3.6vw,2.7rem)] text-foreground" style={{ lineHeight: 1.12 }}>
          To take the stress out of airport navigation with courteous, personalised and efficient help, so you travel in comfort and with confidence.
        </p>
        <footer className="mt-4 text-sm text-muted-foreground">Our mission</footer>
      </Reveal>
    </section>
  );
}
