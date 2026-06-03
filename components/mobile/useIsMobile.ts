"use client";
import { useEffect, useState } from "react";

/**
 * Returns true if the viewport is <= 768px (mobile), false otherwise.
 *
 * SSR strategy: defaults to `false` (desktop) so the server renders the
 * full desktop shell and it matches the client's first paint on desktop.
 * On a narrow viewport the hook corrects to `true` after mount (one-frame
 * transition), which is far less jarring than a blank→content flash that
 * `null` caused on every desktop load. Mobile users see a brief correction;
 * desktop users see no flash at all.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
