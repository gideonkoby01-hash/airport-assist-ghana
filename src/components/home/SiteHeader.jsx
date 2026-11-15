import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { useHomeCta } from "@/components/home/useHomeCta";
import { useSettings } from "@/lib/SettingsContext";
import { useActiveSection } from "@/lib/useActiveSection";
import { inertWhen } from "@/components/home/Reveal";

const NAV_LINKS = [
  { label: "Prices", href: "#prices" },
  { label: "How it works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Questions", href: "#faq" },
  { label: "Contact", href: "#contact" },
];
const IDS = NAV_LINKS.map((l) => l.href.slice(1));

export default function SiteHeader() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const active = useActiveSection(IDS);
  const close = () => setOpen(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-50 bg-background/95 backdrop-blur border-b transition-shadow duration-300 ${scrolled ? "border-border shadow-[0_8px_24px_-16px_hsl(var(--foreground)/0.4)]" : "border-border"}`}>
      <div className="tricolor-bar h-[3px]" aria-hidden="true" />
      <div className={`mx-auto max-w-6xl px-5 sm:px-8 flex items-center gap-6 transition-[height] duration-300 ${scrolled ? "h-14" : "h-16"}`}>
        <Link to="/" onClick={close} className="flex items-center gap-2.5 shrink-0">
          <img src="/images/logo-mark.webp" alt="" width="36" height="36" className="h-9 w-9 object-contain" />
          <span className="display text-[1.35rem] text-foreground">{settings.company_name}</span>
        </Link>

        <nav aria-label="Sections" className="hidden lg:flex items-center gap-7 ml-auto">
          {NAV_LINKS.map((l) => {
            const on = active === l.href.slice(1);
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={on ? "true" : undefined}
                className={`link-grow pb-1 text-[0.95rem] transition-colors ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {l.label}
              </a>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" />
          {isAuthenticated && (
            <Link to={signInDest} className="link-grow pb-1 px-1 text-[0.95rem] font-medium text-foreground">
              My account
            </Link>
          )}
          <Link to={bookDest} className="press px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-[0.95rem] font-semibold">
            Book assistance
          </Link>
        </div>

        <div className="lg:hidden ml-auto flex items-center">
          <ThemeToggle className="text-foreground hover:bg-secondary" />
          <button
            type="button"
            className="p-2 text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* The phone menu slides open instead of appearing. */}
      <div id="site-menu" className={`lg:hidden grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr] border-t border-border" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden bg-background" {...inertWhen(!open)}>
          <div className="px-5 py-4">
            <ul className="divide-y divide-border">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={close} className="block py-3 text-lg text-foreground">{l.label}</a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <Link to={bookDest} onClick={close} className="press flex-1 text-center py-3 rounded-md bg-primary text-primary-foreground font-semibold">Book assistance</Link>
              {isAuthenticated && (
                <Link to={signInDest} onClick={close} className="press flex-1 text-center py-3 rounded-md border border-border text-foreground font-medium">
                  My account
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
