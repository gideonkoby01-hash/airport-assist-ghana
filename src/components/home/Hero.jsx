import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";
import { delayStyle } from "@/components/home/Reveal";

const HEADLINE = "Accra airport, with someone who knows the way.";

export default function Hero() {
  const { bookDest } = useHomeCta();
  const words = HEADLINE.split(" ");
  return (
    <section id="home" className="mx-auto max-w-6xl px-5 sm:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
      <div className="lg:col-span-6 order-2 lg:order-1">
        {/* The one moment of choreography on the page: the headline arrives a word at a time, then the rest follows. */}
        <h1 className="display text-[clamp(2.9rem,7.2vw,5.2rem)] text-foreground" aria-label={HEADLINE}>
          {words.map((w, i) => (
            <span key={i} aria-hidden="true" className="hero-rise inline-block mr-[0.24em]" style={delayStyle(120 + i * 70)}>
              {w}
            </span>
          ))}
        </h1>
        <p className="hero-rise mt-6 text-[1.125rem] leading-relaxed text-muted-foreground max-w-[34rem]" style={delayStyle(800)}>
          Airport Assist Ghana meets you at the airbridge or the departures kerb, takes you through immigration and security,
          looks after your bags, and walks you to your car or your gate. Every hour of every day.
        </p>
        <div className="hero-rise mt-8 flex flex-wrap items-center gap-x-7 gap-y-4" style={delayStyle(950)}>
          <Link to={bookDest} className="press px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold text-[1.02rem]">
            Book assistance
          </Link>
          <a href="#prices" className="link-grow pb-1 text-foreground font-medium">
            See the prices
          </a>
        </div>
        <dl className="hero-rise mt-12 grid grid-cols-3 border-t border-border" style={delayStyle(1100)}>
          {[
            ["24 hours", "Seven days a week"],
            ["Fixed prices", "Per passenger"],
            ["Arrivals and departures", "Or a porter on its own"],
          ].map(([t, d], i) => (
            <div key={t} className={`pt-4 pr-4 ${i ? "pl-4 border-l border-border" : ""}`}>
              <dt className="font-semibold text-foreground text-[0.95rem] leading-snug">{t}</dt>
              <dd className="text-[0.85rem] text-muted-foreground mt-0.5 leading-snug">{d}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="lg:col-span-6 order-1 lg:order-2">
        <div className="hero-unveil overflow-hidden rounded-[14px]">
          <img
            src="/images/lounge.webp"
            alt="An Airport Assist escort walking a family through the departures hall"
            width="1024"
            height="1024"
            fetchPriority="high"
            className="hero-settle w-full h-auto aspect-[5/4] lg:aspect-square object-cover object-[50%_45%]"
          />
        </div>
        <figcaption className="hero-rise mt-3 text-sm text-muted-foreground" style={delayStyle(1000)}>
          Your escort stays with you from the airbridge to the car.
        </figcaption>
      </figure>
    </section>
  );
}
