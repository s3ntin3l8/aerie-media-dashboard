// ============================================================
// AERIE — Home dashboard (header + health ticker + layouts)
// ============================================================

// 40px aggregate health ticker (secondary status bar)
function HealthTicker({ role, onOpenStatus }) {
  const list = window.SERVICES;
  const up = list.filter(s => s.status === 'up').length;
  const deg = list.filter(s => s.status === 'degraded').length;
  const down = list.filter(s => s.status === 'down').length;
  const allGood = deg === 0 && down === 0;
  const active = window.NOW_PLAYING.length;
  const totalBitrate = window.NOW_PLAYING.reduce((a, s) => a + parseFloat(s.bitrate), 0).toFixed(1);
  return (
    <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '0 32px', borderBottom: '1px solid var(--outline-variant)', background: 'color-mix(in srgb, var(--surface-container-lowest) 55%, transparent)', backdropFilter: 'blur(8px)' }}>
      <div onClick={onOpenStatus} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
        <StatusDot status={down ? 'down' : deg ? 'degraded' : 'up'} size={8} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: allGood ? 'var(--originator-own)' : down ? 'var(--error)' : 'var(--amber)' }}>
          {allGood ? 'All systems operational' : down ? `${down} service${down > 1 ? 's' : ''} down` : `${deg} degraded`}
        </span>
      </div>
      <div style={{ width: 1, height: 16, background: 'var(--outline-variant)' }}></div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{up}/{list.length} up</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
        <Icon name="graphic_eq" size={14} color="var(--primary)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{active} streams · {totalBitrate} Mbps</span>
        <div style={{ marginLeft: 6 }}><Sparkline data={window.PLAYS_24H} w={92} h={20} color="var(--primary)" /></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>24h</span>
      </div>
    </div>
  );
}

function GreetingHeader({ role, onOpenPalette, onNavigate }) {
  const me = window.USERS.find(u => u.id === 'you');
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const d = new Date();
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div style={{ padding: '22px 32px 18px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0, background: 'color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <Eyebrow color="var(--primary)">{role === 'admin' ? 'Lead Operator' : 'Member'} · AERIE</Eyebrow>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{date}</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: 28, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--on-surface)', whiteSpace: 'nowrap' }}>{greet}, {me.name}.</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchField asButton onClick={onOpenPalette} placeholder="Search" kbd="⌘K" width={200} />
          <button onClick={() => onNavigate('requests')} className="btn btn-primary btn-sm"><Icon name="add" size={15} /> Request</button>
        </div>
      </div>
    </div>
  );
}


function Home({ role, tweaks, onOpenPalette, onNavigate, onOpenService }) {
  const layout = tweaks.layout || 'command';
  const tileStyle = tweaks.tileStyle || 'stripe';
  const statusViz = tweaks.statusViz || 'heartbeat';
  const central = tweaks.central || 'spotlight';

  const NP = <NowPlayingPanel role={role} big={layout === 'streamFirst'} onAll={() => onNavigate('status')} />;
  const ST = <ServiceTiles tileStyle={tileStyle} role={role} onOpen={onOpenService} onAll={() => onNavigate('launch')} />;
  const STATUS = <StatusPanel statusViz={statusViz} role={role} onAll={() => onNavigate('status')} />;
  const REQ = <MyRequestsPanel role={role} onAll={() => onNavigate('requests')} />;

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <GreetingHeader role={role} onOpenPalette={onOpenPalette} onNavigate={onNavigate} />
      <HealthTicker role={role} onOpenStatus={() => onNavigate('status')} />
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '22px 32px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {central !== 'off' && <CentralServices variant={central} role={role} onOpen={onOpenService} onAll={() => onNavigate('status')} />}

          {layout === 'compact' ? (
            <React.Fragment>
              <LibraryStats />
              {NP}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>{REQ}{STATUS}</div>
              {ST}
              {role === 'admin' && <QueuePanel />}
            </React.Fragment>
          ) : layout === 'streamFirst' ? (
            <React.Fragment>
              {NP}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{ST}<RecentlyAdded /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{REQ}{STATUS}{role === 'admin' && <QueuePanel />}</div>
              </div>
            </React.Fragment>
          ) : (
            // command (default): main column + 360px right rail
            <React.Fragment>
              <LibraryStats />
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 18, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                  {NP}
                  {ST}
                  {role === 'admin' && <QueuePanel />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {REQ}
                  {STATUS}
                  <RecentlyAdded />
                </div>
              </div>
            </React.Fragment>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 6, fontSize: 11, color: 'var(--on-surface-variant)' }}>
            <Kbd>g</Kbd><Kbd>h</Kbd><span>dashboard</span><span>·</span><Kbd>g</Kbd><Kbd>s</Kbd><span>services</span><span>·</span><Kbd>⌘K</Kbd><span>command</span>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Home, HealthTicker, GreetingHeader });
