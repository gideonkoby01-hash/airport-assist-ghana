import React from "react";

const FACTS = [
  ["Open all hours", "Our team is on hand 24 hours a day, seven days a week, so we can meet any flight."],
  ["Courteous and discreet", "Attentive staff who handle your journey with care and keep your business to themselves."],
  ["Both directions", "Help on the way in and on the way out, from the airbridge to the car and from the kerb to the gate."],
  ["The quick route", "Fast-track escort through immigration and security where your package includes it."],
  ["Pick what you need", "From a porter on his own to a full service with lounge access. Choose the level that suits the trip and the budget."],
];

export default function About() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
        <figure className="lg:col-span-5">
          <img
            src="/images/porter-hero.webp"
            alt="A porter with a luggage trolley, standing with three travellers in the check-in hall"
            width="1024"
            height="1024"
            loading="lazy"
            className="w-full h-auto aspect-[4/5] object-cover object-[50%_40%]"
          />
          <figcaption className="mt-3 text-sm text-muted-foreground">Porters take the bags; escorts take you through the terminal.</figcaption>
        </figure>

        <div className="lg:col-span-7">
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

          <dl className="mt-10 border-t border-border">
            {FACTS.map(([t, d]) => (
              <div key={t} className="grid sm:grid-cols-[13rem_1fr] gap-x-6 gap-y-1 py-4 border-b border-border">
                <dt className="font-semibold text-foreground">{t}</dt>
                <dd className="text-muted-foreground leading-relaxed">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <blockquote className="mt-16 lg:mt-24 border-l-4 border-accent pl-6 sm:pl-10 max-w-4xl">
        <p className="display text-[clamp(1.7rem,3.6vw,2.7rem)] text-foreground" style={{ lineHeight: 1.12 }}>
          To take the stress out of airport navigation with courteous, personalised and efficient help, so you travel in comfort and with confidence.
        </p>
        <footer className="mt-4 text-sm text-muted-foreground">Our mission</footer>
      </blockquote>
    </section>
  );
}
