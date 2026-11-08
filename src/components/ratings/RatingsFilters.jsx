import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PACKAGE_LABELS } from "@/lib/packages";
import { RATING_SORT_OPTIONS, STAR_VALUES, STAR_LABELS } from "@/lib/ratings";
import { Search, X } from "lucide-react";

// Search + filters for the reviews table. All values are passed up to the parent,
// which applies them together in a single server query.
export default function RatingsFilters({ filters, onChange, supervisors, onClear, active }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search passenger name or booking reference"
            className="pl-9"
            aria-label="Search passenger name or booking reference"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Star rating</Label>
          <Select value={filters.rating} onValueChange={(v) => onChange({ rating: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All ratings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {STAR_VALUES.map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {v} Star{v === 1 ? "" : "s"} – {STAR_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Service package</Label>
          <Select value={filters.pkg} onValueChange={(v) => onChange({ pkg: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All packages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All packages</SelectItem>
              {Object.entries(PACKAGE_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Assigned supervisor</Label>
          <Select value={filters.supervisor} onValueChange={(v) => onChange({ supervisor: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All supervisors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All supervisors</SelectItem>
              {supervisors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">From date</Label>
          <Input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => onChange({ from: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">To date</Label>
          <Input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => onChange({ to: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Sort by</Label>
          <Select value={filters.sort} onValueChange={(v) => onChange({ sort: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATING_SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {active && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}