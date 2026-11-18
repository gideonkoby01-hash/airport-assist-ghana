import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import HeroQuote from "@/components/home/HeroQuote";

const HEADLINE = "Accra airport, with someone who knows the way.";

const SLIDES = [
  {
    image: "/images/hero-welcome.webp",
    width: 2400,
    height: 1340,
    alt: "Airport Assist agents welcoming travellers at Accra airport and guiding a family through security",
    position: "50% 24%",
    title: "Welcome · Priority access · Security",
    cta: "View arrival service",
  },
  {
    image: "/images/hero-escort.webp",
    width: 2400,
    height: 1340,
    alt: "An Airport Assist agent pointing a traveller towards the gates, and a family being met at the car",
    position: "50% 22%",
    title: "Directions · Curbside meet · Car hand-over",
    cta: "View departure service",
  },
  {
    image: "/images/lounge.webp",
    width: 1024,
    height: 1024,
    alt: "An Airport Assist escort walking a family through the departures hall",
    fit: "contain",
    title: "Meet at the airbridge · Fast-track · Bags handled",
    cta: "View arrival service",
  },
  {
    image: "/images/porter-hero.webp",
    width: 1024,
    height: 1024,
    alt: "A porter with a luggage trolley, standing with three travellers in the check-in hall",
    fit: "contain",
    title: "Curbside welcome · Check-in · Gate escort",
    cta: "View departure service",
  },
];

// A full-width photo straight under the header, with a journey bar (counter, title, controls, call to action)
// and the quick quote overlapping its bottom edge. The headline stays in the page for screen readers and search.
export default function Hero() {
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
      <h1 className="sr-only">{HEADLINE}</h1>
      <div className="relative h-[clamp(380px,50vw,700px)] overflow-hidden bg-[hsl(var(--site-dark))]">
        {SLIDES.map((s, i) => {
          const on = i === index;
          return (
            <div key={s.image} className={`absolute inset-0 transition-opacity duration-[1200ms] ${on ? "opacity-100" : "opacity-0"}`} aria-hidden={on ? undefined : "true"}>
              {/* The same photo, enlarged and blurred, fills whatever the photo itself does not cover. */}
              <img src={s.image} alt="" aria-hidden="true" width={s.width} height={s.height} loading={i === 0 ? undefined : "lazy"}
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl saturate-125 brightness-90" />
              {/* Photos made for a wide screen fill it on a computer and show whole on a phone; square ones always show whole. */}
              {/* The journey bar overlaps the bottom edge of the hero, so the photo stops above it and nothing in it is hidden. */}
              <div className="absolute inset-x-0 top-0 bottom-14 sm:bottom-24">
                <img
                  src={s.image}
                  alt={on ? s.alt : ""}
                  aria-hidden={on ? undefined : "true"}
                  width={s.width}
                  height={s.height}
                  fetchPriority={i === 0 ? "high" : undefined}
                  loading={i === 0 ? undefined : "lazy"}
                  style={{ objectPosition: s.position || "50% 50%" }}
                  className={`w-full h-full ${s.fit === "contain" ? "object-contain" : "object-contain md:object-cover"} ${on ? "hero-settle" : ""}`}
                />
              </div>
            </div>
          );
        })}
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
