// ============================================================
// AERIE — modals: ServiceForm (add/edit) + RequestModal (request/review)
// Shared ModalShell + form primitives, built on Sanctuary tokens.
// Exposes: ModalShell, Field, Toggle, CatPicker, SectionLabel,
//          ServiceModal, RequestModal
// ============================================================

// ── Overlay + centered card. Mirrors CommandPalette's scrim. ──
function ModalShell({ open, onClose, icon, accent = 'var(--primary)', title, sub, children, footer, width = 600 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'color-mix(in srgb, var(--inverse-surface) 48%, transparent)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '7vh', paddingBottom: '7vh' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 18, boxShadow: 'var(--shadow-2xl)', overflow: 'hidden', animation: 'modalIn .22s cubic-bezier(.2,.7,.2,1) both' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '18px 20px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
          {icon && <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 14%, transparent)` }}><Icon name={icon} size={21} color={accent} /></div>}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em', color: 'var(--on-surface)', lineHeight: 1.15 }}>{title}</h2>
            {sub && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 7, marginTop: -2, marginRight: -4 }} title="Close (esc)"><Icon name="close" size={18} /></button>
        </div>
        {/* body */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {/* footer */}
        {footer && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--outline-variant)', background: 'color-mix(in srgb, var(--surface-container) 45%, transparent)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Section label inside a modal body ──
function SectionLabel({ children, hint, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12, ...style }}>
      <Eyebrow style={{ color: 'var(--primary)' }}>{children}</Eyebrow>
      {hint && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{hint}</span>}
    </div>
  );
}

// ── Labelled field wrapper ──
function Field({ label, hint, children, full, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : 'auto', minWidth: 0, ...style }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 700, color: 'var(--on-surface)' }}>{label}</span>
        {hint && <span style={{ fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// ── Pill switch (scaled-up version of the AdminVisibility toggle) ──
function Toggle({ on, onChange, color = 'var(--originator-own)', size = 'md' }) {
  const W = size === 'sm' ? 30 : 38, H = size === 'sm' ? 18 : 22, K = H - 4;
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
      style={{ width: W, height: H, borderRadius: 9999, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0,
        background: on ? color : 'color-mix(in srgb, var(--on-surface-variant) 24%, transparent)', transition: 'background .16s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? W - K - 2 : 2, width: K, height: K, borderRadius: 9999, background: on ? 'var(--surface-container-lowest)' : 'var(--on-surface-variant)', transition: 'left .16s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}></span>
    </button>
  );
}

// ── Toggle laid out as a full row with label + description ──
function ToggleRow({ on, onChange, title, desc, color, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 11, border: '1px solid var(--outline-variant)', background: on ? 'color-mix(in srgb, ' + (color || 'var(--originator-own)') + ' 7%, transparent)' : 'var(--surface-container-lowest)', transition: 'background .16s' }}>
      {icon && <Icon name={icon} size={18} color={on ? (color || 'var(--originator-own)') : 'var(--on-surface-variant)'} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--on-surface)' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 1 }}>{desc}</div>}
      </div>
      <Toggle on={on} onChange={onChange} color={color} />
    </div>
  );
}

// ── Category picker — selectable cat chips tinted to each token ──
function CatPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {Object.keys(window.CAT).map(k => {
        const c = catColor(k), sel = value === k, meta = window.CAT[k];
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              border: '1px solid ' + (sel ? `color-mix(in srgb, ${c} 55%, transparent)` : 'var(--outline-variant)'),
              background: sel ? `color-mix(in srgb, ${c} 14%, transparent)` : 'transparent',
              color: sel ? c : 'var(--on-surface-variant)', transition: 'all .14s' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: c }}></span>{meta.label}
          </button>
        );
      })}
    </div>
  );
}

// Shared input style tweak: slightly tighter than .input default. minWidth:0 lets
// inputs shrink to their grid track instead of overflowing into the next column.
const fieldInput = { fontSize: 13, padding: '9px 12px', minWidth: 0, boxSizing: 'border-box' };

Object.assign(window, { ModalShell, SectionLabel, Field, Toggle, ToggleRow, CatPicker, fieldInput });
