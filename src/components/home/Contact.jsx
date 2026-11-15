import React from "react";
import { Link } from "react-router-dom";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";
import { useHomeCta } from "@/components/home/useHomeCta";
import Reveal from "@/components/home/Reveal";

export default function Contact() {
  const { settings } = useSettings();
  const { bookDest } = useHomeCta();
  const phones = phoneNumbers(settings.contact_phone);
  const address = addressLines(settings.contact_address);

  const cards = [
    phones.length > 0 && {
      key: "phone", icon: Phone, label: "Phone",
      body: phones.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="tabular display text-[1.6rem] block text-foreground link-grow pb-0.5 w-fit">{p}</a>),
    },
    settings.contact_email && {
      key: "email", icon: Mail, label: "Email",
      body: <a href={`mailto:${settings.contact_email}`} className="text-lg text-foreground link-grow pb-0.5 break-all">{settings.contact_email}</a>,
    },
    address.length > 0 && {
      key: "address", icon: MapPin, label: "Address",
      body: address.map((l) => <span key={l} className="block text-lg text-foreground">{l}</span>),
    },
    { key: "hours", icon: Clock, label: "Hours", body: <span className="block text-lg text-foreground">24 hours a day, 7 days a week</span> },
  ].filter(Boolean);

  return (
    <section id="contact" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-14">
      <Reveal className="lg:col-span-5">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">Talk to someone, at any hour.</h2>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[28rem]">
          Call or write to book a service or ask a question. Someone is on duty 24 hours a day, 7 days a week.
        </p>
        <Link to={bookDest} className="press mt-8 inline-block px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold">
          Book assistance
        </Link>
      </Reveal>
      <ul className="lg:col-span-7 grid sm:grid-cols-2 gap-5">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Reveal as="li" key={c.key} delay={i * 90} className="list-none">
              <div className="lift h-full rounded-[14px] border border-border bg-card p-6">
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Icon className="w-[18px] h-[18px] text-gold" aria-hidden="true" />
                  <span className="text-sm font-medium">{c.label}</span>
                </div>
                <div className="mt-3">{c.body}</div>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
