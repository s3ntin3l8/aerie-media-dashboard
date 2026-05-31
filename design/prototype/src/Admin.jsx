// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
function Admin({ onOpenService }) {
  const [tab, setTab] = useState('services');
  const [svcModal, setSvcModal] = useState(null); // { mode, service }
  const [toast, setToast] = useState(null);
  const tabs = [['services', 'Services & Secrets', 'dns'], ['members', 'Members', 'group'], ['visibility', 'Visibility', 'visibility']];

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };
  const onSave = (data, vis) => { setSvcModal(null); flash(svcModal.mode === 'edit' ? `Saved changes to ${data.name}` : `${data.name} added to the portal`); };
  const onDelete = (s) => { setSvcModal(null); flash(`${s.name} removed`); };

  return (
    <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Lead operator" title="Admin" icon="tune" accent="var(--primary)" sub="Manage services, members and what each group can see.">
        <button onClick={() => setSvcModal({ mode: 'add' })} className="btn btn-primary btn-sm"><Icon name="add" size={15} /> Add service</button>
      </PageHeader>
      <div style={{ display: 'flex', gap: 4, padding: '12px 32px 0', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: tab === id ? 'var(--primary)' : 'var(--on-surface-variant)',
            borderBottom: '2px solid ' + (tab === id ? 'var(--primary)' : 'transparent'), marginBottom: -1 }}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 32px 56px' }}>
          {tab === 'services' && <AdminServices onOpenService={onOpenService} onEdit={s => setSvcModal({ mode: 'edit', service: s })} />}
          {tab === 'members' && <AdminMembers />}
          {tab === 'visibility' && <AdminVisibility />}
        </div>
      </div>

      <ServiceModal open={!!svcModal} mode={svcModal && svcModal.mode} service={svcModal && svcModal.service} onClose={() => setSvcModal(null)} onSave={onSave} onDelete={onDelete} />
      {toast && <Toast msg={toast} />}
    </section>
  );
}

function Toast({ msg }) {
  return (
    <div className="fade-in" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 360, display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderRadius: 11, background: 'var(--surface-container-highest)', border: '1px solid var(--outline-variant)', boxShadow: 'var(--shadow-lg)' }}>
      <Icon name="check_circle" size={17} color="var(--originator-own)" />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{msg}</span>
    </div>
  );
}

function AdminServices({ onOpenService, onEdit }) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid var(--outline-variant)', overflow: 'hidden', background: 'var(--surface-container-lowest)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1.2fr 0.5fr', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--outline-variant)', background: 'color-mix(in srgb, var(--surface-container) 50%, transparent)' }}>
        {['Service', 'Host', 'Embed', 'API key', ''].map((h, i) => <Eyebrow key={i}>{h}</Eyebrow>)}
      </div>
      {window.SERVICES.map((s, i) => (
        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 1.2fr 0.5fr', gap: 12, alignItems: 'center', padding: '12px 18px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${catColor(s.cat)} 13%, transparent)`, flexShrink: 0 }}><Icon name={s.icon} size={16} color={catColor(s.cat)} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--on-surface)' }}>{s.name}</div>
              <div style={{ fontSize: 10 }}><CatBadge cat={s.cat} size="xs" /></div>
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.host}</span>
          <span>{s.embeddable ? <Icon name="check" size={16} color="var(--originator-own)" /> : <Icon name="open_in_new" size={15} color="var(--on-surface-variant)" />}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>
            <Icon name="lock" size={12} color="var(--originator-own)" />••••••••<span style={{ fontSize: 9, opacity: 0.7 }}>AES-GCM</span>
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <button onClick={() => onOpenService(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Open"><Icon name="open_in_full" size={15} /></button>
            <button onClick={() => onEdit(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Edit"><Icon name="edit" size={15} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminMembers() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
      {window.USERS.map(u => (
        <div key={u.id} style={{ padding: 15, borderRadius: 14, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Avatar name={u.name} size={38} color={u.role === 'admin' ? 'var(--primary)' : 'var(--originator-court)'} you={u.id === 'you'} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 14, color: 'var(--on-surface)' }}>{u.name}</span>
                {u.role === 'admin' && <Pill tone="primary">Admin</Pill>}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--on-surface-variant)' }}>{u.email}</div>
            </div>
          </div>
          <Divider style={{ margin: '13px 0 11px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {u.groups.map(g => <Chip key={g} icon="group">{g}</Chip>)}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11, color: u.linked ? 'var(--originator-own)' : 'var(--amber)' }}>
              <Icon name={u.linked ? 'link' : 'link_off'} size={13} />{u.linked ? 'linked' : 'unlinked'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
            <Eyebrow>Request quota</Eyebrow>
            <div style={{ flex: 1 }}><ProgressBar pct={(u.reqUsed / u.reqQuota) * 100} color={u.reqUsed >= u.reqQuota ? 'var(--amber)' : 'var(--originator-court)'} h={5} /></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-variant)' }}>{u.reqUsed}/{u.reqQuota}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminVisibility() {
  const groups = ['media-admins', 'friends', 'guests'];
  const vis = { 'media-admins': () => true, 'friends': (s) => s.cat !== 'infra' && s.id !== 'prometheus', 'guests': (s) => s.cat === 'stream' || s.id === 'overseerr' };
  return (
    <div style={{ borderRadius: 16, border: '1px solid var(--outline-variant)', overflow: 'hidden', background: 'var(--surface-container-lowest)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `1.4fr repeat(${groups.length}, 1fr)`, gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--outline-variant)', background: 'color-mix(in srgb, var(--surface-container) 50%, transparent)' }}>
        <Eyebrow>Service → Group</Eyebrow>
        {groups.map(g => <div key={g} style={{ textAlign: 'center' }}><Chip icon="group">{g}</Chip></div>)}
      </div>
      {window.SERVICES.map((s, i) => (
        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: `1.4fr repeat(${groups.length}, 1fr)`, gap: 8, alignItems: 'center', padding: '10px 18px', borderTop: i ? '1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name={s.icon} size={16} color={catColor(s.cat)} /><span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--on-surface)' }}>{s.name}</span></div>
          {groups.map(g => {
            const on = vis[g](s);
            return <div key={g} style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 30, height: 18, borderRadius: 9999, position: 'relative', background: on ? 'color-mix(in srgb, var(--originator-own) 30%, transparent)' : 'color-mix(in srgb, var(--on-surface-variant) 18%, transparent)', cursor: 'pointer', transition: 'background .15s' }}>
                <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: on ? 'var(--originator-own)' : 'var(--on-surface-variant)', transition: 'left .15s' }}></span>
              </span>
            </div>;
          })}
        </div>
      ))}
    </div>
  );
}

// ── Command palette (⌘K) ───────────────────────────────────
function CommandPalette({ open, onClose, onNavigate, onOpenService }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  if (!open) return null;
  const nav = [['Dashboard', 'dashboard', () => onNavigate('home')], ['Services', 'apps', () => onNavigate('launch')], ['My Requests', 'bookmark_added', () => onNavigate('requests')], ['Status', 'favorite', () => onNavigate('status')], ['Admin', 'tune', () => onNavigate('admin')]];
  const ql = q.toLowerCase();
  const navMatches = nav.filter(n => n[0].toLowerCase().includes(ql));
  const svcMatches = window.SERVICES.filter(s => s.name.toLowerCase().includes(ql) || s.host.includes(ql));
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'color-mix(in srgb, var(--inverse-surface) 45%, transparent)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, boxShadow: 'var(--shadow-2xl)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)' }}>
          <Icon name="search" size={20} color="var(--on-surface-variant)" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search services, pages, requests…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--on-surface)', fontFamily: 'var(--font-body)' }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="custom-scrollbar" style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {navMatches.length > 0 && <div style={{ padding: '6px 10px' }}><Eyebrow>Navigate</Eyebrow></div>}
          {navMatches.map(([label, icon, act]) => <PaletteRow key={label} icon={icon} label={label} onClick={() => { act(); onClose(); }} />)}
          {svcMatches.length > 0 && <div style={{ padding: '8px 10px 6px' }}><Eyebrow>Services</Eyebrow></div>}
          {svcMatches.map(s => <PaletteRow key={s.id} icon={s.icon} iconColor={catColor(s.cat)} label={s.name} hint={s.embeddable ? 'embed' : 'launch'} onClick={() => { onOpenService(s); onClose(); }} />)}
          {navMatches.length + svcMatches.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--on-surface-variant)' }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ icon, iconColor, label, hint, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', background: h ? 'color-mix(in srgb, var(--primary) 9%, transparent)' : 'transparent' }}>
      <Icon name={icon} size={18} color={iconColor || 'var(--on-surface-variant)'} />
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: 'var(--on-surface)' }}>{label}</span>
      {hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--on-surface-variant)' }}>{hint}</span>}
      {h && <Icon name="arrow_right_alt" size={16} color="var(--primary)" />}
    </div>
  );
}

Object.assign(window, { Admin, Toast, AdminServices, AdminMembers, AdminVisibility, CommandPalette, PaletteRow });
