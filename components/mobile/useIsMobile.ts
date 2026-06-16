"use client";
import { useEffect, useState } from "react";
import { useInitialIsMobile } from "@/components/mobile/MobileProvider";

/**
 * Returns true if the viewport is <= 768px (mobile), false otherwise.
 *
 * SSR strategy: the initial value is **seeded from the request User-Agent**
 * (via {@link useInitialIsMobile}, populated by `MobileProvider` in the portal
 * layout), so the server render and the client's first paint already match the
 * device — a phone paints the mobile shell immediately, with no flash and no
 * hydration mismatch. After mount, `matchMedia` becomes authoritative and refines
 * the value (handles desktop window resize and tablet/UA edge cases). Outside a
 * provider the seed defaults to false (desktop).
 */
export function useIsMobile(): boolean {
  const seed = useInitialIsMobile();
  const [isMobile, setIsMobile] = useState<boolean>(seed);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
