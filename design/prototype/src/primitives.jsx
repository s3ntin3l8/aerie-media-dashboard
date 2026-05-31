// ============================================================
// AERIE — shared primitives (Sanctuary DNA + media extensions)
// Exposes: Icon, Btn, Pill, Chip, Eyebrow, Divider, RailTip, Kbd,
//          HealthDots, Sparkline, Heartbeat, PosterTile, CatBadge,
//          ProgressBar, Equalizer, StatusDot, Avatar, catColor
// ============================================================
const { useState, useRef, useEffect, useMemo } = React;

function catColor(cat) { return (window.CAT[cat] || window.CAT.infra).token; }

// Material Symbol icon
function Icon({ name, size = 20, fill = false, weight = 400, color, style, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size, width: size, height: size, color, flexShrink: 0,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
    >{name}</span>
  );
}

function Btn({ variant = 'primary', size = 'md', children, icon, iconRight, onClick, disabled, style, title }) {
  const cls = `btn ${variant === 'tonal' ? 'btn-tonal' : `btn-${variant}`} ${size === 'sm' ? 'btn-sm' : size === 'xs' ? 'btn-xs' : ''}`;
  return (
    <button className={cls} onClick={onClick} disabled={disabled} style={style} title={title}>
      {icon && <Icon name={icon} size={size === 'md' ? 16 : 14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'md' ? 16 : 14} />}
    </button>
  );
}

// Pill — tone is a token name OR a raw color via rawColor
function Pill({ children, tone = 'primary', rawColor, style }) {
  const c = rawColor || `var(--${tone})`;
  return (
    <span className="pill" style={{ color: c, background: `color-mix(in srgb, ${c} 13%, transparent)`, borderColor: `color-mix(in srgb, ${c} 28%, transparent)`, ...style }}>{children}</span>
  );
}

function Chip({ children, icon, style }) {
  return <span className="chip" style={style}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

function Eyebrow({ children, color, style }) {
  return <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: color || 'var(--on-surface-variant)', ...style }}>{children}</div>;
}

function Divider({ style }) { return <div style={{ height: 1, background: 'var(--outline-variant)', ...style }}></div>; }
function Kbd({ children, style }) { return <span className="kbd" style={style}>{children}</span>; }

// Health dots — reframed significance cluster. tier: ok | warn | crit | off
function HealthDots({ tier = 'ok', size = 6 }) {
  const fill = { ok: 3, warn: 2, crit: 1, off: 0 }[tier];
  const col = tier === 'crit' ? 'var(--error)' : tier === 'warn' ? 'var(--amber)' : tier === 'off' ? 'var(--outline-variant)' : 'var(--originator-own)';
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[0,1,2].map(i => <span key={i} style={{ width: size, height: size, borderRadius: 9999, background: i < fill ? col : 'color-mix(in srgb, var(--outline-variant) 45%, transparent)' }}></span>)}
    </span>
  );
}

// Pulsing status dot
function StatusDot({ status = 'up', size = 8 }) {
  const col = status === 'down' ? 'var(--error)' : status === 'degraded' ? 'var(--amber)' : 'var(--originator-own)';
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      {status !== 'down' && <span style={{ position: 'absolute', inset: 0, borderRadius: 9999, background: col, animation: 'aeriePulse 2.4s ease-out infinite' }}></span>}
      <span style={{ position: 'relative', width: size, height: size, borderRadius: 9999, background: col }}></span>
    </span>
  );
}

// Heartbeat bars (Gatus-style) — array of 0/0.5/1
function Heartbeat({ beats, h = 22, barW = 4, gap = 2 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap }}>
      {beats.map((b, i) => {
        const col = b === 0 ? 'var(--error)' : b === 0.5 ? 'var(--amber)' : 'var(--originator-own)';
        return <span key={i} title={b === 0 ? 'down' : b === 0.5 ? 'degraded' : 'up'} style={{ width: barW, height: b === 0 ? h : b === 0.5 ? h * 0.62 : h, background: col, opacity: b === 0 ? 0.9 : 0.85, borderRadius: 1.5 }}></span>;
      })}
    </span>
  );
}

// SVG sparkline from numeric series
function Sparkline({ data, w = 120, h = 28, color = 'var(--primary)', fill = true, strokeW = 1.5 }) {
  const { line, area } = useMemo(() => {
    const max = Math.max(...data, 1), min = Math.min(...data, 0);
    const span = max - min || 1;
    const pts = data.map((v, i) => [ (i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4) ]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${w} ${h} L0 ${h} Z`;
    return { line, area };
  }, [data, w, h]);
  const gid = useMemo(() => 'sg' + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.22" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Animated mini equalizer (for now-playing audio/active streams)
function Equalizer({ color = 'var(--primary)', active = true, bars = 4, h = 13 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: h }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} style={{ width: 2.5, height: active ? h : 3, background: color, borderRadius: 2,
          transformOrigin: 'bottom', animation: active ? `aerieEq 0.9s ease-in-out ${i * 0.13}s infinite` : 'none' }}></span>
      ))}
    </span>
  );
}

// Progress bar
function ProgressBar({ pct, color = 'var(--primary)', h = 4, track = 'color-mix(in srgb, var(--on-surface-variant) 18%, transparent)' }) {
  return (
    <div style={{ height: h, borderRadius: 9999, background: track, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', borderRadius: 9999, background: color, transition: 'width .4s linear' }}></div>
    </div>
  );
}

// Poster placeholder — flat category-tinted block + glyph (restrained imagery)
function PosterTile({ title, kind = 'movie', cat = 'stream', w = 56, ratio = 1.5, rounded = 8 }) {
  const c = catColor(cat);
  const glyph = kind === 'series' ? 'live_tv' : kind === 'track' ? 'album' : 'movie';
  return (
    <div style={{ width: w, height: w * ratio, borderRadius: rounded, flexShrink: 0, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, color-mix(in srgb, ${c} 26%, var(--surface-container)) 0%, var(--surface-container-high) 100%)`,
      border: '1px solid color-mix(in srgb, var(--outline-variant) 70%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={glyph} size={Math.round(w * 0.42)} color={`color-mix(in srgb, ${c} 75%, var(--on-surface-variant))`} />
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }}></span>
    </div>
  );
}

function CatBadge({ cat, size = 'sm' }) {
  const c = catColor(cat); const meta = window.CAT[cat] || window.CAT.infra;
  return <Pill rawColor={c} style={size === 'xs' ? { fontSize: 9, padding: '1px 6px' } : null}>{meta.label}</Pill>;
}

function Avatar({ name, size = 28, color = 'var(--primary)', you = false }) {
  const initials = name ? name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() : '?';
  return (
    <div style={{ width: size, height: size, borderRadius: 9999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: size * 0.4, letterSpacing: '0.02em',
      background: `color-mix(in srgb, ${color} ${you ? 22 : 16}%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}>
      {initials}
    </div>
  );
}

// Standardized search field — one shell for filters (input) and palette triggers (button).
// Built on the `.input` class so focus/border/placeholder match the rest of the app.
function SearchField({ value, onChange, placeholder = 'Search…', width = 240, kbd, asButton = false, onClick, icon = 'search' }) {
  const H = 38;
  const wrap = { position: 'relative', display: 'inline-flex', alignItems: 'center', width };
  const lead = <Icon name={icon} size={16} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />;
  const padRight = kbd ? 44 : 12;

  if (asButton) {
    return (
      <button onClick={onClick} className="input" style={{ ...wrap, height: H, boxSizing: 'border-box', paddingTop: 0, paddingBottom: 0, paddingLeft: 34, paddingRight: padRight, textAlign: 'left',
        color: 'var(--on-surface-variant)', cursor: 'pointer', background: 'var(--surface-container-low)' }}>
        {lead}
        <span style={{ flex: 1, fontSize: 13 }}>{placeholder}</span>
        {kbd && <Kbd style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)' }}>{kbd}</Kbd>}
      </button>
    );
  }
  return (
    <div style={wrap}>
      {lead}
      <input className="input" value={value} onChange={onChange ? (e => onChange(e.target.value)) : undefined}
        placeholder={placeholder} style={{ height: H, boxSizing: 'border-box', paddingTop: 0, paddingBottom: 0, paddingLeft: 34, paddingRight: padRight, fontSize: 13 }} />
      {kbd && <Kbd style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>{kbd}</Kbd>}
    </div>
  );
}

// Rail tooltip
function RailTip({ label, children, kbd, side = 'right' }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{ position: 'absolute', left: side === 'right' ? 50 : 'auto', right: side === 'left' ? 50 : 'auto', top: '50%', transform: 'translateY(-50%)',
          padding: '6px 10px', background: 'var(--surface-container-highest)', color: 'var(--on-surface)', fontSize: 11, fontWeight: 500,
          borderRadius: 6, border: '1px solid var(--outline-variant)', boxShadow: 'var(--shadow-lg)', whiteSpace: 'nowrap', zIndex: 200, pointerEvents: 'none' }}>
          {label}{kbd && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.6, marginLeft: 6 }}>{kbd}</span>}
        </span>
      )}
    </div>
  );
}

Object.assign(window, { catColor, Icon, Btn, Pill, Chip, Eyebrow, Divider, Kbd, HealthDots, StatusDot, Heartbeat, Sparkline, Equalizer, ProgressBar, PosterTile, CatBadge, Avatar, RailTip, SearchField });
