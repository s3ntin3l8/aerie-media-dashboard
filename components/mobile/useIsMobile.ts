"use client";
import { useEffect, useState } from "react";

/**
 * Returns true if the viewport is <= 768px (mobile), false if desktop,
 * or null while the first measurement is pending (SSR / before mount).
 * Return null on first render to avoid hydration mismatches — render a
 * neutral frame while null.
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
