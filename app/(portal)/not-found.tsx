import Link from "next/link";

// 404 page for the authenticated portal — shown for unknown routes inside the shell.
export default function PortalNotFound() {
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
      <p style={{ fontSize: 13, margin: 0 }}>Page not found.</p>
      <Link
        href="/"
        style={{
          fontFamily: "inherit",
          fontSize: 11,
          padding: "6px 16px",
          border: "1px solid currentColor",
          borderRadius: 4,
          color: "inherit",
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </section>
  );
}
