import Link from "next/link";

// Themed "Page not found" shared by the desktop 404 (app/(portal)/not-found.tsx) and the mobile
// shell, which picks its screen from the pathname and so can't rely on Next's notFound() boundary.
export function PortalNotFound() {
  return (
    <section
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        background: "var(--surface)",
        color: "var(--on-surface-variant)",
        fontFamily: "var(--font-mono)",
        gap: 20,
      }}
    >
      <h1 style={{ fontSize: 13, fontWeight: 400, fontFamily: "inherit", color: "inherit", margin: 0 }}>Page not found.</h1>
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
