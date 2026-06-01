"use client";
// ============================================================
// AERIE — Login
// Three modes, decided server-side (app/login/page.tsx):
//   • "oidc"        → single "Continue with <provider>" button
//   • "credentials" → email + password sign-in (local accounts)
//   • "setup"       → first-run "create admin account" form
// ============================================================
import React, { useActionState, useState } from "react";
import { Icon, Eyebrow, Heartbeat } from "@/components/primitives";
import { BrandBadge } from "@/components/portal/Rail";
import type { LoginState } from "@/app/login/actions";

type Mode = "oidc" | "credentials" | "setup";

// Decorative heartbeat for the brand panel (no longer sourced from mock data).
const DECOR_BEATS = [1, 1, 2, 1, 3, 2, 1, 1, 2, 4, 2, 1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 3, 1, 1, 2, 1, 1, 2, 1, 1];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  fontSize: 14,
  borderRadius: 10,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--on-surface-variant)",
  marginBottom: 6,
  display: "block",
};

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={labelStyle}>{label}</span>
      <input {...props} style={inputStyle} />
    </label>
  );
}

function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, marginBottom: 14, border: "1px solid color-mix(in srgb, var(--error) 35%, transparent)", background: "color-mix(in srgb, var(--error) 10%, transparent)" }}>
      <Icon name="error" size={15} color="var(--error)" />
      <span style={{ fontSize: 12.5, color: "var(--error)" }}>{error}</span>
    </div>
  );
}

export function Login({
  mode,
  providerName,
  providerIcon,
  oidcSignIn,
  signInWithPassword,
  createInitialAdmin,
}: {
  mode: Mode;
  providerName: string;
  providerIcon: string;
  oidcSignIn?: () => Promise<void>;
  signInWithPassword: (prev: LoginState, fd: FormData) => Promise<LoginState>;
  createInitialAdmin: (prev: LoginState, fd: FormData) => Promise<LoginState>;
}) {
  const [phase, setPhase] = useState<"idle" | "redirecting">("idle");
  const [credState, credAction, credPending] = useActionState(signInWithPassword, {});
  const [setupState, setupAction, setupPending] = useActionState(createInitialAdmin, {});

  const heading = mode === "setup" ? "Set up AERIE" : "Sign in to AERIE";
  const subtitle =
    phase === "redirecting"
      ? `Redirecting to ${providerName}…`
      : mode === "oidc"
        ? "Authentication is handled by your identity provider."
        : mode === "setup"
          ? "Create the first administrator account to get started."
          : "Sign in with your AERIE account.";

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
            Streaming, requests, automation and monitoring — unified behind a single secure door.
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>Self-hosted · behind Traefik</span>
        </div>

        <div style={{ position: "absolute", right: -40, bottom: 40, opacity: 0.06, transform: "scale(2.4)", transformOrigin: "bottom right", zIndex: 1 }}>
          <Heartbeat beats={DECOR_BEATS} h={60} barW={8} gap={4} />
        </div>
      </div>

      {/* Right: auth handoff */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 28 }}>
            <div style={{ position: "relative", width: 64, height: 64, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18, background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
              <Icon name={phase === "redirecting" ? "sync" : mode === "setup" ? "person_add" : "shield_person"} size={30} color="var(--primary)" style={phase === "redirecting" ? { animation: "aerieSpin 1s linear infinite" } : undefined} />
            </div>
            <h2 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 21, color: "var(--on-surface)" }}>{heading}</h2>
            <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 6 }}>{subtitle}</p>
          </div>

          {mode === "oidc" && (
            <form action={oidcSignIn} style={{ width: "100%" }} onSubmit={() => setPhase("redirecting")}>
              <button type="submit" disabled={phase === "redirecting"} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 14, opacity: phase === "redirecting" ? 0.7 : 1 }}>
                <Icon name={providerIcon} size={18} /> Continue with {providerName}
              </button>
            </form>
          )}

          {mode === "credentials" && (
            <form action={credAction} style={{ width: "100%" }}>
              <ErrorNote error={credState.error} />
              <Field label="Email" name="email" type="email" autoComplete="username" required />
              <Field label="Password" name="password" type="password" autoComplete="current-password" required />
              <button type="submit" disabled={credPending} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 14, marginTop: 4, opacity: credPending ? 0.7 : 1 }}>
                <Icon name={credPending ? "sync" : "login"} size={18} style={credPending ? { animation: "aerieSpin 1s linear infinite" } : undefined} /> Sign in
              </button>
            </form>
          )}

          {mode === "setup" && (
            <form action={setupAction} style={{ width: "100%" }}>
              <ErrorNote error={setupState.error} />
              <Field label="Display name" name="name" type="text" autoComplete="name" required />
              <Field label="Email" name="email" type="email" autoComplete="username" required />
              <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              <button type="submit" disabled={setupPending} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px 20px", fontSize: 14, marginTop: 4, opacity: setupPending ? 0.7 : 1 }}>
                <Icon name={setupPending ? "sync" : "person_add"} size={18} style={setupPending ? { animation: "aerieSpin 1s linear infinite" } : undefined} /> Create admin account
              </button>
            </form>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--outline-variant)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
              {mode === "oidc" ? "OIDC · PKCE" : "AERIE · local account"}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--outline-variant)" }} />
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "var(--on-surface-variant)", marginTop: 20 }}>
            {mode === "oidc"
              ? "Access is managed by your identity provider."
              : mode === "setup"
                ? "This account has full administrator access."
                : "Contact your administrator if you can't sign in."}
          </p>
        </div>
      </div>
    </div>
  );
}
