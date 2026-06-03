"use client";
// ============================================================
// AERIE — Login
// Three modes, decided server-side (app/login/page.tsx):
//   • "oidc"        → single "Continue with <provider>" button
//   • "credentials" → email + password sign-in (local accounts)
//   • "setup"       → first-run "create admin account" form
// ============================================================
import React, { useActionState, useState } from "react";
import { Icon, Eyebrow } from "@/components/primitives";
import { getGreeting } from "@/lib/greeting";
import type { LoginState } from "@/app/login/actions";

type Mode = "oidc" | "credentials" | "setup";

// ── AerieMark ────────────────────────────────────────────────
// Circular disc with a cyan glow radial gradient + ridge SVG.
function AerieMark({ size = 66 }: { size?: number }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size }}>
      {/* Glow layer */}
      <div
        style={{
          position: "absolute",
          inset: -size * 0.35,
          borderRadius: "50%",
          background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 70%)",
          filter: `blur(${Math.round(size * 0.25)}px)`,
          pointerEvents: "none",
        }}
      />
      {/* Disc SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden
        focusable="false"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Disc background */}
        <circle
          cx={60}
          cy={60}
          r={56}
          fill="color-mix(in srgb, var(--primary) 9%, var(--surface-container-lowest))"
          stroke="color-mix(in srgb, var(--primary) 38%, transparent)"
          strokeWidth={1.5}
        />
        {/* Back ridge */}
        <polyline
          points="60,74 82,48 102,80"
          stroke="var(--primary)"
          strokeWidth={7.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.5}
        />
        {/* Front ridge */}
        <polyline
          points="20,84 52,38 73,66"
          stroke="var(--primary)"
          strokeWidth={7.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────
function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--on-surface-variant)",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        {...props}
        style={{
          width: "100%",
          padding: "13px 14px",
          fontSize: 14,
          borderRadius: 10,
          border: "1px solid var(--outline-variant)",
          background: "var(--surface-container-lowest)",
          color: "var(--on-surface)",
          outline: "none",
          boxSizing: "border-box",
          // focus ring handled via global .aerie-login-input:focus
        }}
        className="aerie-login-input"
      />
    </label>
  );
}

// ── ErrorNote ─────────────────────────────────────────────────
function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 14,
        border: "1px solid color-mix(in srgb, var(--error) 35%, transparent)",
        background: "color-mix(in srgb, var(--error) 10%, transparent)",
      }}
    >
      <Icon name="error" size={15} color="var(--error)" />
      <span style={{ fontSize: 12.5, color: "var(--error)" }}>{error}</span>
    </div>
  );
}

// ── Ridgeline motif (decorative bottom of screen) ─────────────
function RidglineDecor() {
  return (
    <svg
      viewBox="0 0 402 180"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: 200,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <path
        d="M0,180 L0,118 L66,64 L120,110 L188,40 L250,104 L320,58 L402,116 L402,180 Z"
        fill="color-mix(in srgb, var(--primary) 7%, transparent)"
      />
      <path
        d="M0,180 L0,150 L54,108 L132,150 L210,96 L286,146 L356,110 L402,144 L402,180 Z"
        fill="color-mix(in srgb, var(--primary) 11%, transparent)"
      />
    </svg>
  );
}

// ── Login (main export) ───────────────────────────────────────
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

  const { greet } = getGreeting();

  return (
    <div
      className="aerie-mobile-login"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        padding: "40px 20px 60px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative ridgeline at the bottom */}
      <RidglineDecor />

      {/* Content (above the decor) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Brand section */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <AerieMark size={66} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.30em",
                color: "var(--on-surface)",
              }}
            >
              AERIE
            </span>
            <Eyebrow color="var(--on-surface-variant)">Media Command Center</Eyebrow>
          </div>
        </div>

        {/* Greeting */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-headline)",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: "-0.02em",
              color: "var(--on-surface)",
              margin: 0,
            }}
          >
            {greet}.
          </h1>
          <p
            suppressHydrationWarning
            style={{
              fontSize: 13.5,
              color: "var(--on-surface-variant)",
              marginTop: 6,
              margin: "6px 0 0",
            }}
          >
            Sign in to your media portal
          </p>
        </div>

        {/* Auth card */}
        <div
          style={{
            width: "100%",
            background: "color-mix(in srgb, var(--surface-container) 92%, transparent)",
            border: "1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)",
            borderRadius: 20,
            padding: 22,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          {/* OIDC mode */}
          {mode === "oidc" && (
            <>
              <form action={oidcSignIn} style={{ width: "100%" }} onSubmit={() => setPhase("redirecting")}>
                <button
                  type="submit"
                  disabled={phase === "redirecting"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    padding: "15px 18px",
                    borderRadius: 12,
                    border: "none",
                    background: "var(--primary)",
                    color: "var(--on-primary)",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: phase === "redirecting" ? "default" : "pointer",
                    opacity: phase === "redirecting" ? 0.75 : 1,
                    transition: "opacity 0.15s",
                    boxSizing: "border-box",
                  }}
                >
                  {phase === "redirecting" ? (
                    <>
                      <Icon name="sync" size={18} color="var(--on-primary)" style={{ animation: "aerieSpin 1s linear infinite" }} />
                      Redirecting…
                    </>
                  ) : (
                    <>
                      <Icon name={providerIcon} size={19} color="var(--on-primary)" fill />
                      Continue with {providerName}
                    </>
                  )}
                </button>
              </form>
              <p
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--on-surface-variant)",
                  marginTop: 16,
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                Access to AERIE is managed through single sign-on. Speak to your admin for an invite.
              </p>
            </>
          )}

          {/* Credentials mode */}
          {mode === "credentials" && (
            <form action={credAction} style={{ width: "100%" }}>
              <ErrorNote error={credState.error} />
              <Field label="Email" name="email" type="email" autoComplete="username" required />
              <Field label="Password" name="password" type="password" autoComplete="current-password" required />
              <button
                type="submit"
                disabled={credPending}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "13px 20px",
                  fontSize: 14,
                  marginTop: 4,
                  opacity: credPending ? 0.7 : 1,
                }}
              >
                <Icon name={credPending ? "sync" : "login"} size={18} style={credPending ? { animation: "aerieSpin 1s linear infinite" } : undefined} />
                Sign in
              </button>
            </form>
          )}

          {/* Setup mode */}
          {mode === "setup" && (
            <form action={setupAction} style={{ width: "100%" }}>
              <ErrorNote error={setupState.error} />
              <Field label="Display name" name="name" type="text" autoComplete="name" required />
              <Field label="Email" name="email" type="email" autoComplete="username" required />
              <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              <button
                type="submit"
                disabled={setupPending}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "13px 20px",
                  fontSize: 14,
                  marginTop: 4,
                  opacity: setupPending ? 0.7 : 1,
                }}
              >
                <Icon name={setupPending ? "sync" : "person_add"} size={18} style={setupPending ? { animation: "aerieSpin 1s linear infinite" } : undefined} />
                Create admin account
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginTop: 20,
            color: "var(--on-surface-variant)",
            fontSize: 11.5,
          }}
        >
          <Icon name="lock" size={14} color="var(--originator-own)" />
          Self-hosted · Secured by SSO
        </div>
      </div>
    </div>
  );
}
