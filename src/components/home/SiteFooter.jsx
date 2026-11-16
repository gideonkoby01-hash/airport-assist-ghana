import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";

export default function SiteFooter() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();
  const phones = phoneNumbers(settings.contact_phone);
  const address = addressLines(settings.contact_address);
  const callHref = phones[0] ? `tel:${phones[0].replace(/[^\d+]/g, "")}` : "#contact";
  const link = "text-white/70 hover:text-white link-grow pb-0.5";
  const head = "eyebrow text-accent mb-4";
  return (
    <footer className="bg-[hsl(var(--site-dark))] text-white border-t-2" style={{ borderColor: "hsl(var(--accent))" }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-10 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <img src="/images/logo-mark.webp" alt="" width="36" height="36" className="h-9 w-9 rounded-md bg-white/90 object-contain p-0.5" />
            <p className="sora text-[1.25rem] font-semibold">{settings.company_name}</p>
          </div>
          <p className="mt-4 max-w-sm leading-relaxed text-white/75">
            Personalised airport assistance from arrival to departure at Accra International Airport, 24 hours a day, 7 days a week.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={callHref} className="press inline-flex items-center gap-2 px-5 py-3 rounded-[14px] font-semibold text-[hsl(var(--wa-ink))] bg-[hsl(var(--wa))]"><Phone className="w-4 h-4" aria-hidden="true" /> Call us</a>
            <Link to={bookDest} className="press inline-flex items-center gap-2 px-5 py-3 rounded-[14px] font-semibold bg-white text-[hsl(var(--site-dark))]">Book assistance <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></Link>
          </div>
        </div>

        <nav aria-label="Services" className="md:col-span-2">
          <p className={head}>Airport assistance</p>
          <ul className="space-y-2.5">
            <li><a href="#services" className={link}>Arrival</a></li>
            <li><a href="#services" className={link}>Departure</a></li>
            <li><a href="#services" className={link}>Porter</a></li>
            <li><a href="#prices" className={link}>Prices</a></li>
          </ul>
        </nav>

        <nav aria-label="Company" className="md:col-span-2">
          <p className={head}>Airport Assist</p>
          <ul className="space-y-2.5">
            <li><a href="#about" className={link}>About</a></li>
            <li><a href="#how-it-works" className={link}>How it works</a></li>
            <li><a href="#faq" className={link}>Questions</a></li>
            <li><a href="#contact" className={link}>Contact</a></li>
            <li><Link to={signInDest} className={link}>{isAuthenticated ? "My account" : "Staff sign in"}</Link></li>
          </ul>
        </nav>

        <div className="md:col-span-3 space-y-3 text-white/75">
          <div className="flex items-start gap-3 rounded-[14px] border border-white/15 bg-white/5 p-3">
            <MapPin className="w-5 h-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="font-semibold text-white">Accra International Airport</p>
              <p className="text-sm text-white/60">Open 24 hours, 7 days a week</p>
            </div>
          </div>
          <a href={`mailto:${settings.contact_email}`} className="flex items-center gap-2 hover:text-white break-all"><Mail className="w-4 h-4 shrink-0 text-accent" aria-hidden="true" /> {settings.contact_email}</a>
          {phones.map((p) => (
            <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:text-white"><Phone className="w-4 h-4 shrink-0 text-accent" aria-hidden="true" /> {p}</a>
          ))}
          <p className="text-sm text-white/60">{address.join(", ")}</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 flex flex-col sm:flex-row justify-between gap-2 text-sm text-white/55">
          <p>&copy; {new Date().getFullYear()} {settings.company_name}</p>
          <Link to="/privacy" className="hover:text-white">Privacy notice</Link>
        </div>
        <p className="mx-auto max-w-6xl px-5 sm:px-8 pb-5 text-xs text-white/45">
          Terminal photographs via Wikimedia Commons, cropped: Kuala Lumpur arrivals hall by{" "}
          <a className="underline hover:text-white" href="https://commons.wikimedia.org/wiki/File:Arrival_hall_of_Kuala_Lumpur_International_Airport_Terminal_1_20250828_212245.jpg" target="_blank" rel="noreferrer">Tofeiku</a> (CC0); Beijing Capital departure hall by{" "}
          <a className="underline hover:text-white" href="https://commons.wikimedia.org/wiki/File:Beijing_Capital_International_Airport_Terminal_3_Departure_hall_20090818.jpg" target="_blank" rel="noreferrer">颐园新居</a> (CC BY-SA 3.0); Taoyuan check-in hall by{" "}
          <a className="underline hover:text-white" href="https://commons.wikimedia.org/wiki/File:Taiwan_Taoyuan_International_Airport_Terminal_2_Check-in_Hall_20200815.jpg" target="_blank" rel="noreferrer">Cheng-en Cheng</a> (CC BY-SA 2.0); Osmani luggage trolleys by{" "}
          <a className="underline hover:text-white" href="https://commons.wikimedia.org/wiki/File:Osmani_International_Airport_2023_03.jpg" target="_blank" rel="noreferrer">RockyMasum</a> (CC BY-SA 4.0).
        </p>
      </div>
    </footer>
  );
}
