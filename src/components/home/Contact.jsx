import React from "react";
import { Link } from "react-router-dom";
import { Clock, Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";
import { useHomeCta } from "@/components/home/useHomeCta";
import Reveal from "@/components/home/Reveal";

// Three ways to book, then where to find us.
export default function Contact() {
  const { settings } = useSettings();
  const { bookDest } = useHomeCta();
  const phones = phoneNumbers(settings.contact_phone);
  const address = addressLines(settings.contact_address);

  return (
    <section id="contact" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
      <Reveal className="max-w-3xl">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">Book it your way.</h2>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-muted-foreground">
          Book online in a few minutes, or talk to someone first. Our team is on duty 24 hours a day, 7 days a week.
        </p>
      </Reveal>

      <ul className="mt-10 grid md:grid-cols-3 gap-6">
        <Reveal as="li" className="list-none">
          <div className="lift h-full flex flex-col rounded-[18px] bg-primary text-primary-foreground p-7 border border-primary">
            <Smartphone className="w-7 h-7 text-accent" aria-hidden="true" />
            <h3 className="mt-5 display text-[1.8rem]">Book online</h3>
            <p className="mt-2 mb-7 opacity-85 leading-snug">Choose your service, add your flight details, and we prepare your escort. You pay at the airport.</p>
            <Link to={bookDest} className="press mt-auto self-start inline-block px-6 py-3 rounded-lg bg-accent text-accent-foreground font-semibold">Book assistance</Link>
          </div>
        </Reveal>
        <Reveal as="li" delay={100} className="list-none">
          <div className="lift h-full rounded-[18px] border border-border bg-card p-7">
            <Phone className="w-7 h-7 text-gold" aria-hidden="true" />
            <h3 className="mt-5 display text-[1.8rem] text-foreground">Call us</h3>
            <p className="mt-2 text-muted-foreground leading-snug">Speak to someone at any hour.</p>
            <div className="mt-5 space-y-1">
              {phones.map((p) => (
                <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="tabular display text-[1.6rem] block w-fit text-foreground link-grow pb-0.5">{p}</a>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal as="li" delay={200} className="list-none">
          <div className="lift h-full rounded-[18px] border border-border bg-card p-7">
            <Mail className="w-7 h-7 text-gold" aria-hidden="true" />
            <h3 className="mt-5 display text-[1.8rem] text-foreground">Email us</h3>
            <p className="mt-2 text-muted-foreground leading-snug">Send your flight details and questions.</p>
            <a href={`mailto:${settings.contact_email}`} className="mt-5 block text-lg text-foreground link-grow pb-0.5 w-fit break-all">{settings.contact_email}</a>
          </div>
        </Reveal>
      </ul>

      <Reveal className="mt-8 grid sm:grid-cols-2 gap-6 rounded-[18px] border border-border bg-secondary p-6 sm:p-7">
        <div className="flex gap-3">
          <MapPin className="w-5 h-5 mt-1 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">Our office</p>
            {address.map((l) => <p key={l} className="text-muted-foreground">{l}</p>)}
          </div>
        </div>
        <div className="flex gap-3">
          <Clock className="w-5 h-5 mt-1 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">At the airport</p>
            <p className="text-muted-foreground">Accra International Airport, 24 hours a day, 7 days a week.</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
