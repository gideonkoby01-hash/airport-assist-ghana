import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, sub = undefined, icon: Icon, accent = false }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-lg p-2", accent ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary")}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}