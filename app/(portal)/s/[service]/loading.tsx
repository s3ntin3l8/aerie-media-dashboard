export default function ServiceLoading() {
  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ height: 56, flexShrink: 0, borderBottom: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>Loading…</span>
      </div>
    </section>
  );
}
