import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { useHomeCta } from "@/components/home/useHomeCta";
import { useSettings } from "@/lib/SettingsContext";

const NAV_LINKS = [
  { label: "Prices", href: "#prices" },
  { label: "How it works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Questions", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export default function SiteHeader() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="tricolor-bar h-[3px]" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center gap-6">
        <Link to="/" onClick={close} className="flex items-center gap-2.5 shrink-0">
          <img src="/images/logo-mark.webp" alt="" width="36" height="36" className="h-9 w-9 object-contain" />
          <span className="display text-[1.35rem] text-foreground">{settings.company_name}</span>
        </Link>

        <nav aria-label="Sections" className="hidden lg:flex items-center gap-7 ml-auto">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[0.95rem] text-muted-foreground hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-secondary" />
          <Link to={signInDest} className="px-3 py-2 text-[0.95rem] font-medium text-foreground hover:underline underline-offset-4">
            {isAuthenticated ? "My account" : "Sign in"}
          </Link>
          <Link to={bookDest} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-[0.95rem] font-semibold hover:opacity-90">
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

      {open && (
        <div id="site-menu" className="lg:hidden border-t border-border bg-background">
          <div className="px-5 py-4">
            <ul className="divide-y divide-border">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={close} className="block py-3 text-lg text-foreground">{l.label}</a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <Link to={bookDest} onClick={close} className="flex-1 text-center py-3 rounded-md bg-primary text-primary-foreground font-semibold">Book assistance</Link>
              <Link to={signInDest} onClick={close} className="flex-1 text-center py-3 rounded-md border border-border text-foreground font-medium">
                {isAuthenticated ? "My account" : "Sign in"}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
