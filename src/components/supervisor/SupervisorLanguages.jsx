import React from "react";
import { Languages } from "lucide-react";

/** Languages spoken, rendered as badges from a comma-separated string. */
export default function SupervisorLanguages({ languages }) {
  const list = (languages || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        <Languages className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Languages</p>
        {list.length ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {list.map((lang) => (
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
  );
}