import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import HeroQuote from "@/components/home/HeroQuote";

const HEADLINE = "Accra airport, with someone who knows the way.";

const SLIDES = [
  {
    image: "/images/hero-welcome.webp",
    phone: "/images/hero-welcome-m.webp",
    width: 2400,
    height: 1340,
    alt: "Airport Assist agents welcoming travellers at Accra airport and guiding a family through security",
    position: "50% 24%",
    title: "Welcome · Priority access · Security",
    cta: "View arrival service",
  },
  {
    image: "/images/slide-reclaim.webp",
    phone: "/images/slide-reclaim-m.webp",
    width: 1376,
    height: 768,
    alt: "An Airport Assist porter loading a family's bags onto a trolley at the priority reclaim belt while an agent greets them",
    position: "50% 30%",
    title: "Priority reclaim · Luggage assistance · Met on arrival",
    cta: "View arrival service",
  },
  {
    image: "/images/hero-escort.webp",
    phone: "/images/hero-escort-m.webp",
    width: 2400,
    height: 1340,
    alt: "An Airport Assist agent pointing a traveller towards the gates, and a family being met at the car",
    position: "50% 22%",
    title: "Directions · Curbside meet · Car hand-over",
    cta: "View departure service",
  },
  {
    image: "/images/slide-escort-path.webp",
    phone: "/images/slide-escort-path-m.webp",
    width: 1376,
    height: 768,
    alt: "An Airport Assist agent leading a family along the VIP escort path past a long queue at the gate",
    position: "50% 55%",
    title: "VIP escort path · Fast-track screening · Priority service",
    cta: "View departure service",
  },
  {
    image: "/images/slide-lounge.webp",
    phone: "/images/slide-lounge-m.webp",
    width: 2112,
    height: 1152,
    alt: "An Airport Assist agent welcoming a family at the entrance to the executive lounge",
    position: "50% 0%",
    title: "Lounge welcome · Private greeting · Relax before your flight",
    cta: "View departure service",
  },
  {
    image: "/images/slide-checkin.webp",
    phone: "/images/slide-checkin-m.webp",
    width: 2112,
    height: 1152,
    alt: "An Airport Assist agent helping a traveller at the priority check-in desk",
    position: "50% 8%",
    title: "Priority check-in · Fast-track · Straight to the gate",
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
      <div className="relative h-[calc(100vw+3.5rem)] sm:h-[clamp(380px,50vw,700px)] overflow-hidden bg-[hsl(var(--site-dark))]">
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
                <picture>
                  {/* On a phone, wide photos use a square crop made around the people, so the picture fills the screen. */}
                  {s.phone && <source media="(max-width: 639px)" srcSet={s.phone} />}
                  <img
                    src={s.image}
                    alt={on ? s.alt : ""}
                    aria-hidden={on ? undefined : "true"}
                    width={s.width}
                    height={s.height}
                    fetchPriority={i === 0 ? "high" : undefined}
                    loading={i === 0 ? undefined : "lazy"}
                    style={{ objectPosition: s.position || "50% 50%" }}
                    className={`w-full h-full object-cover ${s.fit === "contain" ? "sm:object-contain" : "sm:object-contain md:object-cover"} ${on ? "hero-settle" : ""}`}
                  />
                </picture>
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
