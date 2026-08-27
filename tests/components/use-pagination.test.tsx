import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { renderHook, act } from "@testing-library/react";
import { usePagination } from "@/components/hooks/usePagination";

describe("usePagination — behavior", () => {
  it("slices items into pages of the given size", () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagination(items, 10));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.page).toBe(0);
    expect(result.current.slice).toEqual(items.slice(0, 10));
  });

  it("setPage advances to the requested page", () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagination(items, 10));
    act(() => result.current.setPage(1));
    expect(result.current.page).toBe(1);
    expect(result.current.slice).toEqual(items.slice(10, 20));
  });

  it("resets to page 0 when the item count changes", () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 10), {
      initialProps: { items: Array.from({ length: 30 }, (_, i) => i + 1) },
    });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ items: Array.from({ length: 5 }, (_, i) => i + 1) });
    expect(result.current.page).toBe(0);
  });

  it("clamps the page into range if totalPages shrinks without a length change (pageSize grows)", () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    const { result, rerender } = renderHook(({ pageSize }) => usePagination(items, pageSize), {
      initialProps: { pageSize: 10 },
    });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ pageSize: 20 }); // totalPages: 3 -> 2, so page 2 is now out of range
    expect(result.current.page).toBe(1);
  });

  it("reports a single page (page 0) for an empty list", () => {
    const { result } = renderHook(() => usePagination([] as number[], 10));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(0);
    expect(result.current.slice).toEqual([]);
  });
});

describe("usePagination — reset ordering", () => {
  // Regression guard for the bug this hook was extracted to fix: the reset
  // used to run in a `useEffect`, which commits in a *later* pass than the
  // render it was scheduled from. That leaves a window where a committed
  // render still shows a stale page before the effect corrects it — a stale
  // commit an event handler's own setPage() could be interleaved with and
  // lost behind. Resetting during render (this hook's implementation)
  // collapses that window: React discards the in-progress render and
  // re-renders with the corrected page before anything commits, so no
  // intermediate "stale page" commit ever happens.
  //
  // This test can't reproduce the original lost-click race itself (RTL's
  // `fireEvent`/`act` flush pending effects before processing a discrete
  // update, so the two updates can't be forced to interleave through this
  // harness). What it does assert, deterministically: after a page change
  // followed by an item-count change, the committed page sequence has no
  // intermediate stale-page commit — which is exactly the property the
  // render-time fix guarantees and the old effect-based version did not.
  it("commits the reset page exactly once, with no intermediate stale-page commit", () => {
    const committed: number[] = [];
    const useProbe = (items: number[], pageSize: number) => {
      const pagination = usePagination(items, pageSize);
      useEffect(() => {
        committed.push(pagination.page);
      });
      return pagination;
    };

    const { result, rerender } = renderHook(({ items }) => useProbe(items, 10), {
      initialProps: { items: Array.from({ length: 30 }, (_, i) => i + 1) },
    });
    act(() => result.current.setPage(2));
    expect(committed).toEqual([0, 2]);

    committed.length = 0;
    // 30 -> 25 still spans 3 pages at pageSize 10 (ceil(25/10) === 3), so page
    // 2 stays in range on its own — clamping alone cannot explain a reset to
    // 0 here. Only the length-change reset can.
    rerender({ items: Array.from({ length: 25 }, (_, i) => i + 1) });
    expect(committed).toEqual([0]);
  });
});
