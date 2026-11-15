import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";
import { useSettings } from "@/lib/SettingsContext";

export default function SiteFooter() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const link = "text-muted-foreground hover:text-foreground hover:underline underline-offset-4";
  return (
    <footer className="border-t border-border bg-secondary">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <p className="display text-[1.5rem] text-foreground">{settings.company_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">Akwaaba Services</p>
          <p className="mt-4 text-muted-foreground leading-relaxed max-w-sm">
            Personalised airport concierge and passenger assistance at Accra International Airport. Open 24 hours a day, 7 days a week.
          </p>
        </div>
        <nav aria-label="Footer" className="md:col-span-3">
          <ul className="space-y-2">
            <li><a href="#prices" className={link}>Prices</a></li>
            <li><a href="#how-it-works" className={link}>How it works</a></li>
            <li><a href="#faq" className={link}>Questions</a></li>
            <li><a href="#contact" className={link}>Contact</a></li>
            <li><Link to={bookDest} className={link}>Book assistance</Link></li>
            <li><Link to={signInDest} className={link}>{isAuthenticated ? "My account" : "Sign in"}</Link></li>
          </ul>
        </nav>
        <div className="md:col-span-4 text-muted-foreground space-y-1">
          <p>{settings.contact_phone}</p>
          <p>{settings.contact_email}</p>
          <p>{settings.contact_address}</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 flex flex-col sm:flex-row justify-between gap-2 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {settings.company_name}</p>
          <Link to="/privacy" className={link}>Privacy notice</Link>
        </div>
      </div>
    </footer>
  );
}
