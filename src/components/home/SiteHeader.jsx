import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Menu, Phone, UserRound, X } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { useHomeCta } from "@/components/home/useHomeCta";
import { phoneNumbers, useSettings } from "@/lib/SettingsContext";
import { useActiveSection } from "@/lib/useActiveSection";
import { inertWhen, delayStyle } from "@/components/home/Reveal";

const NAV_LINKS = [
  { label: "Services", href: "#services" },
  { label: "Prices", href: "#prices" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Questions", href: "#faq" },
  { label: "Contact", href: "#contact" },
];
const IDS = NAV_LINKS.map((l) => l.href.slice(1));

// A floating bar. The navy highlight glides to the link you point at (or the section you are in), a thin line along
// the bottom fills as you read down the page, the call icon pulses, and the gold button catches the light.
export default function SiteHeader() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const phone = phoneNumbers(settings.contact_phone)[0];
  const callHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "#contact";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const active = useActiveSection(IDS);
  const [hover, setHover] = useState("");
  const close = () => setOpen(false);

  // Scroll state, throttled to one update per frame.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 8);
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The sliding highlight: placed under the hovered link, otherwise under the current section's link.
  const navRef = useRef(null);
  const linkRefs = useRef({});
  const [mark, setMark] = useState({ x: 0, w: 0, show: false });
  const lit = hover || active;
  const place = useCallback(() => {
    const el = lit ? linkRefs.current[lit] : null;
    setMark(el ? { x: el.offsetLeft, w: el.offsetWidth, show: true } : (m) => ({ ...m, show: false }));
  }, [lit]);
  useLayoutEffect(place, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [place]);

  const linkBase = "relative z-10 whitespace-nowrap px-3 xl:px-4 py-2 rounded-full text-[0.9rem] font-medium transition-colors duration-300";

  return (
    <header className="sticky top-0 z-50 pointer-events-none px-2 sm:px-4">
      <div
        className={`header-in pointer-events-auto relative mx-auto max-w-6xl rounded-full border bg-background/80 backdrop-blur-xl transition-all duration-500 ${
          scrolled ? "mt-1.5 border-border shadow-[0_18px_40px_-22px_hsl(var(--foreground)/0.55)]" : "mt-3 border-border/70 shadow-[0_10px_30px_-24px_hsl(var(--foreground)/0.4)]"
        }`}
      >
        <div className={`flex items-center gap-3 pl-4 pr-2 transition-[height] duration-500 ${scrolled ? "h-[3.3rem]" : "h-16"}`}>
          <Link to="/" onClick={close} className="group/logo flex items-center gap-2.5 shrink-0" aria-label={`${settings.company_name}, home`}>
            <img src="/images/logo-mark.webp" alt="" width="36" height="36" className="h-9 w-9 object-contain transition-transform duration-700 ease-out group-hover/logo:rotate-[360deg]" />
            <span className="leading-none whitespace-nowrap">
              <span className="block display text-[1.08rem] xl:text-[1.15rem] text-foreground">{settings.company_name}</span>
              <span className="block eyebrow !text-[0.52rem] !tracking-[0.22em] mt-1 text-gold">Akwaaba Services</span>
            </span>
          </Link>

          <nav ref={navRef} aria-label="Sections" onMouseLeave={() => setHover("")} className="relative hidden lg:flex items-center mx-auto">
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 rounded-full bg-primary shadow-[0_8px_18px_-8px_hsl(var(--primary)/0.7)] transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ width: mark.w, transform: `translateX(${mark.x}px)`, opacity: mark.show ? 1 : 0 }}
            />
            {NAV_LINKS.map((l) => {
              const id = l.href.slice(1);
              return (
                <a
                  key={id}
                  ref={(el) => (linkRefs.current[id] = el)}
                  href={l.href}
                  aria-current={active === id ? "true" : undefined}
                  onMouseEnter={() => setHover(id)}
                  onFocus={() => setHover(id)}
                  onBlur={() => setHover("")}
                  className={`${linkBase} ${lit === id ? "text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {l.label}
                </a>
              );
            })}
          </nav>

          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" />
            {isAuthenticated && (
              <Link to={signInDest} title="My account" aria-label="My account" className="press grid place-items-center w-10 h-10 rounded-full text-foreground hover:bg-secondary transition-colors">
                <UserRound className="w-[18px] h-[18px]" aria-hidden="true" />
              </Link>
            )}
            <a href={callHref} aria-label={phone ? `Call ${phone}` : "Call us"} className="press group/call inline-flex items-center gap-2.5 pl-1.5 pr-2 xl:pr-4 py-1.5 rounded-full border border-border hover:border-accent hover:shadow-[0_8px_20px_-12px_hsl(var(--foreground)/0.5)] transition-all duration-300">
              <span className="ring-ping relative grid place-items-center w-9 h-9 rounded-full text-white bg-[hsl(var(--wa))] transition-transform duration-300 group-hover/call:-rotate-12 group-hover/call:scale-105">
                <Phone className="relative w-4 h-4" aria-hidden="true" />
              </span>
              <span className="hidden xl:block leading-tight text-left whitespace-nowrap">
                <span className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--wa))]" aria-hidden="true" /> Call 24/7
                </span>
                <span className="tabular text-[0.88rem] font-semibold text-foreground">{phone}</span>
              </span>
            </a>
            <Link to={bookDest} className="shine-btn press group/book inline-flex items-center gap-1.5 whitespace-nowrap px-5 py-3 rounded-full text-[0.9rem] font-bold text-[hsl(var(--site-dark))] hover:shadow-[0_12px_26px_-12px_hsl(var(--accent)/0.9)] transition-shadow" style={{ background: "var(--grad-gold)" }}>
              Book assistance
              <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover/book:translate-x-0.5 group-hover/book:-translate-y-0.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="lg:hidden ml-auto flex items-center">
            <ThemeToggle className="text-foreground hover:bg-secondary" />
            <button
              type="button"
              className="relative grid place-items-center w-10 h-10 rounded-full text-foreground hover:bg-secondary"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-menu"
            >
              <Menu className={`absolute w-6 h-6 transition-all duration-300 ${open ? "opacity-0 rotate-90 scale-50" : "opacity-100"}`} />
              <X className={`absolute w-6 h-6 transition-all duration-300 ${open ? "opacity-100" : "opacity-0 -rotate-90 scale-50"}`} />
            </button>
          </div>
        </div>

        {/* How far down the page you are. The faint flag colours are the track. */}
        <span className="pointer-events-none absolute left-8 right-8 bottom-0 h-[2px] overflow-hidden rounded-full" aria-hidden="true">
          <span className="absolute inset-0 tricolor-bar opacity-30" />
          <span className="absolute inset-0 origin-left" style={{ background: "var(--grad-brand)", transform: `scaleX(${progress})`, transition: "transform 120ms linear" }} />
        </span>

        {/* The phone menu drops open and its links arrive one after another. */}
        <div id="site-menu" className={`lg:hidden absolute left-0 right-0 top-full mt-2 grid rounded-[28px] border border-border bg-background shadow-[0_26px_50px_-26px_hsl(var(--foreground)/0.6)] transition-[grid-template-rows,opacity] duration-400 ease-out ${open ? "menu-open grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 border-transparent shadow-none"}`}>
          <div className="overflow-hidden" {...inertWhen(!open)}>
            <div className="p-4">
              <ul className="divide-y divide-border">
                {NAV_LINKS.map((l, i) => (
                  <li key={l.href} className="menu-item-in" style={delayStyle(80 + i * 60)}>
                    <a href={l.href} onClick={close} className="flex items-center justify-between py-3 text-lg text-foreground">
                      {l.label} <ArrowUpRight className="w-4 h-4 text-gold" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <div className="menu-item-in mt-4 flex gap-3" style={delayStyle(80 + NAV_LINKS.length * 60)}>
                <Link to={bookDest} onClick={close} className="shine-btn press flex-1 text-center py-3 rounded-full font-bold text-[hsl(var(--site-dark))]" style={{ background: "var(--grad-gold)" }}>Book assistance</Link>
                <a href={callHref} onClick={close} className="press flex-1 text-center py-3 rounded-full text-white font-semibold bg-[hsl(var(--wa))]">Call us</a>
              </div>
              {isAuthenticated && (
                <Link to={signInDest} onClick={close} className="block text-center mt-3 py-2 text-foreground underline underline-offset-4">My account</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
