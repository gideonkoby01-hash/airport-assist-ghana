import React from "react";
import SiteHeader from "@/components/home/SiteHeader";
import Hero from "@/components/home/Hero";
import TrustStrip from "@/components/home/TrustStrip";
import ServicesBand from "@/components/home/ServicesBand";
import Packages from "@/components/home/Packages";
import About from "@/components/home/About";
import HowItWorks from "@/components/home/HowItWorks";
import Faq from "@/components/home/Faq";
import Contact from "@/components/home/Contact";
import SiteFooter from "@/components/home/SiteFooter";

// Public company homepage for Airport Assist Ghana.
// Visible without sign-in. All CTAs route into the existing
// authentication and booking flows; internal dashboards stay protected.
export default function Home() {
  return (
    <div className="site min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <TrustStrip />
        <ServicesBand />
        <Packages />
        <HowItWorks />
        <About />
        <Faq />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  );
}