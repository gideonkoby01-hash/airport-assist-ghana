import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";
import Reveal from "@/components/home/Reveal";

const STEPS = [
  { title: "Choose a package", text: "Pick the arrival, departure, priority or porter service that fits your trip." },
  { title: "Tell us about the flight", text: "Add the flight number, date, time and the names of everyone travelling, so we can prepare." },
  { title: "Meet your assistant", text: "We are at the airbridge or the departures kerb when you arrive, and we go through the airport with you." },
  { title: "Carry on with your day", text: "We handle the queues and the paperwork. You get to the gate, or to your car." },
];

export default function HowItWorks() {
  const { bookDest } = useHomeCta();
  return (
    <section id="how-it-works" className="bg-secondary">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
          <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground lg:col-span-6">How a booking works.</h2>
          <div className="lg:col-span-6">
            <p className="text-[1.05rem] leading-relaxed text-muted-foreground max-w-[34rem]">
              Booking takes a few minutes. You create an account, choose a service and give us your flight details. We take it from there.
            </p>
          </div>
        </Reveal>

        {/* A route: the line is drawn across as the section arrives, and each stop follows it. */}
        <Reveal as="ol" className="mt-14 relative grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          <span aria-hidden="true" className="draw-line hidden lg:block absolute left-[1.6rem] right-[1.6rem] top-[1.6rem] h-0 border-t-2 border-dashed border-gold/60" />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative list-none" style={{ transitionDelay: `${i * 120}ms` }}>
              <span className="tabular display relative z-10 flex w-[3.2rem] h-[3.2rem] items-center justify-center rounded-full bg-primary text-primary-foreground text-[1.5rem]" aria-hidden="true">
                {i + 1}
              </span>
              <div className="lift mt-5 rounded-[14px] border border-border bg-card p-5 h-[calc(100%-4.2rem)]">
                <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed text-[0.95rem]">{s.text}</p>
              </div>
            </li>
          ))}
        </Reveal>

        <Reveal className="mt-12">
          <Link to={bookDest} className="press inline-block px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold">
            Start a booking
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
