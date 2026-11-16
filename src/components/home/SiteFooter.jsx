import React from "react";
import { Link } from "react-router-dom";
import { useHomeCta } from "@/components/home/useHomeCta";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";

export default function SiteFooter() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const phones = phoneNumbers(settings.contact_phone);
  const address = addressLines(settings.contact_address);
  const link = "text-sidebar-foreground/75 hover:text-white link-grow pb-0.5";
  const head = "text-white font-semibold mb-4";
  return (
    <footer className="bg-sidebar text-sidebar-foreground">
      <div className="tricolor-bar h-[3px]" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-10 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <p className="display text-[1.7rem] text-white">{settings.company_name}</p>
          <p className="mt-1 text-sm text-sidebar-foreground/60">Akwaaba Services</p>
          <p className="mt-4 max-w-xs leading-relaxed text-sidebar-foreground/80">
            Personalised airport assistance at Accra International Airport. Open 24 hours a day, 7 days a week.
          </p>
          <Link to={bookDest} className="press mt-6 inline-block px-6 py-3 rounded-full bg-accent text-accent-foreground font-semibold">Book assistance</Link>
        </div>

        <nav aria-label="Services" className="md:col-span-2">
          <p className={head}>Services</p>
          <ul className="space-y-2.5">
            <li><a href="#services" className={link}>On arrival</a></li>
            <li><a href="#services" className={link}>On departure</a></li>
            <li><a href="#services" className={link}>Porter only</a></li>
            <li><a href="#prices" className={link}>Prices</a></li>
          </ul>
        </nav>

        <nav aria-label="Company" className="md:col-span-2">
          <p className={head}>Company</p>
          <ul className="space-y-2.5">
            <li><a href="#about" className={link}>About us</a></li>
            <li><a href="#how-it-works" className={link}>How it works</a></li>
            <li><a href="#faq" className={link}>Questions</a></li>
            <li><Link to="/privacy" className={link}>Privacy notice</Link></li>
            <li><Link to={signInDest} className={link}>{isAuthenticated ? "My account" : "Staff sign in"}</Link></li>
          </ul>
        </nav>

        <div className="md:col-span-4">
          <p className={head}>Contact</p>
          <ul className="space-y-2.5">
            {phones.map((p) => (
              <li key={p}><a href={`tel:${p.replace(/[^\d+]/g, "")}`} className={link}>{p}</a></li>
            ))}
            <li><a href={`mailto:${settings.contact_email}`} className={`${link} break-all`}>{settings.contact_email}</a></li>
            {address.map((l) => <li key={l} className="text-sidebar-foreground/75">{l}</li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 flex flex-col sm:flex-row justify-between gap-2 text-sm text-sidebar-foreground/60">
          <p>&copy; {new Date().getFullYear()} {settings.company_name}</p>
          <p>Accra International Airport, Accra, Ghana</p>
        </div>
      </div>
    </footer>
  );
}
