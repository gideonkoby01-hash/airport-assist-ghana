import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { delayStyle } from "@/components/home/Reveal";
import HeroQuote from "@/components/home/HeroQuote";

const HEADLINE = "Accra airport, with someone who knows the way.";

const SLIDES = [
  {
    image: "/images/lounge.webp",
    alt: "An Airport Assist escort walking a family through the departures hall",
    position: "50% 4%",
    title: "Meet at the airbridge · Fast-track · Bags handled",
    cta: "View arrival service",
  },
  {
    image: "/images/porter-hero.webp",
    alt: "A porter with a luggage trolley, standing with three travellers in the check-in hall",
    position: "50% 4%",
    title: "Curbside welcome · Check-in · Gate escort",
    cta: "View departure service",
  },
];

// A full-width photo with the headline across the ceiling and the quick quote overlapping its bottom edge.
export default function Hero() {
  const words = HEADLINE.split(" ");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const go = (n) => setIndex((n + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (!playing || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 6500);
    return () => clearInterval(t);
  }, [playing]);

  const slide = SLIDES[index];
  return (
    <section id="home" aria-roledescription="carousel" aria-label="Airport Assist at Accra airport">
      {/* The photo sits in a rounded frame with a little air around it, graded a touch cooler to sit with the navy palette. */}
      <div className="mx-auto max-w-[96rem] px-3 sm:px-6 pt-3 sm:pt-4">
      <div className="relative h-[clamp(430px,64vh,640px)] overflow-hidden rounded-[22px] sm:rounded-[30px] bg-[hsl(var(--site-dark))] ring-1 ring-black/5">
        {SLIDES.map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt={i === index ? s.alt : ""}
            aria-hidden={i === index ? undefined : "true"}
            width="1024"
            height="1024"
            fetchPriority={i === 0 ? "high" : undefined}
            style={{ objectPosition: s.position }}
            className={`absolute inset-0 w-full h-full object-cover [filter:saturate(0.92)_contrast(1.05)_hue-rotate(-4deg)] transition-opacity duration-[1200ms] ${i === index ? "opacity-100 hero-settle" : "opacity-0"}`}
          />
        ))}
        {/* A soft shade across the ceiling so the headline reads on any photo. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--site-dark)/0.72)_0%,hsl(var(--site-dark)/0.3)_42%,transparent_70%)]" aria-hidden="true" />
        <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/15" aria-hidden="true" />
        <p className="absolute bottom-28 sm:bottom-32 right-5 sm:right-8 hidden sm:flex items-center gap-2 rounded-full bg-black/35 backdrop-blur px-3.5 py-1.5 text-[0.78rem] font-medium text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" /> Accra International Airport
        </p>

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-12">
          <h1 className="display sora text-[clamp(2.1rem,5.2vw,4.3rem)] text-white max-w-[15ch] sm:max-w-[18ch]" aria-label={HEADLINE}>
            {words.map((w, i) => (
              <span key={i} aria-hidden="true" className="hero-rise inline-block mr-[0.22em]" style={delayStyle(150 + i * 70)}>
                {w}
              </span>
            ))}
          </h1>
        </div>
      </div>
      </div>

      <HeroQuote
        slide={slide}
        index={index}
        total={SLIDES.length}
        controls={
          <div className="flex items-center gap-1.5 text-foreground">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous photo" className="press w-8 h-8 grid place-items-center rounded-full hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
            <div className="flex items-center gap-1.5 px-1" role="tablist" aria-label="Choose photo">
              {SLIDES.map((_, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Photo ${i + 1}`} onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-accent" : "w-2 bg-border"}`} />
              ))}
            </div>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next photo" className="press w-8 h-8 grid place-items-center rounded-full hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"} className="press w-8 h-8 grid place-items-center rounded-full hover:bg-secondary">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        }
      />
    </section>
  );
}
