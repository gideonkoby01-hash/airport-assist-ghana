import React from "react";
import { Link } from "react-router-dom";
import { addressLines, phoneNumbers, useSettings } from "@/lib/SettingsContext";
import { useHomeCta } from "@/components/home/useHomeCta";

export default function Contact() {
  const { settings } = useSettings();
  const { bookDest } = useHomeCta();
  const phones = phoneNumbers(settings.contact_phone);
  const address = addressLines(settings.contact_address);
  const Row = ({ label, children }) => (
    <div className="grid sm:grid-cols-[9rem_1fr] gap-x-6 gap-y-1 py-5 border-b border-border">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
  return (
    <section id="contact" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-14">
      <div className="lg:col-span-5">
        <h2 className="display text-[clamp(2.2rem,4.6vw,3.4rem)] text-foreground">Talk to someone, at any hour.</h2>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-muted-foreground max-w-[28rem]">
          Call or write to book a service or ask a question. Someone is on duty 24 hours a day, 7 days a week.
        </p>
        <Link to={bookDest} className="mt-8 inline-block px-7 py-3.5 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90">
          Book assistance
        </Link>
      </div>
      <dl className="lg:col-span-7 border-t-2 border-foreground">
        {phones.length > 0 && (
          <Row label="Phone">
            {phones.map((p) => (
              <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="tabular display text-[1.9rem] block hover:underline underline-offset-4 decoration-gold decoration-2">{p}</a>
            ))}
          </Row>
        )}
        <Row label="Email">
          <a href={`mailto:${settings.contact_email}`} className="text-lg underline underline-offset-4 decoration-gold decoration-2 hover:decoration-foreground break-all">{settings.contact_email}</a>
        </Row>
        {address.length > 0 && (
          <Row label="Address">
            {address.map((l) => <span key={l} className="block text-lg">{l}</span>)}
          </Row>
        )}
        <Row label="Hours"><span className="text-lg">24 hours a day, 7 days a week</span></Row>
      </dl>
    </section>
  );
}
