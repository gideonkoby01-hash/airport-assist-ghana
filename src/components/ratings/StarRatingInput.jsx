import React, { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAR_LABELS } from "@/lib/ratings";

// Interactive five-star selector for the passenger review form.
export default function StarRatingInput({ value = 0, onChange, disabled = false }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Overall Airport Assist experience">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={Number(value) === n}
            aria-label={`${n} star${n === 1 ? "" : "s"} – ${STAR_LABELS[n]}`}
            disabled={disabled}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(n)}
            className={cn(
              "p-1 rounded-md transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !disabled && "hover:scale-110 active:scale-95",
              disabled && "opacity-60"
            )}
          >
            <Star
              className={cn(
                "w-9 h-9 transition-colors",
                n <= active ? "text-accent fill-accent" : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-sm font-medium text-foreground">
        {active ? `${active} Star${active === 1 ? "" : "s"} – ${STAR_LABELS[active]}` : "Select a star rating"}
      </span>
    </div>
  );
}