// ============================================================
// AERIE — Status / uptime dashboard (Gatus + Prometheus)
// ============================================================
function rand(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }
function series(n, base, amp, seed) { return Array.from({ length: n }, (_, i) => base + Math.sin(i / 2.2 + seed) * amp * 0.5 + rand(i + seed) * amp); }

function Status({ role }) {
  const list = window.SERVICES.filter(s => role === 'admin' ? true : s.cat !== 'infra');
  const up = list.filter(s => s.status === 'up').length;
  const deg = list.filter(s => s.status === 'degraded').length;
  const down = list.filter(s => s.status === 'down').length;
  const avgMs = Math.round(list.reduce((a, s) => a + s.ms, 0) / list.length);
  const avgUp = (list.reduce((a, s) => a + s.uptime, 0) / list.length).toFixed(2);

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Gatus · live health" title="System Status" icon="favorite" accent="var(--originator-own)"
        sub="Uptime, response latency and incident history across every service.">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 9999, background: down ? 'color-mix(in srgb, var(--error) 12%, transparent)' : deg ? 'color-mix(in srgb, var(--amber) 12%, transparent)' : 'color-mix(in srgb, var(--originator-own) 12%, transparent)' }}>
          <StatusDot status={down ? 'down' : deg ? 'degraded' : 'up'} size={8} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: down ? 'var(--error)' : deg ? 'var(--amber)' : 'var(--originator-own)' }}>{down ? 'Incident' : deg ? 'Degraded' : 'Operational'}</span>
        </span>
      </PageHeader>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatTile label="Services up" value={`${up}/${list.length}`} color="var(--originator-own)" icon="check_circle" />
            <StatTile label="Avg uptime 30d" value={`${avgUp}%`} color="var(--on-surface)" icon="trending_up" />
            <StatTile label="Avg response" value={`${avgMs}ms`} color="var(--primary)" icon="bolt" />
            <StatTile label="Incidents" value={deg + down} color={deg + down ? 'var(--amber)' : 'var(--on-surface)'} icon="warning" />
          </div>

          <PanelShell title="Service Health" icon="favorite" accent="var(--originator-own)" count={`${list.length}`}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {list.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: `color-mix(in srgb, ${catColor(s.cat)} 13%, transparent)`, flexShrink: 0 }}><Icon name={s.icon} size={17} color={catColor(s.cat)} /></div>
                  <div style={{ flex: '0 0 150px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><StatusDot status={s.status} size={7} /><span style={{ fontWeight: 700, fontSize: 13, color: 'var(--on-surface)' }}>{s.name}</span></div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>{s.host}</div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><Heartbeat beats={s.beats} h={24} barW={5} /></div>
                  <div style={{ flex: '0 0 60px', textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: s.status === 'down' ? 'var(--error)' : s.status === 'degraded' ? 'var(--amber)' : 'var(--on-surface)' }}>{s.uptime.toFixed(2)}%</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{s.ms}ms</div>
                  </div>
                </div>
              ))}
            </div>
          </PanelShell>

          {role === 'admin' && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Icon name="query_stats" size={16} color="var(--primary)" />
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--on-surface)' }}>Prometheus Metrics</h2>
                <Pill tone="primary" style={{ marginLeft: 4 }}>Admin</Pill>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <MetricCard title="CPU load" value="38%" unit="8-core" color="var(--primary)" data={series(40, 30, 30, 1)} />
                <MetricCard title="Memory" value="11.2 GB" unit="of 32 GB" color="var(--originator-court)" data={series(40, 30, 18, 5)} />
                <MetricCard title="Network out" value="142 Mbps" unit="peak 380" color="var(--originator-third-party)" data={series(40, 40, 50, 9)} />
                <MetricCard title="Disk array" value="68%" unit="44 TB / 64 TB" color="var(--amber)" data={series(40, 60, 8, 3)} />
                <MetricCard title="Transcodes" value="1" unit="active sessions" color="var(--originator-own)" data={series(40, 12, 22, 7)} />
                <MetricCard title="Requests/min" value="24" unit="all services" color="var(--primary)" data={series(40, 22, 28, 11)} />
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ title, value, unit, color, data }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>{title}</Eyebrow>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{unit}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--on-surface)', marginBottom: 10 }}>{value}</div>
      <Sparkline data={data} w={260} h={40} color={color} strokeW={1.5} />
    </div>
  );
}

Object.assign(window, { Status, MetricCard });
