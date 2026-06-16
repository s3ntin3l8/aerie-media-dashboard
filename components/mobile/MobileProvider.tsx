"use client";
// Seeds the mobile/desktop decision with a server-computed value (from the request
// User-Agent) so the very first paint is device-correct. `useIsMobile()` reads this as
// its initial state, then refines via matchMedia after mount. The hook deliberately does
// NOT throw outside a provider (defaults to false/desktop), so standalone consumers and
// existing tests keep working.
import React, { createContext, useContext } from "react";

const InitialIsMobileCtx = createContext<boolean>(false);

export function MobileProvider({
  initialIsMobile,
  children,
}: {
  initialIsMobile: boolean;
  children: React.ReactNode;
}) {
  return <InitialIsMobileCtx.Provider value={initialIsMobile}>{children}</InitialIsMobileCtx.Provider>;
}

/** First-render seed (UA-derived on the server). Falls back to false outside a provider. */
export function useInitialIsMobile(): boolean {
  return useContext(InitialIsMobileCtx);
}
