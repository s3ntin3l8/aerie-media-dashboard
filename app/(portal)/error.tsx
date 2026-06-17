"use client";

// Portal shell error boundary — catches unhandled errors inside the authenticated
// layout. Displays a minimal, token-styled recovery prompt.
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
        color: "var(--on-surface-variant)",
        fontFamily: "var(--font-mono)",
        gap: 20,
      }}
    >
      <p style={{ fontSize: 13, margin: 0 }}>
        Something went wrong.
        {error.digest ? (
          <>
            {" "}
            <span style={{ opacity: 0.5 }}>({error.digest})</span>
          </>
        ) : null}
      </p>
      <button
        onClick={reset}
        style={{
          fontFamily: "inherit",
          fontSize: 11,
          padding: "6px 16px",
          border: "1px solid currentColor",
          borderRadius: 4,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </section>
  );
}
