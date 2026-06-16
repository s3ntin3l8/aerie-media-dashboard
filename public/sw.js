// Minimal AERIE service worker — no offline caching.
// Its sole purpose is to satisfy the browser's "installable PWA" check (a
// registered SW with a fetch handler). Requests pass straight through to the
// network; a live-data dashboard behind auth is intentionally not cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Intentionally empty: defer to the network for every request.
});
