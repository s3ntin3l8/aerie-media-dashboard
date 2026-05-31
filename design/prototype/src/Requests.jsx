// ============================================================
// AERIE — Requests view (per-user Overseerr)
// ============================================================
function PageHeader({ eyebrow, title, sub, icon, accent = 'var(--primary)', children }) {
  return (
    <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0, background: 'color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {icon && <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${accent} 13%, transparent)` }}><Icon name={icon} size={22} color={accent} /></div>}
          <div>
            {eyebrow && <Eyebrow color={accent} style={{ marginBottom: 5 }}>{eyebrow}</Eyebrow>}
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--on-surface)', lineHeight: 1.1 }}>{title}</h1>
            {sub && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 3 }}>{sub}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
      </div>
    </div>
  );
}

function StatTile({ label, value, color = 'var(--on-surface)', icon }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderRadius: 12, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Eyebrow>{label}</Eyebrow>{icon && <Icon name={icon} size={14} color={color} />}</div>
      <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 24, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

function RequestCard({ r, adminMode, onAct }) {
  const u = window.USERS.find(x => x.id === r.user);
  return (
    <div style={{ display: 'flex', gap: 13, padding: 14, borderRadius: 14, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
      <PosterTile title={r.title} kind={r.kind} cat="request" w={58} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 14, color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Icon name={r.kind === 'series' ? 'live_tv' : 'movie'} size={12} color="var(--on-surface-variant)" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{r.kind === 'series' ? 'Series' : 'Movie'} · {r.year}</span>
            </div>
          </div>
          <Pill tone={REQ_TONE[r.status]}>{REQ_LABEL[r.status]}</Pill>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          {adminMode ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Avatar name={u.name} size={18} color="var(--originator-court)" /><span style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>{u.name}</span></span>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{r.id}</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--on-surface-variant)' }}>{r.eta ? <span style={{ color: 'var(--originator-court)', fontWeight: 600 }}>{r.eta}</span> : `Requested ${r.requested}`}</span>
          {adminMode && r.status === 'pending' && (
            <div style={{ display: 'flex', gap: 5, marginLeft: 4 }}>
              <button onClick={() => onAct(r.id, 'approve')} className="btn btn-tonal" style={{ color: 'var(--originator-own)', background: 'color-mix(in srgb, var(--originator-own) 12%, transparent)' }}>Approve</button>
              <button onClick={() => onAct(r.id, 'decline')} className="btn btn-tonal" style={{ color: 'var(--error)', background: 'color-mix(in srgb, var(--error) 10%, transparent)' }}>Decline</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Requests({ role, onOpenService }) {
  const adminMode = role === 'admin';
  const me = window.USERS.find(u => u.id === 'you');
  const [filter, setFilter] = useState('all');
  const [acted, setActed] = useState({});
  const base = adminMode ? window.REQUESTS : window.REQUESTS.filter(r => r.user === 'you');
  const filtered = base.filter(r => filter === 'all' ? true : r.status === filter).map(r => acted[r.id] ? { ...r, status: acted[r.id] } : r);

  const counts = {
    all: base.length,
    pending: base.filter(r => r.status === 'pending' && !acted[r.id]).length,
    approved: base.filter(r => (acted[r.id] || r.status) === 'approved').length,
    available: base.filter(r => r.status === 'available').length,
  };
  const onAct = (id, action) => setActed(a => ({ ...a, [id]: action === 'approve' ? 'approved' : 'declined' }));

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <PageHeader eyebrow={adminMode ? 'Overseerr · all members' : 'Overseerr · your library'} title={adminMode ? 'Requests & Approvals' : 'My Requests'} icon="playlist_add" accent="var(--originator-court)"
        sub={adminMode ? 'Approve incoming requests and track fulfilment across all members.' : 'Track what you’ve asked for and what’s ready to watch.'}>
        <SearchField placeholder="Search movies & shows to request…" width={300} />
        <button onClick={() => onOpenService(window.SERVICES.find(s => s.id === 'overseerr'))} className="btn btn-secondary btn-sm"><Icon name="open_in_full" size={15} /> Open Overseerr</button>
      </PageHeader>

      {/* unlinked-account guard for friends */}
      {!adminMode && !me.linked && (
        <div style={{ margin: '16px 32px 0', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--amber) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)' }}>
          <Icon name="link_off" size={18} color="var(--amber)" />
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--on-surface)' }}>Your Overseerr account isn’t linked yet — requests may not show your full history. <a style={{ color: 'var(--amber)', fontWeight: 600, cursor: 'pointer' }}>Link account →</a></div>
        </div>
      )}

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {adminMode ? (
              <React.Fragment>
                <StatTile label="Pending" value={counts.pending} color="var(--amber)" icon="pending" />
                <StatTile label="Approved" value={counts.approved} color="var(--originator-court)" icon="check_circle" />
                <StatTile label="Available" value={counts.available} color="var(--originator-own)" icon="download_done" />
                <StatTile label="Members" value={window.USERS.length - 1} color="var(--on-surface)" icon="group" />
              </React.Fragment>
            ) : (
              <React.Fragment>
                <StatTile label="Quota used" value={`${me.reqUsed}/${me.reqQuota}`} color="var(--originator-court)" icon="data_usage" />
                <StatTile label="Pending" value={counts.pending} color="var(--amber)" icon="pending" />
                <StatTile label="Available" value={counts.available} color="var(--originator-own)" icon="download_done" />
              </React.Fragment>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['all', 'pending', 'approved', 'available'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '6px 13px', borderRadius: 9999, cursor: 'pointer',
                  border: '1px solid ' + (filter === f ? 'color-mix(in srgb, var(--originator-court) 40%, transparent)' : 'var(--outline-variant)'),
                  background: filter === f ? 'color-mix(in srgb, var(--originator-court) 13%, transparent)' : 'transparent',
                  color: filter === f ? 'var(--originator-court)' : 'var(--on-surface-variant)' }}>{f}{f === 'all' ? '' : ''} {counts[f] != null && <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{counts[f]}</span>}</button>
            ))}
          </div>

          {filtered.length === 0 ? <Empty icon="bookmark_border" line="No requests here" sub="Search above to request a movie or show." /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
              {filtered.map(r => <RequestCard key={r.id} r={r} adminMode={adminMode} onAct={onAct} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Requests, PageHeader, StatTile, RequestCard });
