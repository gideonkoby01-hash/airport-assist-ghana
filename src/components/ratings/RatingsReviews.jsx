import React, { useEffect, useState } from "react";
import { api } from "@/api/db";
import RatingsSummary from "@/components/ratings/RatingsSummary";
import RatingsFilters from "@/components/ratings/RatingsFilters";
import RatingsTable from "@/components/ratings/RatingsTable";
import ReviewDetailDialog from "@/components/ratings/ReviewDetailDialog";
import SupervisorFeedbackInsights from "@/components/ratings/SupervisorFeedbackInsights";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS = {
  search: "",
  rating: "all",
  pkg: "all",
  supervisor: "all",
  from: "",
  to: "",
  sort: "-submitted_at",
};

const EMPTY_SUMMARY = { total: 0, average: 0, fiveStar: 0, oneStar: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

// Builds one server query from every active filter, so search and filters
// always combine correctly.
function buildQuery(filters) {
  const clauses = [];
  if (filters.rating !== "all") clauses.push({ overall_rating: Number(filters.rating) });
  if (filters.pkg !== "all") clauses.push({ package_code: filters.pkg });
  if (filters.supervisor !== "all") clauses.push({ supervisor_user_id: filters.supervisor });

  const range = {};
  if (filters.from) range.$gte = `${filters.from}T00:00:00.000Z`;
  if (filters.to) range.$lte = `${filters.to}T23:59:59.999Z`;
  if (Object.keys(range).length) clauses.push({ submitted_at: range });

  const term = filters.search.trim();
  if (term) {
    clauses.push({
      $or: [{ booking_reference: { $regex: term, $options: "i" } }, { passenger_name: { $regex: term, $options: "i" } }],
    });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

export default function RatingsReviews() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [supervisors, setSupervisors] = useState([]);
  const [mode, setMode] = useState("reviews");
  const [activeReview, setActiveReview] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const result = await api.entities.BookingRating.aggregate({ groupBy: "overall_rating" });
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let total = 0;
      let sum = 0;
      (result.rows || []).forEach((row) => {
        const value = Number(row.overall_rating);
        const count = Number(row.count) || 0;
        if (distribution[value] === undefined) return;
        distribution[value] += count;
        total += count;
        sum += value * count;
      });
      setSummary({
        total,
        average: total ? sum / total : 0,
        fiveStar: distribution[5],
        oneStar: distribution[1],
        distribution,
      });
    } catch {
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadSupervisors = async () => {
    try {
      const map = new Map();
      let nextCursor;
      let pages = 0;
      do {
        const page = await api.entities.BookingRating.filter(
          {},
          { sort: "-submitted_at", limit: 100, cursor: nextCursor, fields: ["supervisor_user_id", "supervisor_name"] }
        );
        (page.items || []).forEach((r) => {
          if (r.supervisor_user_id) map.set(r.supervisor_user_id, r.supervisor_name || "Supervisor");
        });
        nextCursor = page.next_cursor;
        pages += 1;
      } while (nextCursor && pages < 10);
      setSupervisors(
        [...map.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      setSupervisors([]);
    }
  };

  useEffect(() => {
    loadSummary();
    loadSupervisors();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const page = await api.entities.BookingRating.filter(buildQuery(filters), {
          sort: filters.sort,
          limit: 50,
        });
        if (cancelled) return;
        setRows(page.items || []);
        setCursor(page.next_cursor || null);
        setHasMore(Boolean(page.has_more));
      } catch {
        if (cancelled) return;
        setRows([]);
        setCursor(null);
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, filters.search ? 350 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };

  }, [filters.search, filters.rating, filters.pkg, filters.supervisor, filters.from, filters.to, filters.sort]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.entities.BookingRating.filter(buildQuery(filters), {
        sort: filters.sort,
        limit: 50,
        cursor,
      });
      setRows((prev) => [...prev, ...(page.items || [])]);
      setCursor(page.next_cursor || null);
      setHasMore(Boolean(page.has_more));
    } catch {
      // keep what is already on screen
    } finally {
      setLoadingMore(false);
    }
  };

  const openReview = (review) => {
    setActiveReview(review);
    setDialogOpen(true);
  };

  const activeFilters = Boolean(
    filters.search ||
      filters.rating !== "all" ||
      filters.pkg !== "all" ||
      filters.supervisor !== "all" ||
      filters.from ||
      filters.to
  );

  return (
    <div className="space-y-4">
      <RatingsSummary summary={summary} loading={loadingSummary} />

      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {[
          { key: "reviews", label: "All reviews" },
          { key: "supervisor", label: "Supervisor feedback" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              mode === tab.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "reviews" ? (
        <div className="space-y-4">
          <RatingsFilters
            filters={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            supervisors={supervisors}
            onClear={() => setFilters(DEFAULT_FILTERS)}
            active={activeFilters}
          />
          <RatingsTable
            rows={rows}
            loading={loading}
            onView={openReview}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        </div>
      ) : (
        <SupervisorFeedbackInsights supervisors={supervisors} />
      )}

      <ReviewDetailDialog review={activeReview} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}