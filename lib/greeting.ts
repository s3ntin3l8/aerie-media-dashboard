// ============================================================
// AERIE — time-of-day greeting helper
// ------------------------------------------------------------
// Extracted from components/views/Home.tsx GreetingHeader.
// Used by GreetingHeader, MobileHome screen, and Login view.
// Note: always render the output with suppressHydrationWarning —
// server and client may disagree on the current hour.
// ============================================================

export interface Greeting {
  /** e.g. "Good afternoon" */
  greet: string;
  /** e.g. "Tuesday, June 3" */
  date: string;
}

export function getGreeting(now: Date = new Date()): Greeting {
  const hour = now.getHours();
  const greet =
    hour < 5
      ? "Good night"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return { greet, date };
}
