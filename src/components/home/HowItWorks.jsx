import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";

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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-14">
        <div className="lg:col-span-5">
          <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">How a booking works.</h2>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[28rem]">
            Booking takes a few minutes. You create an account, choose a service and give us your flight details. We take it from there.
          </p>
          <Link to={bookDest} className="mt-8 inline-block px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90">
            Start a booking
          </Link>
        </div>
        <ol className="lg:col-span-7 border-t-2 border-foreground">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[3.2rem_1fr] sm:grid-cols-[4.5rem_1fr] gap-x-3 py-6 border-b border-border">
              <span className="tabular display text-[2.4rem] text-gold" aria-hidden="true">{i + 1}</span>
              <div>
                <h3 className="text-xl font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-muted-foreground leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
