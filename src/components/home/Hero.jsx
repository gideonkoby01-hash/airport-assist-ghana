import React from "react";
import { delayStyle } from "@/components/home/Reveal";
import HeroQuote from "@/components/home/HeroQuote";

const HEADLINE = "Accra airport, with someone who knows the way.";

export default function Hero() {
  const words = HEADLINE.split(" ");
  return (
    <section id="home" className="pt-8 sm:pt-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 grid lg:grid-cols-12 gap-6 lg:gap-14 items-end">
        {/* The one moment of choreography on the page: the headline arrives a word at a time. */}
        <h1 className="display lg:col-span-8 text-[clamp(2.6rem,5.7vw,4.8rem)] text-foreground" aria-label={HEADLINE}>
          {words.map((w, i) => (
            <span key={i} aria-hidden="true" className="hero-rise inline-block mr-[0.24em]" style={delayStyle(120 + i * 70)}>
              {w}
            </span>
          ))}
        </h1>
        <p className="hero-rise lg:col-span-4 text-[1.08rem] leading-relaxed text-muted-foreground" style={delayStyle(700)}>
          We meet you at the airbridge or the departures kerb, take you through immigration and security, look after your bags,
          and walk you to your car or your gate. Every hour of every day.
        </p>
      </div>

      {/* Two real photographs side by side, edge to edge on a phone and rounded on a wide screen. */}
      <div className="mx-auto max-w-7xl sm:px-6 mt-8 sm:mt-10">
        <div className="grid grid-cols-2 gap-1 sm:gap-2 overflow-hidden sm:rounded-[22px] h-[clamp(230px,29vw,420px)]">
          <div className="hero-unveil overflow-hidden">
            <img src="/images/porter-hero.webp" alt="A porter with a luggage trolley, standing with three travellers in the check-in hall" width="1024" height="1024" fetchPriority="high"
              className="hero-settle w-full h-full object-cover object-[50%_35%]" />
          </div>
          <div className="hero-unveil overflow-hidden" style={{ animationDelay: "0.3s" }}>
            <img src="/images/lounge.webp" alt="An Airport Assist escort walking a family through the departures hall" width="1024" height="1024" fetchPriority="high"
              className="hero-settle w-full h-full object-cover object-[50%_40%]" style={{ animationDelay: "0.3s" }} />
          </div>
        </div>
      </div>

      <HeroQuote />
    </section>
  );
}
