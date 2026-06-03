"use client";
// ============================================================
// AERIE — useRequestReview
// ------------------------------------------------------------
// Encapsulates the optimistic approve/decline pattern that
// was inline in components/views/Requests.tsx. Both Requests.tsx
// and mobile MobileRequests use this hook so the logic lives
// in one place.
//
// Design:
// • `onAct` fires optimistically (updates local `acted` state)
//   then calls the server action and refreshes the snapshot.
// • `applyActed` merges the acted overlay into a list of requests
//   so callers can derive the display state for any sub-filter.
// ============================================================
import { useState } from "react";
import { useRefresh } from "@/components/portal/DataProvider";
import { reviewRequest } from "@/app/(portal)/requests/actions";
import type { MediaRequest } from "@/lib/types";

export interface RequestReviewHook {
  /** Map of request id → optimistic status ("approved" | "declined"). */
  acted: Record<string, string>;
  /** Approve or decline a request. Updates acted immediately, then syncs. */
  onAct: (id: string, action: "approve" | "decline") => void;
  /** Merge acted overlay into a list of requests for display. */
  applyActed: (list: MediaRequest[]) => MediaRequest[];
}

export function useRequestReview(): RequestReviewHook {
  const refresh = useRefresh();
  const [acted, setActed] = useState<Record<string, string>>({});

  const onAct = (id: string, action: "approve" | "decline") => {
    const optimisticStatus = action === "approve" ? "approved" : "declined";
    setActed((prev) => ({ ...prev, [id]: optimisticStatus }));
    void reviewRequest(id, action).then(() => refresh());
  };

  const applyActed = (list: MediaRequest[]): MediaRequest[] =>
    list.map((r) => (acted[r.id] ? { ...r, status: acted[r.id] as MediaRequest["status"] } : r));

  return { acted, onAct, applyActed };
}
