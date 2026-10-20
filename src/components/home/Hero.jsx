import React from "react";
import { Link } from "react-router-dom";
import { Clock, Plane, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useHomeCta } from "@/components/home/useHomeCta";

export default function Hero() {
  const { bookDest } = useHomeCta();

  return (
    <section id="home" className="relative pt-20">
      <div className="relative min-h-[88vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1436491865332-7a61a109cc82?auto=format&fit=crop&w=1920&q=80"
            alt="Airport terminal concourse"
            className="w-full h-full object-cover"
            fittingType="fill"
            focalPointX={0.5}
            focalPointY={0.4}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b213c]/95 via-[#0b213c]/85 to-[#0b213c]/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b213c]/80 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#d4af37] text-xs font-semibold tracking-wide">
              <Clock className="w-3.5 h-3.5" /> Available 24/7
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.05] tracking-tight">
              Your Journey.
              <span className="block text-[#d4af37]">Made Effortless.</span>
            </h1>
            <p className="mt-6 text-lg text-white/85 leading-relaxed max-w-xl">
              Airport Assist Ghana provides personalised airport concierge and
              passenger assistance at Accra International Airport, Accra. Our
              services are available 24 hours a day, 7 days a week.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="bg-[#d4af37] hover:bg-[#c39a2e] text-[#0b213c] font-semibold px-8">
                <Link to={bookDest}>
                  Book Now <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 hover:text-[#d4af37]">
                <a href="#services">Explore Services</a>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-white/80">
              <span className="flex items-center gap-2 text-sm">
                <Plane className="w-4 h-4 text-[#d4af37]" /> Arrival & Departure
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-[#d4af37]" /> Fast-track Escort
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Plane className="w-4 h-4 text-[#d4af37]" /> Lounge Access
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}