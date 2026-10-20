import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X, Plane, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHomeCta } from "@/components/home/useHomeCta";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Our Services", href: "#services" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Contact Us", href: "#contact" },
];

export default function SiteHeader() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => setOpen(false);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-[#0b213c]/95 backdrop-blur shadow-md" : "bg-[#0b213c]"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" onClick={close} className="flex items-center gap-2 shrink-0">
            <Plane className="w-7 h-7 text-[#d4af37]" />
            <div className="leading-tight">
              <span className="block text-white font-semibold tracking-wide text-base">
                Airport Assist Ghana
              </span>
              <span className="block text-[#d4af37] text-[10px] uppercase tracking-[0.2em]">
                Akwaaba Services
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-white/85 hover:text-[#d4af37] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <a
              href="tel:+233537755063"
              className="flex items-center gap-1.5 text-sm text-white/80 hover:text-[#d4af37] transition-colors"
            >
              <Phone className="w-4 h-4" /> +233 537 755 063
            </a>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-[#d4af37]">
              <Link to={signInDest}>{isAuthenticated ? "Dashboard" : "Sign In"}</Link>
            </Button>
            <Button asChild className="bg-[#d4af37] hover:bg-[#c39a2e] text-[#0b213c] font-semibold">
              <Link to={bookDest}>Book Now</Link>
            </Button>
          </div>

          <button
            className="lg:hidden text-white p-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden bg-[#0b213c] border-t border-white/10">
          <div className="px-4 py-4 space-y-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={close}
                className="block text-base font-medium text-white/90 hover:text-[#d4af37] py-1"
              >
                {l.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-3">
              <Link
                to={signInDest}
                onClick={close}
                className="block text-center py-2.5 rounded-lg border border-white/25 text-white font-medium"
              >
                {isAuthenticated ? "Dashboard" : "Sign In"}
              </Link>
              <Link
                to={bookDest}
                onClick={close}
                className="block text-center py-2.5 rounded-lg bg-[#d4af37] text-[#0b213c] font-semibold"
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}