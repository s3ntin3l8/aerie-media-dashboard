"use client";
// ============================================================
// AERIE — EmbedHost
// ------------------------------------------------------------
// Keeps the iframes of admin-flagged keep-alive services mounted across route
// changes so switching between services preserves their in-app state instead of
// reloading. Mounted ONCE in the persistent desktop shell (MobileShell's <main>),
// above the route `children`, so the iframe DOM nodes are never remounted — only
// their visibility toggles via `display:none` (which keeps the document, timers
// and sockets alive in every major browser; remount/reparent would reload).
//
// Lazy: a service's iframe mounts the first time it's opened, then stays alive.
// Desktop only — mobile uses a separate render path (MobilePortal).
// ============================================================
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useData } from "@/components/portal/DataProvider";
import { ServiceView } from "@/components/views/Launcher";
import { serviceIdFromPath, nextMountedIds } from "@/lib/embed/keepAlive";

export function EmbedHost() {
  // `services` is active-only (DataProvider chokepoint) and now carries `keepAlive`.
  const { services } = useData();
  const pathname = usePathname();
  const pathId = serviceIdFromPath(pathname);

  // Services whose embeds should persist: embeddable + admin-flagged keep-alive.
  const keepAlive = services.filter((s) => s.embeddable && s.keepAlive);
  const activeId = pathId && keepAlive.some((s) => s.id === pathId) ? pathId : null;

  // Lazy mount: an embed is added the first time it's opened, then kept. Prune ids that are no
  // longer keep-alive (flag turned off, service deactivated/deleted) so they tear down + reload next time.
  // `services` is a stable reference between polls (memoized in DataProvider), so this effect only
  // re-runs on navigation or an actual data change — not every render.
  const [mountedIds, setMountedIds] = useState<string[]>([]);
  useEffect(() => {
    const keepIds = services.filter((s) => s.embeddable && s.keepAlive).map((s) => s.id);
    setMountedIds((prev) => nextMountedIds(prev, keepIds, pathId));
  }, [pathId, services]);

  // Render the active embed on the SAME render it's first opened (the effect just persists it to
  // state) — avoids a one-frame blank before the iframe mounts.
  const renderIds = nextMountedIds(mountedIds, keepAlive.map((s) => s.id), activeId);

  // Hidden as a whole when not on a kept embed — an empty inset:0 layer would otherwise
  // capture clicks over Home/Status. The kept iframes inside stay alive regardless.
  return (
    <div style={{ position: "absolute", inset: 0, display: activeId ? "block" : "none" }}>
      {renderIds.map((id) => {
        const s = keepAlive.find((x) => x.id === id);
        if (!s) return null;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              inset: 0,
              display: id === activeId ? "flex" : "none",
              flexDirection: "column",
            }}
          >
            <ServiceView s={s} />
          </div>
        );
      })}
    </div>
  );
}
