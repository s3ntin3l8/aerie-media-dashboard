// ============================================================
// AERIE — dashboard panels
// PanelShell · NowPlaying · ServiceTiles · StatusPanel ·
// MyRequests · LibraryStats · RecentlyAdded · QueuePanel
// ============================================================

// shared ticking clock (seconds since load) for live progress
function useTick(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN(n => n + 1), ms); return () => clearInterval(t); }, [ms]);
  return Date.now();
}

function fmtTime(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function PanelShell({ title, eyebrow, icon, accent = 'var(--on-surface-variant)', count, action, children, style, bodyStyle, live }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px 11px', borderBottom: '1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {icon && <Icon name={icon} size={16} color={accent} />}
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--on-surface)', whiteSpace: 'nowrap' }}>{title}</h2>
          {live && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--error)' }}><StatusDot status="up" size={6} />LIVE</span>}
          {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{count}</span>}
        </div>
        {action}
      </header>
      <div style={{ flex: 1, ...bodyStyle }}>{children}</div>
    </section>
  );
}

const seeAll = (onClick) => (
  <a onClick={onClick} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>see all <Icon name="arrow_right_alt" size={14} /></a>
);

// ── NOW PLAYING ───────────────────────────────────────────
function NowPlayingPanel({ role, big, onAll }) {
  useTick(1000);
  const t0 = useRef(Date.now()).current;
  const elapsed = (Date.now() - t0) / 1000;
  let streams = window.NOW_PLAYING;
  if (role !== 'admin') streams = streams.filter(s => s.user === 'you'); // friends see only their own session
  const visible = role === 'admin' ? streams : (streams.length ? streams : []);
  return (
    <PanelShell title={role === 'admin' ? 'Now Playing' : 'Your Session'} icon="play_circle" accent="var(--primary)" live={visible.length > 0}
      count={role === 'admin' ? `${visible.length} active` : null} action={role === 'admin' ? seeAll(onAll) : null}>
      {visible.length === 0 ? (
        <Empty icon="play_disabled" line="Nothing playing" sub="Your active stream will appear here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((s, i) => {
            const svc = window.SERVICES.find(x => x.id === s.src);
            const cur = Math.min(s.dur * 60, s.pos * s.dur * 60 + (s.paused ? 0 : elapsed));
            const pct = (cur / (s.dur * 60)) * 100;
            const c = catColor('stream');
            const u = window.USERS.find(x => x.id === s.user);
            return (
              <div key={s.id} style={{ position: 'relative', display: 'flex', gap: 13, padding: big ? '15px 16px' : '12px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)' : 'none' }}>
                <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 9999, background: s.src === 'plex' ? 'var(--originator-third-party)' : 'var(--primary)' }}></span>
                <PosterTile title={s.title} kind={s.kind} cat="stream" w={big ? 50 : 42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: big ? 15 : 13.5, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    {s.paused ? <Icon name="pause_circle" size={14} color="var(--on-surface-variant)" /> : (s.kind === 'track' ? <Equalizer color={c} h={11} /> : null)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.ep || (s.kind === 'movie' ? s.year : '')}{s.ep || s.year ? ' · ' : ''}{s.device}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', minWidth: 38 }}>{fmtTime(cur)}</span>
                    <div style={{ flex: 1 }}><ProgressBar pct={pct} color={s.src === 'plex' ? 'var(--originator-third-party)' : 'var(--primary)'} /></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', minWidth: 38, textAlign: 'right' }}>{fmtTime(s.dur * 60)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {role === 'admin' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Avatar name={u ? u.name : s.user} size={16} color={s.src === 'plex' ? 'var(--originator-third-party)' : 'var(--primary)'} /><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface)' }}>{u ? u.name : s.user}</span></span>}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--on-surface-variant) 12%, transparent)', color: 'var(--on-surface-variant)' }}>{s.res}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                      background: `color-mix(in srgb, ${s.play === 'transcode' ? 'var(--amber)' : 'var(--originator-own)'} 14%, transparent)`,
                      color: s.play === 'transcode' ? 'var(--amber)' : 'var(--originator-own)' }}>{s.play === 'transcode' ? 'TRANSCODE' : 'DIRECT'}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{s.bitrate} Mbps · {s.codec}</span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--on-surface-variant)' }}><Icon name={svc.icon} size={12} color={catColor('stream')} />{svc.name}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}

// ── SERVICE TILES (3 styles: stripe | icon | list) ───────────
function ServiceTiles({ tileStyle = 'stripe', role, onOpen, onAll, services }) {
  let list = services || window.SERVICES;
  if (role !== 'admin') list = list.filter(s => s.cat !== 'infra' && s.id !== 'prometheus'); // RBAC: friends don't see infra/metrics
  const open = (s) => onOpen && onOpen(s);

  const Tile = ({ s }) => {
    const c = catColor(s.cat);
    return (
      <a onClick={() => open(s)} title={s.note}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, cursor: 'pointer', textDecoration: 'none',
          background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', transition: 'border-color .18s, transform .1s, box-shadow .18s', overflow: 'hidden' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${c} 55%, transparent)`; e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${c} 8%, transparent)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; e.currentTarget.style.boxShadow = 'none'; }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }}></span>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
            <Icon name={s.icon} size={20} color={c} />
          </div>
          <Icon name={s.embeddable ? 'open_in_full' : 'open_in_new'} size={14} color="var(--on-surface-variant)" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 13.5, color: 'var(--on-surface)' }}>{s.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <StatusDot status={s.status} size={6} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{s.status === 'up' ? `${s.uptime.toFixed(2)}%` : s.status === 'degraded' ? 'degraded' : 'down'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', marginLeft: 'auto' }}>{s.ms}ms</span>
          </div>
        </div>
      </a>
    );
  };

  const IconTile = ({ s }) => {
    const c = catColor(s.cat);
    return (
      <a onClick={() => open(s)} title={s.note}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 12, cursor: 'pointer', textDecoration: 'none',
          background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', transition: 'border-color .18s, box-shadow .18s' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${c} 55%, transparent)`; e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${c} 8%, transparent)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 13, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
          <Icon name={s.icon} size={24} color={c} />
          <span style={{ position: 'absolute', bottom: -1, right: -1 }}><StatusDot status={s.status} size={9} /></span>
        </div>
        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 12, color: 'var(--on-surface)', textAlign: 'center' }}>{s.name}</span>
      </a>
    );
  };

  const Row = ({ s, i }) => {
    const c = catColor(s.cat);
    return (
      <a onClick={() => open(s)} title={s.note}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', textDecoration: 'none',
          borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)' : 'none', transition: 'background .15s' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--surface-container-high) 50%, transparent)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 9999, background: c }}></span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: `color-mix(in srgb, ${c} 13%, transparent)` }}><Icon name={s.icon} size={17} color={c} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--on-surface)' }}>{s.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{s.host}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><StatusDot status={s.status} size={6} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{s.ms}ms</span></span>
        <Icon name={s.embeddable ? 'open_in_full' : 'open_in_new'} size={15} color="var(--on-surface-variant)" />
      </a>
    );
  };

  return (
    <PanelShell title="Services" icon="apps" count={`${list.length}`} action={onAll ? seeAll(onAll) : null}
      bodyStyle={tileStyle === 'list' ? null : { padding: 14 }}>
      {tileStyle === 'list' ? (
        <div>{list.map((s, i) => <Row key={s.id} s={s} i={i} />)}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: tileStyle === 'icon' ? 'repeat(auto-fill, minmax(96px, 1fr))' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: 11 }}>
          {list.map(s => tileStyle === 'icon' ? <IconTile key={s.id} s={s} /> : <Tile key={s.id} s={s} />)}
        </div>
      )}
    </PanelShell>
  );
}

// ── CENTRAL SERVICES SPOTLIGHT ─────────────────────────────
// Confidence-first band: surfaces only the services members care
// about (Plex / Jellyfin / Requests) with big uptime + heartbeat.
function statusColor(st) {
  return st === 'down' ? 'var(--error)' : st === 'degraded' ? 'var(--amber)' : 'var(--originator-own)';
}
function statusWord(st) {
  return st === 'down' ? 'DOWN' : st === 'degraded' ? 'DEGRADED' : 'OPERATIONAL';
}

// Width-filling heartbeat strip
function HeartbeatStrip({ beats, h = 24 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h, width: '100%' }}>
      {beats.map((b, i) => {
        const col = statusColor(b === 0 ? 'down' : b === 0.5 ? 'degraded' : 'up');
        return <span key={i} title={b === 0 ? 'down' : b === 0.5 ? 'degraded' : 'up'}
          style={{ flex: 1, minWidth: 0, height: b === 0.5 ? '62%' : '100%', minHeight: 5,
            background: col, opacity: b === 0 ? 0.92 : 0.8, borderRadius: 1.5 }}></span>;
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const c = statusColor(status);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 9999,
      background: `color-mix(in srgb, ${c} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, whiteSpace: 'nowrap' }}>
      <StatusDot status={status} size={6} />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.11em', color: c }}>{statusWord(status)}</span>
    </span>
  );
}

function CentralCard({ s, onOpen }) {
  const c = catColor(s.cat);
  const sc = statusColor(s.status);
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', overflow: 'hidden',
      background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: sc }}></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 11, background: `color-mix(in srgb, ${c} 14%, transparent)`, flexShrink: 0 }}>
          <Icon name={s.icon} size={22} color={c} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 16, color: 'var(--on-surface)' }}>{s.name}</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, padding: '1px 6px', borderRadius: 4, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>{s.centralLabel}</span>
          </div>
          <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer" title={`Open https://${s.host} in a new tab`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--on-surface-variant)'; e.currentTarget.style.textDecoration = 'none'; }}>{s.host}</a>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>
            {s.uptime.toFixed(2)}<span style={{ fontSize: 18, color: 'var(--on-surface-variant)', marginLeft: 1 }}>%</span>
          </div>
          <Eyebrow style={{ marginTop: 6 }}>30-day uptime</Eyebrow>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--outline-variant)', margin: '3px 0' }}></div>
        <div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>
            {s.ms}<span style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginLeft: 1 }}>ms</span>
          </div>
          <Eyebrow style={{ marginTop: 6 }}>Response</Eyebrow>
        </div>
      </div>

      <HeartbeatStrip beats={s.beats} h={24} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 10.5, color: 'var(--on-surface-variant)' }}>Last 30 days · v{s.version}</span>
        {s.embeddable ? (
          <a onClick={() => onOpen && onOpen(s)} style={{ fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--primary)', cursor: 'pointer' }}>
            Open <Icon name="arrow_right_alt" size={14} />
          </a>
        ) : (
          <a href={`https://${s.host}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'none' }}>
            Launch <Icon name="open_in_new" size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

function CentralServices({ variant = 'spotlight', role, onOpen, onAll }) {
  const list = window.SERVICES.filter(s => s.central);
  const down = list.filter(s => s.status === 'down');
  const deg = list.filter(s => s.status === 'degraded');
  const allGood = down.length === 0 && deg.length === 0;
  const headline = allGood
    ? 'All core services are up — stream away.'
    : down.length
      ? `${down.map(s => s.name).join(', ')} ${down.length > 1 ? 'are' : 'is'} down — streaming affected.`
      : `${deg.map(s => s.name).join(', ')} degraded — playback may be slow.`;
  const hc = allGood ? 'var(--originator-own)' : down.length ? 'var(--error)' : 'var(--amber)';

  const Lead = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: variant === 'banner' ? 0 : 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: `color-mix(in srgb, ${hc} 13%, transparent)`, flexShrink: 0 }}>
        <Icon name={allGood ? 'verified' : 'warning'} size={18} color={hc} fill={allGood} />
      </div>
      <div style={{ minWidth: 0 }}>
        <Eyebrow color="var(--primary)" style={{ marginBottom: 2 }}>Central services</Eyebrow>
        <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em', color: 'var(--on-surface)' }}>{headline}</div>
      </div>
      {variant === 'spotlight' && onAll && (
        <a onClick={onAll} style={{ marginLeft: 'auto', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--primary)', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>all status <Icon name="arrow_right_alt" size={14} /></a>
      )}
    </div>
  );

  if (variant === 'banner') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '14px 18px',
        background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)' }}>
        {Lead}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {list.map(s => {
            const linkProps = s.embeddable
              ? { onClick: () => onOpen && onOpen(s) }
              : { href: `https://${s.host}`, target: '_blank', rel: 'noopener noreferrer', title: `Open https://${s.host}` };
            return (
              <a key={s.id} {...linkProps} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', textDecoration: 'none' }}>
                <StatusDot status={s.status} size={7} />
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 13, color: 'var(--on-surface)' }}>{s.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: statusColor(s.status) }}>{s.uptime.toFixed(2)}%</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {Lead}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))', gap: 14 }}>
        {list.map(s => <CentralCard key={s.id} s={s} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ── STATUS (3 viz: heartbeat | bars | dots) ────────────────
function StatusPanel({ statusViz = 'heartbeat', role, onAll }) {
  const list = window.SERVICES.filter(s => role === 'admin' ? true : s.cat !== 'infra');
  const up = list.filter(s => s.status === 'up').length;
  const deg = list.filter(s => s.status === 'degraded').length;
  const down = list.filter(s => s.status === 'down').length;

  return (
    <PanelShell title="System Status" icon="favorite" accent="var(--originator-own)" action={seeAll(onAll)}
      count={<span style={{ display: 'inline-flex', gap: 8 }}>
        <span style={{ color: 'var(--originator-own)' }}>{up} up</span>
        {deg > 0 && <span style={{ color: 'var(--amber)' }}>{deg} degraded</span>}
        {down > 0 && <span style={{ color: 'var(--error)' }}>{down} down</span>}
      </span>}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {list.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
            <StatusDot status={s.status} size={7} />
            <div style={{ minWidth: 0, flex: statusViz === 'heartbeat' ? '0 0 96px' : 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              {statusViz !== 'heartbeat' && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{s.host}</div>}
            </div>
            {statusViz === 'heartbeat' && <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}><Heartbeat beats={s.beats.slice(-18)} h={18} barW={3} gap={1.5} /></div>}
            {statusViz === 'bars' && <div style={{ flex: 1, maxWidth: 160 }}><ProgressBar pct={s.uptime} color={s.status === 'down' ? 'var(--error)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--originator-own)'} h={6} /></div>}
            {statusViz === 'dots' && <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><HealthDots tier={s.status === 'down' ? 'crit' : s.status === 'degraded' ? 'warn' : 'ok'} size={7} /></div>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: s.status === 'down' ? 'var(--error)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--on-surface-variant)', minWidth: 48, textAlign: 'right' }}>{s.uptime.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── MY REQUESTS (compact, for dashboard) ───────────────────
const REQ_TONE = { available: 'originator-own', approved: 'originator-court', pending: 'amber', declined: 'error' };
const REQ_LABEL = { available: 'Available', approved: 'Approved', pending: 'Pending', declined: 'Declined' };

function MyRequestsPanel({ role, onAll }) {
  const me = window.USERS.find(u => u.id === 'you');
  const mine = window.REQUESTS.filter(r => r.user === 'you');
  const queue = window.REQUESTS.filter(r => r.status === 'pending');
  const adminMode = role === 'admin';
  const items = adminMode ? queue : mine;
  return (
    <PanelShell title={adminMode ? 'Approval Queue' : 'My Requests'} icon={adminMode ? 'inbox' : 'bookmark_added'} accent="var(--originator-court)"
      count={adminMode ? `${queue.length} pending` : null} action={seeAll(onAll)}>
      {!adminMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)' }}>
          <Eyebrow>Quota</Eyebrow>
          <div style={{ flex: 1 }}><ProgressBar pct={(me.reqUsed / me.reqQuota) * 100} color="var(--originator-court)" h={6} /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{me.reqUsed}/{me.reqQuota}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((r, i) => {
          const u = window.USERS.find(x => x.id === r.user);
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
              <PosterTile title={r.title} kind={r.kind} cat="request" w={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title} <span style={{ fontWeight: 400, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.year}</span></div>
                <div style={{ fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{adminMode ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Avatar name={u.name} size={13} color="var(--originator-court)" />{u.name} · {r.requested}</span> : (r.eta || `Requested ${r.requested}`)}</div>
              </div>
              {adminMode ? (
                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn btn-tonal" style={{ color: 'var(--originator-own)', background: 'color-mix(in srgb, var(--originator-own) 12%, transparent)' }}>Approve</button>
                  <button className="btn btn-tonal" style={{ color: 'var(--error)', background: 'color-mix(in srgb, var(--error) 10%, transparent)' }}>Decline</button>
                </div>
              ) : <Pill tone={REQ_TONE[r.status]}>{REQ_LABEL[r.status]}</Pill>}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── LIBRARY STAT STRIP ─────────────────────────────────────
function LibraryStats() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {window.LIBRARY.map(l => (
        <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', borderRadius: 14, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow>{l.label}</Eyebrow>
            <Icon name={l.icon} size={15} color="var(--primary)" />
          </div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--on-surface)', lineHeight: 1 }}>{l.count}</div>
          <div style={{ fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{l.delta}</div>
        </div>
      ))}
    </div>
  );
}

// ── RECENTLY ADDED ─────────────────────────────────────────
function RecentlyAdded() {
  return (
    <PanelShell title="Recently Added" icon="new_releases" accent="var(--primary)">
      <div className="custom-scrollbar" style={{ display: 'flex', gap: 12, padding: 16, overflowX: 'auto' }}>
        {window.RECENT.map(r => (
          <div key={r.id} style={{ width: 76, flexShrink: 0 }}>
            <PosterTile title={r.title} kind={r.kind} cat={r.cat} w={76} />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--on-surface)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{r.year}</div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ── DOWNLOAD QUEUE (admin) ─────────────────────────────────
function QueuePanel() {
  return (
    <PanelShell title="Download Queue" icon="downloading" accent="var(--originator-third-party)" count={`${window.QUEUE.length} active`}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {window.QUEUE.map((q, i) => (
          <div key={q.id} style={{ padding: '11px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <Icon name={q.svc === 'radarr' ? 'movie' : 'live_tv'} size={14} color="var(--originator-third-party)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{q.speed}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}><ProgressBar pct={q.pct} color="var(--originator-third-party)" h={5} /></div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--on-surface)' }}>{q.pct}%</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{q.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function Empty({ icon, line, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '32px 16px', textAlign: 'center' }}>
      <Icon name={icon} size={28} color="color-mix(in srgb, var(--on-surface-variant) 55%, transparent)" />
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--on-surface)' }}>{line}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', maxWidth: 220 }}>{sub}</div>}
    </div>
  );
}

Object.assign(window, { useTick, fmtTime, PanelShell, NowPlayingPanel, ServiceTiles, StatusPanel, MyRequestsPanel, LibraryStats, RecentlyAdded, QueuePanel, Empty, REQ_TONE, REQ_LABEL, CentralServices, CentralCard, HeartbeatStrip, StatusBadge, statusColor, statusWord });
