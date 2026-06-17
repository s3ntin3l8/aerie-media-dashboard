"use client";

// Root-level error boundary — catches errors thrown by app/layout.tsx itself.
// Must render its own <html> and <body> since the root layout is bypassed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          fontFamily: "monospace",
          background: "var(--surface, #0b1326)",
          color: "var(--on-surface-variant, #a8b5cc)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <p style={{ fontSize: 13, marginBottom: 20 }}>
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
        </div>
      </body>
    </html>
  );
}
