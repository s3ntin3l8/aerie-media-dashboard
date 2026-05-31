"use client";
// ============================================================
// AERIE — Login (Authentik OIDC handoff)
// Mock-phase: the button simulates the redirect, then lands on
// the dashboard. Real OIDC (Auth.js → Authentik) is wired later.
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Eyebrow, Heartbeat } from "@/components/primitives";
import { BrandBadge } from "@/components/portal/Rail";
import { SERVICES } from "@/lib/mock/data";

export function Login({ configured = false, signInAction }: { configured?: boolean; signInAction?: () => Promise<void> }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "redirecting">("idle");
  // Dev/mock mode: simulate the redirect, then land on the dashboard.
  const go = () => {
    setPhase("redirecting");
    setTimeout(() => router.push("/"), 1400);
  };

  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--background)", overflow: "hidden" }}>
      {/* Left: brand panel */}
      <div
        style={{
          flex: "0 0 46%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          background: "var(--surface-container-lowest)",
          borderRight: "1px solid var(--outline-variant)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 2 }}>
          <BrandBadge size={34} />
          <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 19, letterSpacing: "0.04em", color: "var(--on-surface)" }}>AERIE</span>
        </div>

        <div style={{ position: "relative", zIndex: 2 }}>
          <Eyebrow color="var(--primary)" style={{ marginBottom: 16 }}>
            Private Media Command Center
          </Eyebrow>
          <h1 style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 34, lineHeight: 1.12, letterSpacing: "-0.02em", color: "var(--on-surface)", maxWidth: 380 }}>
            Every service, one vantage point.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--on-surface-variant)", marginTop: 16, maxWidth: 360 }}>
            Streaming, requests, automation and monitoring — unified behind a single secure door. All access flows through your own identity provider.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
            {["Plex", "Jellyfin", "Overseerr", "Sonarr", "Radarr", "Tautulli", "Gatus"].map((n) => (
              <span key={n} style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "4px 10px", borderRadius: 9999, border: "1px solid var(--outline-variant)", color: "var(--on-surface-variant)", background: "var(--surface-container-low)" }}>
                {n}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative", zIndex: 2 }}>
          <Icon name="lock" size={14} color="var(--originator-own)" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>Self-hosted · behind Traefik + Authentik</span>
        </div>

        <div style={{ position: "absolute", right: -40, bottom: 40, opacity: 0.06, transform: "scale(2.4)", transformOrigin: "bottom right", zIndex: 1 }}>
          <Heartbeat beats={SERVICES[1].beats} h={60} barW={8} gap={4} />
        </div>
      </div>

      {/* Right: auth handoff */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 28 }}>
            <div style={{ position: "relative", width: 64, height: 64, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18, background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
              <Icon name={phase === "redirecting" ? "sync" : "shield_person"} size={30} color="var(--primary)" style={phase === "redirecting" ? { animation: "aerieSpin 1s linear infinite" } : undefined} />
            </div>
            <h2 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 21, color: "var(--on-surface)" }}>Sign in to AERIE</h2>
            <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 6 }}>
              {phase === "redirecting" ? "Redirecting to Authentik…" : "Authentication is handled by your identity provider."}
            </p>
          </div>

          {configured && signInAction ? (
            <form action={signInAction} style={{ width: "100%" }} onSubmit={() => setPhase("redirecting")}>
              <button type="submit" disabled={phase === "redirecting"} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 14, opacity: phase === "redirecting" ? 0.7 : 1 }}>
                <Icon name="shield_person" size={18} /> Continue with Authentik
              </button>
            </form>
          ) : (
            <button onClick={go} disabled={phase === "redirecting"} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 14, opacity: phase === "redirecting" ? 0.7 : 1 }}>
              <Icon name="shield_person" size={18} /> Continue with Authentik
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--outline-variant)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>OIDC · PKCE</span>
            <div style={{ flex: 1, height: 1, background: "var(--outline-variant)" }} />
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="info" size={14} color="var(--originator-court)" />
              <Eyebrow>What happens next</Eyebrow>
            </div>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                "Authentik verifies your identity (PKCE)",
                "Your groups claim derives your role",
                "You land on your role-aware dashboard",
              ].map((t, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--on-surface-variant)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary)" }}>
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "var(--on-surface-variant)", marginTop: 20 }}>No public sign-ups. Access is invite-only via Authentik.</p>
        </div>
      </div>
    </div>
  );
}
