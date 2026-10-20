import React from "react";
import { Phone, Mail, MapPin, Clock } from "lucide-react";

const CONTACTS = [
  {
    icon: Phone,
    label: "Call us",
    lines: ["+233 537 755 063", "+233 246 222 777"],
    href: "tel:+233537755063",
  },
  {
    icon: Mail,
    label: "Email us",
    lines: ["moehamedi@gmail.com"],
    href: "mailto:moehamedi@gmail.com",
  },
  {
    icon: MapPin,
    label: "Visit us",
    lines: ["39 Ring Road East, Nyaniba", "GL-030-6750"],
  },
  {
    icon: Clock,
    label: "Availability",
    lines: ["24 hours a day", "7 days a week"],
  },
];

export default function Contact() {
  return (
    <section id="contact" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-[#d4af37] font-semibold uppercase tracking-[0.2em] text-sm">
            Contact Us
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-[#0b213c]">
            We are here to help, any time
          </h2>
          <p className="mt-4 text-[#5a697c]">
            Reach out to book a service or ask a question. Our team is available
            24 hours a day, 7 days a week.
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CONTACTS.map((c) => {
            const Icon = c.icon;
            const Body = (
              <div className="h-full bg-[#f7f9fc] rounded-2xl border border-[#e3e9f2] p-6 hover:border-[#d4af37]/50 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-[#0b213c] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#d4af37]" />
                </div>
                <h3 className="mt-4 font-semibold text-[#0b213c]">{c.label}</h3>
                <div className="mt-2 space-y-0.5">
                  {c.lines.map((l) => (
                    <p key={l} className="text-sm text-[#5a697c]">
                      {l}
                    </p>
                  ))}
                </div>
              </div>
            );
            return c.href ? (
              <a key={c.label} href={c.href} className="block h-full">
                {Body}
              </a>
            ) : (
              <div key={c.label} className="h-full">
                {Body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}