import React, { useState, useEffect, useCallback, useRef } from './react.js';
import { Library } from './components/Library.jsx';
import { ReadSection } from './components/ReadSection.jsx';
import { ThinkSection } from './components/ThinkSection.jsx';
import { CreateSection } from './components/CreateSection.jsx';
import { Editor } from './components/Editor.jsx';
import { Toasts } from './components/ui.jsx';
import { seedIfNeeded } from './store.js';
import { setupQuill } from './quillSetup.js';
import { storage, uid } from './util.js';
import { Icon } from './icons.jsx';

function systemTheme() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}

const SECTIONS = [
  { id: 'write', label: 'Write', icon: 'PenLine' },
  { id: 'read', label: 'Read', icon: 'BookOpen' },
  { id: 'create', label: 'Create', icon: 'Shapes' },
  { id: 'think', label: 'Think', icon: 'Brain' },
];

function App() {
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [fatal, setFatal] = useState(null);
  const [view, setView] = useState({ name: 'library' });
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(() => storage.get('qalam.theme', null) || systemTheme());
  const explicit = useRef(!!storage.get('qalam.theme', null));

  useEffect(() => {
    if (explicit.current) document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return undefined; }
    const on = () => { if (!explicit.current) setTheme(mq.matches ? 'dark' : 'light'); };
    mq.addEventListener && mq.addEventListener('change', on);
    return () => mq.removeEventListener && mq.removeEventListener('change', on);
  }, []);
  const toggleTheme = useCallback(() => {
    explicit.current = true;
    setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; storage.set('qalam.theme', n); document.documentElement.setAttribute('data-theme', n); return n; });
  }, []);
  const themeMode = explicit.current ? theme : 'system';
  const setThemeMode = useCallback((mode) => {
    if (mode === 'system') {
      explicit.current = false;
      storage.set('qalam.theme', null);
      document.documentElement.removeAttribute('data-theme');
      setTheme(systemTheme());
    } else {
      explicit.current = true;
      storage.set('qalam.theme', mode);
      document.documentElement.setAttribute('data-theme', mode);
      setTheme(mode);
    }
  }, []);

  // On-screen keyboard: expose its height as --kb so bars sit above it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--kb', (kb > 60 ? Math.round(kb) : 0) + 'px');
        document.documentElement.classList.toggle('kb-open', kb > 60);
        if (window.scrollY) window.scrollTo(0, 0);
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text, kind) => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    if (kind !== 'busy') setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3200);
    return { close: () => dismiss(id) };
  }, [dismiss]);

  useEffect(() => {
    (async () => {
      if (!window.Quill) { setFatal('The editor engine could not be loaded. Check your internet connection and reload.'); return; }
      try { setupQuill(); } catch (e) { setFatal('The editor could not start: ' + e.message); return; }
      try { setPersistent(await seedIfNeeded()); } catch (e) { setPersistent(false); }
      setReady(true);
    })();
  }, []);

  const [section, setSectionState] = useState(() => storage.get('qalam.section', 'write'));
  const [think, setThink] = useState(null); // source handed to Think
  const [libKey, setLibKey] = useState('lib');
  const setSection = useCallback((s) => { setSectionState(s); storage.set('qalam.section', s); }, []);
  const openDoc = useCallback((id, extra) => setView({ name: 'editor', id, key: uid('v'), ...(extra || {}) }), []);
  const exit = useCallback(() => setView({ name: 'library', key: uid('v') }), []);
  const openSettings = useCallback(() => { storage.set('qalam.libSection', 'settings'); setLibKey(uid('lib')); setSection('write'); }, [setSection]);
  const askAbout = useCallback((ref) => { setThink({ ref, t: Date.now() }); setSection('think'); setView({ name: 'library', key: uid('v') }); }, [setSection]);

  if (fatal) {
    return <div className="ed-error"><Icon name="TriangleAlert" size={32} /><p>{fatal}</p><button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button></div>;
  }
  if (!ready) return <div className="splash"><span className="brand-mark" aria-hidden="true">ق</span><span className="spin" /></div>;

  return (
    <>
      {view.name === 'library' ? (
        <div className="shell">
          <nav className="snav" aria-label="Main">
            <div className="rail-brand"><span className="brand-mark" aria-hidden="true">ق</span><span className="brand-name">Qalam</span></div>
            {SECTIONS.map((n) => (
              <button type="button" key={n.id} className={'snav-item' + (section === n.id ? ' on' : '')} aria-current={section === n.id ? 'page' : undefined} onClick={() => setSection(n.id)}>
                <span className="snav-ico"><Icon name={n.icon} size={22} stroke={section === n.id ? 2.1 : 1.7} /></span>
                <span className="snav-label">{n.label}</span>
              </button>
            ))}
            <button type="button" className="snav-item rail-only" onClick={openSettings}><span className="snav-ico"><Icon name="Settings" size={22} stroke={1.7} /></span><span className="snav-label">Settings</span></button>
          </nav>
          <div className="shell-main">
            {section === 'write' && <Library key={libKey + view.key} embedded openSettings={openSettings} openDoc={openDoc} toast={toast} theme={theme} toggleTheme={toggleTheme} themeMode={themeMode} setThemeMode={setThemeMode} persistent={persistent} />}
            {section === 'read' && <ReadSection toast={toast} openDoc={openDoc} openSettings={openSettings} askAbout={askAbout} />}
            {section === 'create' && <CreateSection toast={toast} openDoc={openDoc} openSettings={openSettings} />}
            {section === 'think' && <ThinkSection toast={toast} openDoc={openDoc} openSettings={openSettings} initial={think} />}
          </div>
        </div>
      ) : <Editor key={view.key} docId={view.id} importHtml={view.importHtml} onExit={exit} toast={toast} theme={theme} toggleTheme={toggleTheme} themeMode={themeMode} setThemeMode={setThemeMode} openDoc={openDoc} onAsk={askAbout} />}
      <Toasts items={toasts} dismiss={dismiss} />
    </>
  );
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (this.state.err) {
      return (
        <div className="ed-error">
          <p>Something went wrong: {String(this.state.err.message || this.state.err)}</p>
          <p className="muted-p">Your documents are safe in this browser.</p>
          <button type="button" className="btn primary" onClick={() => this.setState({ err: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('app');
window.ReactDOM.createRoot(rootEl).render(<Boundary><App /></Boundary>);
