"use client";
// ============================================================
// AERIE — usePagination
// ------------------------------------------------------------
// Encapsulates the client-side pager copy-pasted across two files
// / three call sites: HistoryList (25 rows/page), QueuePanel and
// DownloadsPanel (page size derived from useFitRows).
//
// The page resets to 0 whenever the item count changes. That
// reset happens *during render*, not in a passive effect:
//
//   • In an effect, the reset lands in a later commit — there's a
//     window where a committed render still shows the stale page,
//     and a setPage() from an event handler in that window can be
//     silently clobbered by the effect's setPage(0) landing after it.
//   • Adjusting state during render (react.dev, "storing information
//     from previous renders") makes React discard the in-progress
//     render and re-render with page 0 before committing, so no
//     committed render ever shows a stale page and nothing can race.
//
// `page` is also clamped into range, so a shrinking list or a
// changed pageSize can never slice out of bounds.
// ============================================================
import { useState } from "react";

export type Pagination<T> = {
  /** Current page, already clamped into [0, totalPages - 1]. */
  page: number;
  totalPages: number;
  /** The `items` window for the current page. */
  slice: T[];
  setPage: (p: number) => void;
};

/**
 * Client-side pager over an in-memory list.
 *
 * @param items    The full list (page resets to 0 when its length changes).
 * @param pageSize Rows per page; may vary between renders (fit-to-height tiles).
 */
export function usePagination<T>(items: T[], pageSize: number): Pagination<T> {
  const [page, setPage] = useState(0);
  const [prevLen, setPrevLen] = useState(items.length);

  // Reset during render — never in an effect (see header).
  if (prevLen !== items.length) {
    setPrevLen(items.length);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  return {
    page: safePage,
    totalPages,
    slice: items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    setPage,
  };
}
