"use client";
// ============================================================
// AERIE — portal UI state (theme, role-preview, command palette,
// keyboard shortcuts). Real role comes from auth later; the
// admin "preview as member" toggle flips it client-side.
// ============================================================
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { AppUser, Role, DashboardStore } from "@/lib/types";
import { signOutAction, setFavoritesAction } from "@/app/(portal)/actions";
import { NAV_ITEMS } from "@/lib/nav";

type Theme = "dark" | "light";

interface PortalState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** the signed-in user (real session or dev mock) */
  user: AppUser;
  /** true when real OIDC is configured (vs. local-credentials mode) */
  oidc: boolean;
  /** real role of the signed-in user */
  realRole: Role;
  /** effective role after admin "preview as member" toggle */
  role: Role;
  toggleRole: () => void;
  /** the signed-in user's saved per-role dashboard layouts + mobile overlay (null when none stored).
   *  Seeded server-side so desktop Home and the mobile dashboard read one source. */
  initialDashboards: DashboardStore | null;
  /** pinned-favorite service ids (rail quick-launch) */
  favorites: string[];
  /** pin/unpin a service; persists to the DB optimistically */
  toggleFavorite: (id: string) => void;
  /** id of the most-recently-opened service (rail jump-back slot), or null */
  lastOpened: string | null;
  /** ids of keep-alive embeds currently mounted/live in EmbedHost (desktop only; [] on mobile) */
  keptAliveIds: string[];
  /** EmbedHost writes the live keep-alive set here so the rail / status / launcher can read it */
  setKeptAliveIds: React.Dispatch<React.SetStateAction<string[]>>;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** true while any modal (service/request) is open — suppresses portal shortcuts */
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  signOut: () => void;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal must be used within <PortalProvider>");
  return v;
}

// Derive g-key → href map from the canonical NAV_ITEMS config.
const NAV: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.filter((item) => item.gKey).map((item) => [item.gKey!, item.href])
);

export function PortalProvider({ user, oidc = false, favorites: initialFavorites = [], initialDashboards = null, children }: { user: AppUser; oidc?: boolean; favorites?: string[]; initialDashboards?: DashboardStore | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const realRole = user.role;
  // SSR-safe default; the persisted theme is adopted on mount (see effect below), so the first
  // client render matches the server and the Rail's theme toggle doesn't hydrate-mismatch (React
  // #418). The inline pre-paint script (app/layout.tsx) owns the real <html> class, so no flash.
  const [theme, setTheme] = useState<Theme>("dark");
  const [role, setRole] = useState<Role>(realRole);
  const [favorites, setFavorites] = useState<string[]>(initialFavorites);
  // Null on the server + first client render (localStorage is client-only) so the Rail's jump-back
  // slot doesn't hydrate-mismatch; the stored value is adopted on mount (see effect below).
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [keptAliveIds, setKeptAliveIds] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Ref mirror so the (stable) keydown listener always sees the latest value.
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  // Adopt client-only persisted prefs (theme, last-opened service) AFTER mount. Reading them during
  // render would diverge from the server (which has no localStorage) and hydrate-mismatch the Rail
  // (React #418). The inline pre-paint script already applied the correct <html> class.
  useEffect(() => {
    try {
      const t = localStorage.getItem("aerie.theme");
      if (t === "dark" || t === "light") setTheme(t as Theme);
      const svc = localStorage.getItem("aerie.lastService");
      if (svc) setLastOpened(svc);
    } catch {
      /* ignore */
    }
  }, []);

  // Keep <html class="dark"> + storage in sync with theme. Skip the first run: the inline script
  // owns the initial class and the persisted theme is adopted above, so syncing on mount would
  // flash the default "dark" before adoption. Sync only on subsequent user toggles.
  const themeApplied = useRef(false);
  useEffect(() => {
    if (!themeApplied.current) {
      themeApplied.current = true;
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("aerie.theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Record the open whenever we land on a service page (/s/{id}). Navigating
  // away to Status/Requests intentionally leaves it set, so the rail keeps the
  // jump-back shortcut around.
  useEffect(() => {
    if (!pathname?.startsWith("/s/")) return;
    const id = pathname.slice(3).split("/")[0];
    if (!id) return;
    setLastOpened(id);
    try {
      localStorage.setItem("aerie.lastService", id);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  // Only a real admin may preview the member experience; members can't elevate.
  const toggleRole = () => {
    if (realRole !== "admin") return;
    setRole((r) => (r === "admin" ? "user" : "admin"));
  };
  const signOut = () => {
    void signOutAction();
  };
  // Optimistic pin/unpin; persist the full array to avoid server-side races.
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void setFavoritesAction(next);
      return next;
    });
  };

  // Keyboard shortcuts: ⌘K palette, ⌘D theme, g-then-key navigate, Esc close.
  useEffect(() => {
    let gPending = false;
    let gT: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      // A modal owns the keyboard while open (it handles its own Escape).
      if (modalOpenRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase() || "";
      const typing = tag === "input" || tag === "textarea";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      if (gPending) {
        gPending = false;
        clearTimeout(gT);
        const dest = NAV[e.key];
        if (dest) {
          router.push(dest);
          return;
        }
      }
      if (e.key === "g") {
        gPending = true;
        gT = setTimeout(() => (gPending = false), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <Ctx.Provider value={{ theme, setTheme, toggleTheme, user, oidc, realRole, role, toggleRole, initialDashboards, favorites, toggleFavorite, lastOpened, keptAliveIds, setKeptAliveIds, paletteOpen, setPaletteOpen, modalOpen, setModalOpen, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
