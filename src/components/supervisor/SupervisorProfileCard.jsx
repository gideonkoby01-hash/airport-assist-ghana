import React from "react";
import SupervisorPhoto from "./SupervisorPhoto";
import { Phone, MessageCircle, Mail, Languages, UserRound } from "lucide-react";

const telHref = (value) => `tel:${(value || "").replace(/[^\d+]/g, "")}`;
const waHref = (value) => `https://wa.me/${(value || "").replace(/\D/g, "")}`;

function ContactRow({ icon: Icon, label, value, href, external }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        {value && href ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="text-sm font-medium text-foreground hover:text-accent break-words"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">{value || "Not provided"}</p>
        )}
      </div>
    </div>
  );
}

export function SupervisorProfilePlaceholder() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="bg-primary px-5 sm:px-6 py-4 flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-accent" />
        <h3 className="text-sm font-semibold tracking-wide text-primary-foreground uppercase">Meet Your Supervisor</h3>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
            <UserRound className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Your Airport Assist supervisor will be displayed here once assigned.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You will be able to reach them directly here as soon as your booking is assigned.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SupervisorProfileCard({ profile, heading = "Meet Your Supervisor" }) {
  const p = profile || {};
  const languages = (p.languages || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="bg-primary px-5 sm:px-6 py-4 flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-accent" />
        <h3 className="text-sm font-semibold tracking-wide text-primary-foreground uppercase">{heading}</h3>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
          <SupervisorPhoto
            fileUri={p.photo_uri}
            name={p.full_name}
            className="w-24 h-24 sm:w-28 sm:h-28"
          />

          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-foreground break-words">
              {p.full_name || "Airport Assist Supervisor"}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mt-0.5">
              {p.title || "Airport Assist Supervisor"}
            </p>

            <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <ContactRow icon={Phone} label="Call" value={p.phone} href={telHref(p.phone)} />
              <ContactRow
                icon={MessageCircle}
                label="WhatsApp"
                value={p.whatsapp_number}
                href={waHref(p.whatsapp_number)}
                external
              />
              <ContactRow icon={Mail} label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : null} />
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Languages className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Languages</p>
                  {languages.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {languages.map((lang) => (
                        <span
                          key={lang}
                          className="px-2 py-0.5 rounded-full bg-accent/15 text-[11px] font-medium text-foreground"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not provided</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {p.bio && (
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">About</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{p.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}