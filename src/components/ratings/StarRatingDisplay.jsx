import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAR_LABELS } from "@/lib/ratings";

// Read-only star display. Used in booking details, tables and detail dialogs.
export default function StarRatingDisplay({ value = 0, size = "sm", showLabel = false, className = undefined }) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  const dimensions = size === "lg" ? "w-6 h-6" : size === "md" ? "w-5 h-5" : "w-4 h-4";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(dimensions, i <= filled ? "text-accent fill-accent" : "text-muted-foreground/30")}
            aria-hidden="true"
          />
        ))}
      </div>
      {showLabel && filled > 0 && <span className="text-sm text-muted-foreground">{STAR_LABELS[filled]}</span>}
    </div>
  );
}