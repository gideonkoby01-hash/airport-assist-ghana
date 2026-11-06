import React from "react";

export const telHref = (value) => `tel:${(value || "").replace(/[^\d+]/g, "")}`;
export const waHref = (value) => `https://wa.me/${(value || "").replace(/\D/g, "")}`;

/** One labelled contact line (call, WhatsApp, email) used on the profile card and dialog. */
export default function SupervisorContactRow({ icon: Icon, label, value, href, external }) {
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