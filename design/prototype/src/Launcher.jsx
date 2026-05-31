// ============================================================
// AERIE — Service launcher + embed/launch service view
// ============================================================
function Launcher({ role, onOpenService }) {
  let list = window.SERVICES;
  if (role !== 'admin') list = list.filter(s => s.cat !== 'infra' && s.id !== 'prometheus');
  const cats = ['stream', 'request', 'automation', 'monitor', 'infra'];
  const grouped = cats.map(cat => ({ cat, items: list.filter(s => s.cat === cat) })).filter(g => g.items.length);

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Service directory" title="Services" icon="apps" accent="var(--primary)"
        sub={`${list.length} services · embeddable ones open in-portal, the rest launch in a new tab.`}>
        <SearchField placeholder="Filter services…" width={240} />
      </PageHeader>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 32px 56px', display: 'flex', flexDirection: 'column', gap: 26 }}>
          {grouped.map(g => (
            <div key={g.cat}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor(g.cat) }}></span>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--on-surface)' }}>{window.CAT[g.cat].label}</h2>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{g.items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 13 }}>
                {g.items.map(s => <LauncherCard key={s.id} s={s} onOpen={() => onOpenService(s)} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LauncherCard({ s, onOpen }) {
  const c = catColor(s.cat);
  return (
    <a onClick={onOpen} title={s.note}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 13, padding: 16, borderRadius: 14, cursor: 'pointer', textDecoration: 'none',
        background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', overflow: 'hidden', transition: 'border-color .18s, box-shadow .18s, transform .1s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${c} 55%, transparent)`; e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${c} 8%, transparent)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; e.currentTarget.style.boxShadow = 'none'; }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: c }}></span>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${c} 14%, transparent)`, flexShrink: 0 }}><Icon name={s.icon} size={24} color={c} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 15, color: 'var(--on-surface)' }}>{s.name}</span>
            <Icon name={s.embeddable ? 'open_in_full' : 'open_in_new'} size={14} color="var(--on-surface-variant)" style={{ marginLeft: 'auto' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.host}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>{s.note}</div>
      <Divider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={s.status} size={7} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: s.status === 'degraded' ? 'var(--amber)' : s.status === 'down' ? 'var(--error)' : 'var(--on-surface-variant)' }}>{s.status === 'up' ? `${s.uptime.toFixed(2)}% · ${s.ms}ms` : s.status}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.04em',
          background: s.embeddable ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'color-mix(in srgb, var(--originator-third-party) 12%, transparent)',
          color: s.embeddable ? 'var(--primary)' : 'var(--originator-third-party)' }}>{s.embeddable ? 'EMBED' : 'LAUNCH'}</span>
      </div>
    </a>
  );
}

// ── Service view (embed iframe tab OR launch) ──────────────
function ServiceView({ s, onBack, onOpenPalette }) {
  const c = catColor(s.cat);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); const t = setTimeout(() => setLoaded(true), 900); return () => clearTimeout(t); }, [s.id]);

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* service tab header */}
      <div style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)' }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ paddingLeft: 8, paddingRight: 12 }}><Icon name="arrow_back" size={16} /> Services</button>
        <div style={{ width: 1, height: 22, background: 'var(--outline-variant)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: `color-mix(in srgb, ${c} 14%, transparent)` }}><Icon name={s.icon} size={18} color={c} /></div>
        <div>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.1 }}>{s.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>v{s.version}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><StatusDot status={s.status} size={7} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{s.ms}ms</span></span>
          <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><Icon name="open_in_new" size={15} /> New tab</a>
        </div>
      </div>

      {s.embeddable ? (
        <React.Fragment>
          {/* faux browser chrome / forward-auth bar */}
          <div style={{ height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderBottom: '1px solid var(--outline-variant)', background: 'color-mix(in srgb, var(--surface-container) 60%, transparent)' }}>
            <Icon name="lock" size={13} color="var(--originator-own)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>https://{s.host}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '1px 7px', borderRadius: 4, background: 'color-mix(in srgb, var(--originator-own) 12%, transparent)', color: 'var(--originator-own)', fontWeight: 700 }}>FRAME-ANCESTORS OK</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}><Icon name="shield_person" size={12} color="var(--primary)" />forward-auth · session OK</span>
          </div>
          {/* embedded surface placeholder */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--surface-container-low)' }}>
            {!loaded ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <Icon name="sync" size={28} color={c} style={{ animation: 'aerieSpin 1s linear infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--on-surface-variant)' }}>Loading embedded session…</span>
              </div>
            ) : <EmbeddedMock s={s} c={c} />}
          </div>
        </React.Fragment>
      ) : (
        <LaunchScreen s={s} c={c} />
      )}
    </section>
  );
}

// neutral placeholder representing the embedded service (not a clone of any product UI)
function EmbeddedMock({ s, c }) {
  return (
    <div className="custom-scrollbar" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderRadius: 14, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c} 14%, transparent)` }}><Icon name={s.icon} size={22} color={c} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 15, color: 'var(--on-surface)' }}>{s.name} — embedded session</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Rendered in-portal via <span style={{ fontFamily: 'var(--font-mono)' }}>&lt;iframe&gt;</span>; authenticated by your Authentik cookie through forward-auth.</div>
          </div>
          <Pill rawColor={c}>Live</Pill>
        </div>
        {/* skeleton content grid — represents the service's own UI loading inside the frame */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 13 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)' }}>
              <div style={{ height: 92, background: `linear-gradient(135deg, color-mix(in srgb, ${c} ${8 + (i % 4) * 4}%, var(--surface-container-high)), var(--surface-container))` }}></div>
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ height: 8, width: '80%', borderRadius: 4, background: 'color-mix(in srgb, var(--on-surface-variant) 18%, transparent)' }}></div>
                <div style={{ height: 8, width: '50%', borderRadius: 4, background: 'color-mix(in srgb, var(--on-surface-variant) 12%, transparent)' }}></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)', paddingTop: 4 }}>— embedded {s.host} —</div>
      </div>
    </div>
  );
}

function LaunchScreen({ s, c }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'var(--surface)' }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${c} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 26%, transparent)`, marginBottom: 20 }}>
          <Icon name={s.icon} size={36} color={c} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 22, color: 'var(--on-surface)' }}>{s.name} opens in a new tab</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--on-surface-variant)', marginTop: 10, maxWidth: 360 }}>
          {s.id === 'plex' ? 'Plex is hosted on plex.tv and can’t be framed, so it launches externally — you stay signed in via your Plex account.' : 'This service is externally hosted and can’t be embedded, so it launches in a new tab.'}
        </p>
        <a href={`https://${s.host}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 22, padding: '12px 22px' }}><Icon name="open_in_new" size={18} /> Launch {s.name}</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>
          <Icon name="link" size={13} /> {s.host}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Launcher, LauncherCard, ServiceView, EmbeddedMock, LaunchScreen });
