import React, { useState, useEffect, useCallback, useRef } from './react.js';
import { LOGO } from './brand.js';
import { initNative, hideSplash, setSystemBars, setRootBack, setLayerBack, isNative } from './platform.js';
import { Library } from './components/Library.jsx';
import { ReadSection } from './components/ReadSection.jsx';
import { ThinkSection } from './components/ThinkSection.jsx';
import { CreateSection } from './components/CreateSection.jsx';
import { Editor } from './components/Editor.jsx';
import { Toasts } from './components/ui.jsx';
import { seedIfNeeded } from './store.js';
import * as store from './store.js';
import * as wx from './writexAI.js';
import { setupQuill } from './quillSetup.js';
import { storage, uid } from './util.js';
import { Icon } from './icons.jsx';
import { tr, applyLang, setLang } from './i18n.js';

function systemTheme() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}

const SECTIONS = [
  { id: 'write', label: tr('Write'), icon: 'PenLine' },
  { id: 'read', label: tr('Read'), icon: 'BookOpen' },
  { id: 'create', label: tr('Create'), icon: 'Shapes' },
  { id: 'think', label: tr('Think'), icon: 'Brain' },
];

// Closes whatever is on top: a menu, sheet, dialog or full-screen view, then any
// in-page "Back" button (marked data-back). Returns true when something handled it.
function layerBack() {
  const z = (el) => { const v = parseInt(getComputedStyle(el).zIndex, 10); return Number.isNaN(v) ? 0 : v; };
  const layers = [...document.querySelectorAll('.present, .pop, .scrim, .sheet-scrim:not(.out), .draw, .reader, .studio-page')];
  if (layers.length) {
    const top = layers.reduce((a, b) => (z(b) >= z(a) ? b : a));
    const btn = top.querySelector('[data-back]') || top.querySelector('[data-close]');
    if (btn) { btn.click(); return true; }
    const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
    (document.activeElement || document.body).dispatchEvent(esc);
    return true;
  }
  return false;
}
function pageBack() {
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
  const back = [...document.querySelectorAll('[data-back]')].filter(visible).pop();
  if (back) { back.click(); return true; }
  return false;
}

function App() {
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [fatal, setFatal] = useState(null);
  const [view, setView] = useState({ name: 'library' });
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(() => storage.get('writex.theme', null) || systemTheme());
  const explicit = useRef(!!storage.get('writex.theme', null));

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
    setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; storage.set('writex.theme', n); document.documentElement.setAttribute('data-theme', n); return n; });
  }, []);
  const themeMode = explicit.current ? theme : 'system';
  const setThemeMode = useCallback((mode) => {
    if (mode === 'system') {
      explicit.current = false;
      storage.set('writex.theme', null);
      document.documentElement.removeAttribute('data-theme');
      setTheme(systemTheme());
    } else {
      explicit.current = true;
      storage.set('writex.theme', mode);
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

  useEffect(() => { initNative({ theme }); }, []);
  useEffect(() => {
    (async () => {
      if (!window.Quill) { setFatal(tr('The editor engine could not be loaded. Restart the app, or reload the page.')); return; }
      try { setupQuill(); } catch (e) { setFatal(tr('The editor could not start: {0}', e.message)); return; }
      try { setPersistent(await seedIfNeeded()); } catch (e) { setPersistent(false); }
      setReady(true);
    })();
  }, []);

  const [section, setSectionState] = useState(() => storage.get('writex.section', 'write'));
  const [think, setThink] = useState(null); // source handed to Think
  const [libKey, setLibKey] = useState('lib');
  const setSection = useCallback((s) => { setSectionState(s); storage.set('writex.section', s); }, []);
  const openDoc = useCallback((id, extra) => setView({ name: 'editor', id, key: uid('v'), ...(extra || {}) }), []);
  const exit = useCallback(() => setView({ name: 'library', key: uid('v') }), []);
  const openSettings = useCallback(() => { storage.set('writex.libSection', 'settings'); setLibKey(uid('lib')); setSection('write'); }, [setSection]);
  // Android back button: close the topmost layer, then step back through screens
  const navRef = useRef({});
  navRef.current = { section, view, setSection };
  useEffect(() => {
    setLayerBack(layerBack);
    setRootBack(() => {
      if (pageBack()) return true;
      const n = navRef.current;
      if (n.view.name !== 'library') return false;
      if (n.section !== 'write') { n.setSection('write'); return true; }
      return false;
    });
  }, []);
  useEffect(() => { setSystemBars(theme); }, [theme]);
  useEffect(() => { if (ready || fatal) hideSplash(); }, [ready, fatal]);

  // Other screens can ask to open a section (e.g. Settings › Task history)
  useEffect(() => {
    const go = (e) => {
      const d = e.detail || {};
      if (d.tab) storage.set('writex.thinkTab', d.tab);
      setView({ name: 'library', key: uid('v') });
      if (d.section) setSection(d.section);
    };
    window.addEventListener('writex:navigate', go);
    return () => window.removeEventListener('writex:navigate', go);
  }, [setSection]);
  // Writex AI tasks that were still running when the app closed finish on the
  // server; follow them again and say when they are done.
  useEffect(() => {
    if (!ready) return;
    wx.resumeUnfinished((job) => { if (job.status === 'completed') toast(tr('Writex AI finished: {0}', job.title || tr('task'))); });
  }, [ready]);

  // Hooks for the automated device test (scripts/device-test.mjs)
  useEffect(() => {
    const hooks = (window.__writex = window.__writex || {});
    hooks.exportLatest = async (kind) => {
      const docs = await store.listDocs();
      if (!docs.length) throw new Error(tr('No documents'));
      openDoc(docs[0].id);
      for (let i = 0; i < 100 && !hooks.exportCurrent; i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1500));
      return hooks.exportCurrent(kind);
    };
  }, [openDoc]);

  const askAbout = useCallback((ref) => { setThink({ ref, t: Date.now() }); setSection('think'); setView({ name: 'library', key: uid('v') }); }, [setSection]);

  if (fatal) {
    return <div className="ed-error"><Icon name="TriangleAlert" size={32} /><p>{fatal}</p><button type="button" className="btn primary" onClick={() => location.reload()}>{tr('Reload')}</button></div>;
  }
  if (!ready) return <div className="splash"><img className="brand-mark" src={LOGO} alt="" aria-hidden="true" /><span className="spin" /></div>;

  return (
    <>
      {view.name === 'library' ? (
        <div className="shell">
          <nav className="snav" aria-label={tr('Main')}>
            <div className="rail-brand"><img className="brand-mark" src={LOGO} alt="" aria-hidden="true" /><span className="brand-name">{tr('Writex')}</span></div>
            {SECTIONS.map((n) => (
              <button type="button" key={n.id} className={'snav-item' + (section === n.id ? ' on' : '')} aria-current={section === n.id ? 'page' : undefined} onClick={() => setSection(n.id)}>
                <span className="snav-ico"><Icon name={n.icon} size={22} stroke={section === n.id ? 2.1 : 1.7} /></span>
                <span className="snav-label">{n.label}</span>
              </button>
            ))}
            <button type="button" className="snav-item rail-only" onClick={openSettings}><span className="snav-ico"><Icon name="Settings" size={22} stroke={1.7} /></span><span className="snav-label">{tr('Settings')}</span></button>
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
          <p>{tr('Something went wrong:')}{' '}{String(this.state.err.message || this.state.err)}</p>
          <p className="muted-p">{tr('Your documents are safe on this device.')}</p>
          <button type="button" className="btn primary" onClick={() => this.setState({ err: null })}>{tr('Try again')}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

applyLang();
// The Android/iOS app opens in AMOLED black by default; Settings can switch to light or system.
if (isNative && storage.get('writex.theme', null) == null) storage.set('writex.theme', 'dark');
if (storage.get('writex.theme', null)) document.documentElement.setAttribute('data-theme', storage.get('writex.theme', null));
window.__writex = Object.assign(window.__writex || {}, { setLang, setAIServer: (u) => wx.setServerUrl(u) });
const rootEl = document.getElementById('app');
window.ReactDOM.createRoot(rootEl).render(<Boundary><App /></Boundary>);
