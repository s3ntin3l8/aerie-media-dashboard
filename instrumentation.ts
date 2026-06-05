// Next.js instrumentation hook — runs once when the server process starts.
//
// Prime the snapshot cache in the background so the first request after a
// deploy/restart serves warm data instead of paying the cold-upstream cost
// (notably Overseerr's request list, which is slow only when cold). The
// stale-while-revalidate cache then keeps every later load instant.
//
// Fire-and-forget and best-effort: we do NOT await getSnapshot here — that
// would delay server readiness by the cold-fetch time. A failed warm-up just
// means the first real request repopulates the cache as before.
export async function register(): Promise<void> {
  // Only the Node.js server runtime can run the data facade (DB + upstream HTTP);
  // skip the edge runtime, where server-only modules aren't available.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { getSnapshot } = await import("@/lib/data/snapshot");
    void getSnapshot().catch(() => {
      /* warm-up is best-effort; the first request will repopulate */
    });
  } catch {
    /* never let instrumentation crash the server */
  }
}
