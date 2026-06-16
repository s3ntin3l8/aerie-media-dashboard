"use client";

import { useEffect } from "react";

// Registers the minimal service worker (public/sw.js) so the portal qualifies
// as an installable PWA. Renders nothing; no offline caching is performed.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration is best-effort; a failure must never break the app.
    });
  }, []);

  return null;
}
