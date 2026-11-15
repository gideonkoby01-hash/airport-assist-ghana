import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";

export default function Hero() {
  const { bookDest } = useHomeCta();
  return (
    <section id="home" className="mx-auto max-w-6xl px-5 sm:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
      <div className="lg:col-span-6 order-2 lg:order-1">
        <h1 className="display text-[clamp(2.9rem,7.2vw,5.2rem)] text-foreground">
          Accra airport, with someone who knows the way.
        </h1>
        <p className="mt-6 text-[1.125rem] leading-relaxed text-muted-foreground max-w-[34rem]">
          Airport Assist Ghana meets you at the airbridge or the departures kerb, takes you through immigration and security,
          looks after your bags, and walks you to your car or your gate. Every hour of every day.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
          <Link to={bookDest} className="px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold text-[1.02rem] hover:opacity-90">
            Book assistance
          </Link>
          <a href="#prices" className="text-foreground font-medium underline underline-offset-[6px] decoration-gold decoration-2 hover:decoration-foreground">
            See the prices
          </a>
        </div>
        <dl className="mt-12 grid grid-cols-3 border-t border-border">
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
        <img
          src="/images/lounge.webp"
          alt="An Airport Assist escort walking a family through the departures hall"
          width="1024"
          height="1024"
          fetchPriority="high"
          className="w-full h-auto aspect-[5/4] lg:aspect-square object-cover object-[50%_45%]"
        />
        <figcaption className="mt-3 text-sm text-muted-foreground">Your escort stays with you from the airbridge to the car.</figcaption>
      </figure>
    </section>
  );
}
