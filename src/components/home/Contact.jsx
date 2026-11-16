import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Clock, Mail, MapPin, Phone, Zap } from "lucide-react";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";
import { useHomeCta } from "@/components/home/useHomeCta";
import Reveal from "@/components/home/Reveal";

// Three ways to book, then where to find us.
export default function Contact() {
  const { settings } = useSettings();
  const { bookDest } = useHomeCta();
  const phones = phoneNumbers(settings.contact_phone);
  const callHref = phones[0] ? `tel:${phones[0].replace(/[^\d+]/g, "")}` : "#contact";
  const address = addressLines(settings.contact_address);

  return (
    <section id="contact" style={{ background: "var(--grad-soft)" }}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
        <Reveal className="max-w-3xl">
          <p className="eyebrow" style={{ color: "hsl(var(--violet))" }}>Three ways to book</p>
          <h2 className="display mt-3 text-[clamp(2rem,4.2vw,3.1rem)] text-foreground">Book your airport escort your way</h2>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-muted-foreground">
            Reserve online in a few minutes, call and talk to someone first, or email us your flight details. Our team is on duty 24 hours a day, 7 days a week.
          </p>
        </Reveal>

        <ul className="mt-10 grid lg:grid-cols-5 gap-6 items-stretch">
          <Reveal as="li" className="list-none lg:col-span-3">
            <div className="lift h-full flex flex-col rounded-[22px] border border-border bg-card p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="grid place-items-center w-12 h-12 rounded-full text-[hsl(var(--wa-ink))] bg-[hsl(var(--wa))]"><Phone className="w-5 h-5" aria-hidden="true" /></span>
                  <div>
                    <h3 className="text-[1.5rem] font-bold text-foreground leading-tight">Call us</h3>
                    <p className="text-sm text-muted-foreground">Someone is on duty 24/7</p>
                  </div>
                </div>
                <span className="eyebrow" style={{ color: "hsl(var(--wa-text))" }}>Most direct</span>
              </div>
              <div className="mt-6 space-y-1">
                {phones.map((p) => (
                  <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="tabular display text-[1.9rem] block w-fit text-foreground link-grow pb-0.5">{p}</a>
                ))}
              </div>
              <ol className="mt-6 mb-7 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <li><span className="font-bold text-[hsl(var(--wa-text))] mr-1.5">1</span>Give your flight number</li>
                <li><span className="font-bold text-[hsl(var(--wa-text))] mr-1.5">2</span>Choose a service</li>
                <li><span className="font-bold text-[hsl(var(--wa-text))] mr-1.5">3</span>We prepare your escort</li>
              </ol>
              <a href={callHref} className="press mt-auto flex items-center justify-center gap-2 rounded-[14px] py-3.5 font-semibold text-[hsl(var(--wa-ink))] bg-[hsl(var(--wa))]">
                <Phone className="w-4 h-4" aria-hidden="true" /> Call now
              </a>
            </div>
          </Reveal>

          <Reveal as="li" delay={100} className="list-none lg:col-span-2">
            <div className="lift h-full flex flex-col rounded-[22px] p-6 sm:p-8 text-white" style={{ background: "var(--grad-brand)" }}>
              <div className="flex items-start justify-between">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-white/15"><Zap className="w-5 h-5" aria-hidden="true" /></span>
                <span className="eyebrow rounded-full bg-white/15 px-3 py-1">Fastest</span>
              </div>
              <h3 className="mt-5 text-[1.5rem] font-bold leading-tight">Book online in minutes</h3>
              <p className="mt-2 text-white/85 leading-snug">Choose your service and flight, and we prepare your escort.</p>
              <ul className="mt-5 mb-7 space-y-2.5 text-[0.95rem]">
                {["Live prices, no hidden fees", "Pay at the airport, not online", "Your booking appears in your account"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {t}</li>
                ))}
              </ul>
              <Link to={bookDest} className="press mt-auto flex items-center justify-center gap-2 rounded-[14px] bg-white py-3.5 font-semibold text-[hsl(var(--site-dark))]">
                Start booking <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <Reveal as="li" delay={200} className="list-none lg:col-span-5">
            <div className="lift rounded-[22px] border border-border bg-card p-6 sm:p-8 grid md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-5 flex items-center gap-4">
                <span className="grid place-items-center w-12 h-12 rounded-xl bg-secondary text-foreground"><Mail className="w-5 h-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="text-[1.35rem] font-bold text-foreground leading-tight">Send your details, we reply</h3>
                  <p className="text-sm text-muted-foreground mt-1">Groups, special assistance or anything unusual.</p>
                </div>
              </div>
              <ul className="md:col-span-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gold shrink-0" aria-hidden="true" /> {address.join(", ")}</li>
                <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-gold shrink-0" aria-hidden="true" /> At the airport 24 hours a day, 7 days a week</li>
              </ul>
              <a href={`mailto:${settings.contact_email}`} className="press md:col-span-3 flex items-center justify-center gap-2 rounded-[14px] border border-border bg-secondary py-3.5 font-semibold text-foreground break-all text-center px-3">
                Email us <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </Reveal>
        </ul>
      </div>
    </section>
  );
}
