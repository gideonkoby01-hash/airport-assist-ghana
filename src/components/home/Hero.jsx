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
    image: "/images/lounge-wide.webp",
    width: 2048,
    height: 1024,
    alt: "An Airport Assist escort walking a family through the departures hall",
    position: "50% 18%",
    title: "Meet at the airbridge · Fast-track · Bags handled",
    cta: "View arrival service",
  },
  {
    image: "/images/porter-hero-wide.webp",
    width: 2048,
    height: 1024,
    alt: "A porter with a luggage trolley, standing with three travellers in the check-in hall",
    position: "50% 18%",
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
        {SLIDES.map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt={i === index ? s.alt : ""}
            aria-hidden={i === index ? undefined : "true"}
            width={s.width}
            height={s.height}
            fetchPriority={i === 0 ? "high" : undefined}
            loading={i === 0 ? undefined : "lazy"}
            style={{ objectPosition: s.position }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1200ms] ${i === index ? "opacity-100 hero-settle" : "opacity-0"}`}
          />
        ))}
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
