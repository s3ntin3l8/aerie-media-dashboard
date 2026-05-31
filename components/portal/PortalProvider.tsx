"use client";
// ============================================================
// AERIE — portal UI state (theme, role-preview, command palette,
// keyboard shortcuts). Real role comes from auth later; the
// admin "preview as member" toggle flips it client-side.
// ============================================================
import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

type Theme = "dark" | "light";

interface PortalState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** real role of the signed-in user (from auth, later) */
  realRole: Role;
  /** effective role after admin "preview as member" toggle */
  role: Role;
  toggleRole: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal must be used within <PortalProvider>");
  return v;
}

const NAV: Record<string, string> = {
  h: "/",
  s: "/services",
  r: "/requests",
  u: "/status",
  a: "/admin",
};

export function PortalProvider({ realRole = "admin", children }: { realRole?: Role; children: React.ReactNode }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("dark");
  const [role, setRole] = useState<Role>(realRole);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore persisted theme on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aerie.theme") as Theme | null;
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Keep <html class="dark"> + storage in sync with theme.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("aerie.theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const toggleRole = () => setRole((r) => (r === "admin" ? "user" : "admin"));

  // Keyboard shortcuts: ⌘K palette, ⌘D theme, g-then-key navigate, Esc close.
  useEffect(() => {
    let gPending = false;
    let gT: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
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
    <Ctx.Provider value={{ theme, setTheme, toggleTheme, realRole, role, toggleRole, paletteOpen, setPaletteOpen }}>
      {children}
    </Ctx.Provider>
  );
}
