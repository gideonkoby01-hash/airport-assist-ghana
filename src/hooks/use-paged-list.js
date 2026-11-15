import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/db";

/**
 * A list that loads one page at a time with a "load more" step, so old records stay reachable.
 * `query` is the same filter the entity API takes; `entity` is the entity name (for example "Booking").
 */
export function usePagedList(entity, query, { pageSize = 50, sort = "-created_date" } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(undefined);
  const queryKey = JSON.stringify(query);
  const latest = useRef(0);

  const fetchPage = useCallback(
    (after) => api.entities[entity].filter(JSON.parse(queryKey), { sort, limit: pageSize, cursor: after }),
    [entity, queryKey, sort, pageSize]
  );

  const reload = useCallback(async () => {
    const run = ++latest.current;
    setLoading(true);
    try {
      const page = await fetchPage(undefined);
      if (run !== latest.current) return;
      setItems(page.items || []);
      setCursor(page.next_cursor);
    } catch {
      if (run === latest.current) { setItems([]); setCursor(undefined); }
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setItems((prev) => [...prev, ...(page.items || [])]);
      setCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage]);

  useEffect(() => { reload(); }, [reload]);

  return { items, loading, loadingMore, hasMore: Boolean(cursor), loadMore, reload };
}
