// ============================================================
// AERIE — application shell
// ============================================================
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "command",
  "central": "spotlight",
  "tileStyle": "stripe",
  "statusViz": "heartbeat",
  "view": "admin",
  "theme": "dark"
}/*EDITMODE-END*/;

const LS = 'aerie.state.v1';
function loadState() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const saved = useRef(loadState()).current;
  const [authed, setAuthed] = useState(saved.authed !== false);
  const [route, setRoute] = useState(saved.route || 'home');
  const [service, setService] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // role + theme live in tweaks so the panel and the rail stay in sync
  const role = t.view || 'admin';
  const theme = t.theme || 'dark';
  const setRole = (r) => setTweak('view', r);
  const setTheme = (th) => setTweak('theme', th);

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => { localStorage.setItem(LS, JSON.stringify({ authed, route })); }, [authed, route]);

  const navigate = (id) => { setService(null); setRoute(id); };
  const openService = (s) => { setService(s); setRoute('service'); };

  // keyboard shortcuts
  useEffect(() => {
    let gPending = false, gT;
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(p => !p); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setTheme(theme === 'dark' ? 'light' : 'dark'); return; }
      if (typing) return;
      if (e.key === 'Escape') { setPaletteOpen(false); return; }
      if (!authed) return;
      if (gPending) {
        gPending = false; clearTimeout(gT);
        const map = { h: 'home', s: 'launch', r: 'requests', u: 'status', a: 'admin' };
        if (map[e.key]) { navigate(map[e.key]); return; }
      }
      if (e.key === 'g') { gPending = true; gT = setTimeout(() => gPending = false, 800); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authed, theme]);

  if (!authed) return (
    <React.Fragment>
      <div style={{ flex: 1, minWidth: 0, height: '100vh', display: 'flex' }}>
        <Login onSignIn={() => { setAuthed(true); setRoute('home'); }} />
      </div>
      <PortalTweaks t={t} setTweak={setTweak} />
    </React.Fragment>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <Rail route={route} onNavigate={navigate} onOpenPalette={() => setPaletteOpen(true)}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} theme={theme}
        role={role} onToggleRole={() => setRole(role === 'admin' ? 'user' : 'admin')}
        downCount={window.SERVICES.filter(s => s.status === 'down').length}
        pendingCount={window.REQUESTS.filter(r => r.status === 'pending').length} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {route === 'home' && <Home role={role} tweaks={t} onOpenPalette={() => setPaletteOpen(true)} onNavigate={navigate} onOpenService={openService} />}
        {route === 'launch' && <Launcher role={role} onOpenService={openService} />}
        {route === 'service' && service && <ServiceView s={service} onBack={() => navigate('launch')} onOpenPalette={() => setPaletteOpen(true)} />}
        {route === 'requests' && <Requests role={role} onOpenService={openService} />}
        {route === 'status' && <Status role={role} />}
        {route === 'admin' && (role === 'admin' ? <Admin onOpenService={openService} /> : <Home role={role} tweaks={t} onOpenPalette={() => setPaletteOpen(true)} onNavigate={navigate} onOpenService={openService} />)}
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onOpenService={openService} />
      <PortalTweaks t={t} setTweak={setTweak} onSignOut={() => { setAuthed(false); }} />
    </div>
  );
}

function PortalTweaks({ t, setTweak, onSignOut }) {
  return (
    <TweaksPanel>
      <TweakSection label="Audience" />
      <TweakRadio label="View as" value={t.view} options={['admin', 'user']} onChange={v => setTweak('view', v)} />
      <TweakRadio label="Theme" value={t.theme} options={['dark', 'light']} onChange={v => setTweak('theme', v)} />

      <TweakSection label="Dashboard layout" />
      <TweakRadio label="Layout" value={t.layout} options={['command', 'streamFirst', 'compact']} onChange={v => setTweak('layout', v)} />

      <TweakSection label="Central services" />
      <TweakRadio label="Spotlight" value={t.central} options={['spotlight', 'banner', 'off']} onChange={v => setTweak('central', v)} />

      <TweakSection label="Service tiles" />
      <TweakRadio label="Tile style" value={t.tileStyle} options={['stripe', 'icon', 'list']} onChange={v => setTweak('tileStyle', v)} />

      <TweakSection label="Status visualization" />
      <TweakRadio label="Status viz" value={t.statusViz} options={['heartbeat', 'bars', 'dots']} onChange={v => setTweak('statusViz', v)} />

      {onSignOut && <React.Fragment>
        <TweakSection label="Session" />
        <TweakButton label="View login screen" onClick={onSignOut} />
      </React.Fragment>}
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
