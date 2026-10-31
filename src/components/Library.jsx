import React, { useState, useEffect, useMemo, useRef } from '../react.js';
import { onBack } from '../platform.js';
import { LOGO } from '../brand.js';
import { Icon } from '../icons.jsx';
import { ConfirmDialog, PromptDialog, Sheet, Seg } from './ui.jsx';
import * as store from '../store.js';
import { TEMPLATES, STUDY_TEMPLATES, STUDY_TYPES } from '../templates.js';
import { Study } from './Study.jsx';
import { PasswordDialog } from './Tools.jsx';
import { deriveKey, decryptJSON, sessionKeys } from '../crypto.js';
import { getAIConfig, providerStatus, PROVIDERS } from '../ai.js';
import { HIGHLIGHTS } from '../constants.js';
import { deltaToHTML, previewFromHTML } from '../quillHtml.js';
import { fmtDate, readFileAs, storage } from '../util.js';
import { importDOCX } from '../exporters.js';
import { fontByStack } from '../constants.js';

const nd = (e) => e.preventDefault();
export const CATEGORIES = ['Personal', 'Work', 'School', 'Creative', 'Other'];

function Paper({ html, settings, className }) {
  const s = settings || {};
  const ref = useRef(null);
  const [k, setK] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => setK(el.clientWidth / 794);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = s.margins || { t: 96, l: 96, r: 96 };
  return (
    <div ref={ref} className={'paper-thumb ' + (className || '')} aria-hidden="true">
      {k > 0 && (
        <div className="pv-wrap" dir={s.dir || 'ltr'} style={{ transform: `scale(${k})`, padding: `${m.t}px ${m.r}px 0 ${m.l}px` }}>
          <div className="ql-editor pv" style={{ fontFamily: s.font, fontSize: (s.fontSize || 12) + 'pt', lineHeight: s.lineHeight || 1.15 }}
            dangerouslySetInnerHTML={{ __html: html || '' }} />
        </div>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const NAV = [
  { id: 'home', label: 'Home', icon: 'House' },
  { id: 'docs', label: 'Documents', icon: 'FileText' },
  { id: 'study', label: 'Study', icon: 'GraduationCap' },
  { id: 'templates', label: 'Templates', icon: 'LayoutTemplate' },
  { id: 'settings', label: 'Settings', icon: 'Settings' },
];

export function Library({ openDoc, toast, theme, toggleTheme, themeMode, setThemeMode, persistent, embedded, openSettings }) {
  const [docs, setDocs] = useState(null);
  const [folders, setFolders] = useState([]);
  const [section, setSectionState] = useState(() => storage.get('writex.libSection', 'home'));
  const [folder, setFolder] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('updated');
  const [layout, setLayoutState] = useState(() => storage.get('writex.docLayout', 'list'));
  const [dialog, setDialog] = useState(null);
  const [actionDoc, setActionDoc] = useState(null);
  const [actionPage, setActionPage] = useState(null);
  const [prefs, setPrefs] = useState(() => ({
    darkPaper: storage.get('writex.darkPaper', false),
    mobileView: storage.get('writex.mobileView', 'mobile'),
    toolbarHidden: storage.get('writex.mToolbarHidden', false),
  }));
  const [subjects, setSubjects] = useState([]);
  const [customTpls, setCustomTpls] = useState([]);
  const [stats, setStats] = useState({ days: {} });
  const [recentMode, setRecentMode] = useState('edited');
  const [filter, setFilter] = useState('none');
  const [unlock, setUnlock] = useState(null); // {doc, error}
  const [customHL, setCustomHL] = useState(() => storage.get('writex.customHighlights', []));
  const [aiState, setAiState] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const fileRef = useRef(null);
  const mainRef = useRef(null);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const setSection = (s) => { setSectionState(s); storage.set('writex.libSection', s); if (mainRef.current) mainRef.current.scrollTop = 0; };
  // Android back: Documents / Study / Templates / Settings return to Home first
  useEffect(() => (section !== 'home' ? onBack(() => { setSection('home'); return true; }) : undefined), [section]);
  const setLayout = (l) => { setLayoutState(l); storage.set('writex.docLayout', l); };
  const setPref = (k, v, key) => { setPrefs((p) => ({ ...p, [k]: v })); storage.set(key, v); };

  const refresh = async () => {
    try {
      const [d, f, subs, tpls, st] = await Promise.all([store.listDocs(), store.listFolders(), store.listSubjects().catch(() => []), store.listCustomTemplates().catch(() => []), store.getStats().catch(() => ({ days: {} }))]);
      setSubjects(subs); setCustomTpls(tpls); setStats(st);
      for (const doc of d) {
        if (!doc.preview && doc.delta) {
          doc.preview = previewFromHTML(deltaToHTML(doc.delta));
          store.updateDoc(doc.id, { preview: doc.preview, updatedAt: doc.updatedAt }).catch(() => {});
        }
      }
      setDocs(d); setFolders(f);
    } catch (e) {
      setDocs([]);
      toast('Your documents could not be loaded: ' + e.message, 'error');
    }
  };
  useEffect(() => { refresh(); }, []);

  const tplPreviews = useMemo(() => {
    const m = {};
    for (const t of [...TEMPLATES, ...STUDY_TEMPLATES]) m[t.id] = previewFromHTML(deltaToHTML(t.delta()));
    return m;
  }, []);
  const customPreviews = useMemo(() => {
    const m = {};
    for (const t of customTpls) m[t.id] = previewFromHTML(deltaToHTML(t.delta));
    return m;
  }, [customTpls]);

  const search = (list, s) => {
    const t = s.trim().toLowerCase();
    if (!t) return list;
    return list.filter((d) => (d.title || '').toLowerCase().includes(t) || (d.text || '').toLowerCase().includes(t));
  };
  const filtered = useMemo(() => {
    if (!docs) return [];
    let list = docs;
    if (folder === 'examples') list = list.filter((d) => d.example);
    else if (folder !== 'all') list = list.filter((d) => d.folderId === folder);
    if (filter === 'fav') list = list.filter((d) => d.favorite);
    else if (filter === 'private') list = list.filter((d) => d.locked);
    else if (filter.startsWith('cat:')) list = list.filter((d) => d.category === filter.slice(4));
    list = search(list, q);
    return [...list].sort((a, b) => (sort === 'title' ? (a.title || '').localeCompare(b.title || '') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
  }, [docs, folder, q, sort, filter]);

  // Password-protected documents are decrypted on this device before opening.
  const openSafe = (d) => {
    if (!d) return;
    if (typeof d === 'string') d = (docs || []).find((x) => x.id === d) || { id: d };
    if (d.locked && !sessionKeys.get(d.id)) { setUnlock({ doc: d }); return; }
    openDoc(d.id);
  };
  const tryUnlock = async (pw) => {
    const d = unlock.doc;
    try {
      const { key, salt } = await deriveKey(pw, d.locked.salt);
      const plain = await decryptJSON(d.locked, key);
      sessionKeys.set(d.id, { key, salt, plain });
      setUnlock(null);
      openDoc(d.id);
    } catch (e) { setUnlock({ doc: d, error: ((e && e.message) || 'That password is not correct.') + (d.locked.hint ? ' Hint: ' + d.locked.hint : '') }); }
  };
  const patchDoc = async (d, patch) => { await store.updateDoc(d.id, { ...patch, updatedAt: d.updatedAt }); refresh(); };

  const targetFolder = () => (section === 'docs' && folder !== 'all' && folder !== 'examples' ? folder : null);
  const newFromTemplate = async (tid) => {
    try {
      const d = tid.startsWith('custom:') ? await store.fromCustomTemplate(tid.slice(7), { folderId: targetFolder() }) : await store.fromTemplate(tid, targetFolder());
      openDoc(d.id);
    } catch (e) { toast('Could not create the document: ' + e.message, 'error'); }
  };

  const onImport = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (/\.txt$/i.test(file.name) || file.type === 'text/plain') {
      try {
        const text = await readFileAs(file, 'text');
        const d = await store.createDoc({ title: file.name.replace(/\.txt$/i, ''), folderId: targetFolder() });
        openDoc(d.id, { importHtml: { text } });
      } catch (err) { toast('Import failed: ' + err.message, 'error'); }
      return;
    }
    if (!/\.docx$/i.test(file.name)) { toast('Choose a Word (.docx) or text (.txt) file.', 'error'); return; }
    const busy = toast('Importing ' + file.name + '…', 'busy');
    try {
      const buf = await readFileAs(file, 'buffer');
      const { html } = await importDOCX(buf);
      const d = await store.createDoc({ title: file.name.replace(/\.docx$/i, ''), folderId: targetFolder() });
      busy.close();
      openDoc(d.id, { importHtml: html });
    } catch (err) {
      busy.close();
      toast('Import failed: ' + err.message, 'error');
    }
  };

  const folderName = (id) => (folders.find((f) => f.id === id) || {}).name;
  const count = (id) => (docs || []).filter((d) => (id === 'all' ? true : id === 'examples' ? d.example : d.folderId === id)).length;
  const openActions = (d) => { setActionPage(null); setActionDoc(d); };
  const closeActions = () => setActionDoc(null);
  const later = (fn) => { closeActions(); setTimeout(fn, 200); };

  const docRow = (d) => (
    <article className="drow" key={d.id}>
      <button type="button" className="drow-main" onClick={() => openSafe(d)} aria-label={'Open ' + d.title}>
        {d.locked ? <span className="lock-thumb sm" aria-hidden="true"><Icon name="Lock" size={18} /></span> : <Paper html={d.preview} settings={d.settings} className="sm" />}
        <span className="drow-text">
          <span className="drow-title" dir="auto">{d.favorite && <Icon name="Star" size={13} className="fav-ico" />}{d.title}</span>
          <span className="drow-meta">
            {fmtDate(d.updatedAt)}{d.words ? ` · ${d.words.toLocaleString()} words` : ''}
          </span>
          {(d.example || d.category || d.subjectId || d.locked || (d.folderId && folderName(d.folderId))) && (
            <span className="chips">
              {d.example && <span className="chip">Example</span>}
              {d.locked && <span className="chip"><Icon name="Lock" size={11} />Private</span>}
              {d.category && <span className="chip">{d.category}</span>}
              {d.subjectId && subjects.find((x) => x.id === d.subjectId) && <span className="chip" style={{ '--sc': subjects.find((x) => x.id === d.subjectId).color }}><i className="chip-dot" /><span dir="auto">{subjects.find((x) => x.id === d.subjectId).name}</span></span>}
              {d.folderId && folderName(d.folderId) && <span className="chip"><Icon name="Folder" size={12} /><span dir="auto">{folderName(d.folderId)}</span></span>}
            </span>
          )}
        </span>
      </button>
      <button type="button" className="tb lg" aria-label={'Options for ' + d.title} onClick={() => openActions(d)}><Icon name="Ellipsis" size={20} /></button>
    </article>
  );
  const docCard = (d) => (
    <article className="doc-card" key={d.id}>
      <button type="button" className="doc-open" onClick={() => openSafe(d)} aria-label={'Open ' + d.title}>
        {d.locked ? <span className="lock-thumb" aria-hidden="true"><Icon name="Lock" size={26} /></span> : <Paper html={d.preview} settings={d.settings} />}
      </button>
      <div className="doc-info">
        <div className="doc-text">
          <h3 dir="auto" title={d.title}>{d.title}</h3>
          <p>{fmtDate(d.updatedAt)}</p>
        </div>
        <button type="button" className="tb" aria-label={'Options for ' + d.title} onClick={() => openActions(d)}><Icon name="Ellipsis" size={18} /></button>
      </div>
    </article>
  );
  const docList = (list, grid) => (grid
    ? <div className="doc-grid">{list.map(docCard)}</div>
    : <div className="drows">{list.map(docRow)}</div>);

  const searchBox = (id) => (
    <label className="search">
      <Icon name="Search" size={18} />
      <input id={id} type="search" dir="auto" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" enterKeyHint="search" />
      {q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQ('')}><Icon name="X" size={16} /></button>}
    </label>
  );

  const loading = docs === null;
  const recent = (recentMode === 'opened' ? [...(docs || [])].sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0)) : (docs || [])).slice(0, 5);
  const favorites = (docs || []).filter((d) => d.favorite);
  // writing statistics
  const daysMap = stats.days || {};
  const today = store.dayKey();
  const wordsToday = daysMap[today] || 0;
  let weekWords = 0; let streak = 0;
  for (let i = 0; i < 7; i++) weekWords += daysMap[store.dayKey(Date.now() - i * 86400000)] || 0;
  for (let i = daysMap[today] ? 0 : 1; i < 400; i++) { if (daysMap[store.dayKey(Date.now() - i * 86400000)]) streak++; else break; }
  const totalWords = (docs || []).reduce((n, d) => n + (d.words || 0), 0);
  const week = Array.from({ length: 7 }, (_, i) => { const t = Date.now() - (6 - i) * 86400000; return { k: store.dayKey(t), d: new Date(t).toLocaleDateString(undefined, { weekday: 'narrow' }), n: daysMap[store.dayKey(t)] || 0 }; });
  const weekMax = Math.max(1, ...week.map((w) => w.n));
  const homeResults = q ? search(docs || [], q) : null;

  let content = null;
  if (section === 'home') {
    content = (
      <>
        <header className="home-head">
          <div className="brand">
            <img className="brand-mark" src={LOGO} alt="" aria-hidden="true" />
            <span className="brand-name">Writex</span>
          </div>
          <button type="button" className="tb lg" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={20} />
          </button>
        </header>
        <section className="hero">
          <h1>{greeting()}<span className="hero-ar" lang="ar"> · أهلًا</span></h1>
          <p>Write in Arabic, English, or both. Everything saves to this device as you type.</p>
        </section>
        {searchBox('home-search')}
        {homeResults ? (
          <section className="sec">
            <div className="sec-head"><h2>Results</h2><span className="sec-note">{homeResults.length}</span></div>
            {homeResults.length ? docList(homeResults) : <div className="empty sm"><Icon name="SearchX" size={24} /><p>Nothing matches “{q}”.</p></div>}
          </section>
        ) : (
          <>
            <section className="new-block">
              <button type="button" className="btn primary xl" onClick={() => newFromTemplate('blank')}>
                <Icon name="Plus" size={22} /><span>New document</span>
              </button>
              <div className="new-row">
                <button type="button" className="btn" onClick={() => newFromTemplate('blank-ar')}><Icon name="PilcrowLeft" size={18} /><span lang="ar">مستند عربي</span></button>
                <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="Upload" size={18} />Import .docx</button>
              </div>
            </section>
            <section className="stats-card" aria-label="Writing statistics">
              <div className="st-nums">
                <div><b className="tnum">{wordsToday.toLocaleString()}</b><span>words today</span></div>
                <div><b className="tnum">{weekWords.toLocaleString()}</b><span>this week</span></div>
                <div><b className="tnum">{streak}</b><span>{streak === 1 ? 'day streak' : 'day streak'}</span></div>
                <div><b className="tnum">{totalWords.toLocaleString()}</b><span>words in all</span></div>
              </div>
              <div className="st-week" aria-hidden="true">
                {week.map((w) => <div key={w.k} className={'st-day' + (w.k === today ? ' today' : '')}><i style={{ height: Math.max(3, Math.round((w.n / weekMax) * 40)) + 'px' }} /><span>{w.d}</span></div>)}
              </div>
            </section>
            {favorites.length > 0 && (
              <section className="sec">
                <div className="sec-head"><h2>Favorites</h2></div>
                {docList(favorites.slice(0, 4))}
              </section>
            )}
            <section className="sec">
              <div className="sec-head">
                <h2>Templates</h2>
                <button type="button" className="link-btn" onClick={() => setSection('templates')}>See all</button>
              </div>
              <div className="tpl-row">
                {TEMPLATES.filter((t) => !t.id.startsWith('blank')).map((t) => (
                  <button type="button" key={t.id} className="tpl mini" onClick={() => newFromTemplate(t.id)}>
                    <Paper html={tplPreviews[t.id]} settings={t.settings()} />
                    <span className="tpl-name" dir="auto">{t.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="sec">
              <div className="sec-head">
                <h2>Recent</h2>
                <Seg label="Recent documents" value={recentMode} onChange={setRecentMode} options={[{ value: 'edited', label: 'Edited' }, { value: 'opened', label: 'Opened' }]} />
              </div>
              {loading ? <div className="empty sm"><span className="spin" /> Loading…</div>
                : recent.length ? docList(recent)
                  : <div className="empty sm"><Icon name="FilePlus2" size={24} /><p>No documents yet. Tap New document to start.</p></div>}
            </section>
          </>
        )}
      </>
    );
  } else if (section === 'docs') {
    content = (
      <>
        <header className="sec-top">
          <h1>Documents</h1>
          <div className="sec-top-actions">
            <button type="button" className="tb lg" aria-label={layout === 'grid' ? 'Show as list' : 'Show as grid'} onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}>
              <Icon name={layout === 'grid' ? 'List' : 'LayoutGrid'} size={20} />
            </button>
            <button type="button" className="tb lg" aria-label="New folder" onClick={() => setDialog({ kind: 'new-folder' })}><Icon name="FolderPlus" size={20} /></button>
            <button type="button" className="tb lg accent" aria-label="New document" onClick={() => newFromTemplate('blank')}><Icon name="Plus" size={22} /></button>
          </div>
        </header>
        {searchBox('docs-search')}
        <div className="fchips" role="tablist" aria-label="Folders">
          <button type="button" role="tab" aria-selected={folder === 'all'} className={'fchip' + (folder === 'all' ? ' on' : '')} onClick={() => setFolder('all')}>All <em>{count('all')}</em></button>
          {(docs || []).some((d) => d.example) && <button type="button" role="tab" aria-selected={folder === 'examples'} className={'fchip' + (folder === 'examples' ? ' on' : '')} onClick={() => setFolder('examples')}>Examples <em>{count('examples')}</em></button>}
          {folders.map((f) => (
            <button type="button" role="tab" key={f.id} aria-selected={folder === f.id} className={'fchip' + (folder === f.id ? ' on' : '')} onClick={() => setFolder(f.id)}>
              <Icon name={folder === f.id ? 'FolderOpen' : 'Folder'} size={14} /><span dir="auto">{f.name}</span> <em>{count(f.id)}</em>
            </button>
          ))}
          <button type="button" className="fchip add" onClick={() => setDialog({ kind: 'new-folder' })}><Icon name="Plus" size={14} />Folder</button>
        </div>
        <div className="fchips sm" role="group" aria-label="Filter">
          {[['none', 'Everything'], ['fav', '★ Favorites'], ['private', 'Private'], ...CATEGORIES.map((c) => ['cat:' + c, c])].map(([k, l]) => (
            <button type="button" key={k} className={'fchip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="list-tools">
          {folder !== 'all' && folder !== 'examples' && folderName(folder) ? (
            <div className="folder-tools">
              <button type="button" className="link-btn" onClick={() => setDialog({ kind: 'rename-folder', folder: folders.find((f) => f.id === folder) })}><Icon name="Pencil" size={14} />Rename</button>
              <button type="button" className="link-btn danger-text" onClick={() => setDialog({ kind: 'delete-folder', folder: folders.find((f) => f.id === folder) })}><Icon name="Trash2" size={14} />Delete folder</button>
            </div>
          ) : <span className="sec-note">{filtered.length} {filtered.length === 1 ? 'document' : 'documents'}</span>}
          <label className="sort">
            <Icon name="ArrowUpDown" size={14} />
            <select id="lib-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort documents">
              <option value="updated">Last modified</option>
              <option value="created">Date created</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
        {loading ? <div className="empty"><span className="spin" /> Loading documents…</div>
          : filtered.length === 0 ? (
            <div className="empty">
              <Icon name={q ? 'SearchX' : 'FilePlus2'} size={28} />
              <p>{q ? `Nothing matches “${q}”.` : folder === 'all' ? 'No documents yet. Tap + to create one.' : 'This folder is empty. Create a document here, or move one in from its ⋯ menu.'}</p>
              {!q && <button type="button" className="btn primary" onClick={() => newFromTemplate('blank')}><Icon name="Plus" size={18} />New document</button>}
            </div>
          ) : docList(filtered, layout === 'grid')}
      </>
    );
  } else if (section === 'study') {
    content = <Study docs={docs} subjects={subjects} refresh={refresh} openDoc={openSafe} toast={toast} renderRow={docRow} />;
  } else if (section === 'templates') {
    content = (
      <>
        <header className="sec-top"><h1>Templates</h1></header>
        <p className="sec-lead">Each template opens as a new document you can change freely. Save any document as a template from its menu.</p>
        {customTpls.length > 0 && (
          <section className="sec">
            <div className="sec-head"><h2>My templates</h2></div>
            <div className="tpl-grid">
              {customTpls.map((t) => (
                <div key={t.id} className="tpl custom">
                  <button type="button" className="tpl-open" onClick={() => newFromTemplate('custom:' + t.id)} aria-label={'New from ' + t.name}><Paper html={customPreviews[t.id]} settings={t.settings} /></button>
                  <span className="tpl-name" dir="auto">{t.name}</span>
                  <span className="tpl-meta"><b className={'lang ' + (t.lang || 'EN').toLowerCase()}>{t.lang || 'EN'}</b>
                    <button type="button" className="link-btn danger-text" onClick={() => setDialog({ kind: 'delete-tpl', tpl: t })}>Delete</button></span>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="sec">
          <div className="sec-head"><h2>Study</h2></div>
          <div className="tpl-grid">
            {STUDY_TEMPLATES.map((t) => (
              <button type="button" key={t.id} className="tpl" onClick={() => newFromTemplate(t.id)}>
                <Paper html={tplPreviews[t.id]} settings={t.settings()} />
                <span className="tpl-name" dir="auto">{t.name}</span>
                <span className="tpl-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>
        <div className="sec-head"><h2>Documents</h2></div>
        <div className="tpl-grid">
          {TEMPLATES.map((t) => {
            const st = t.settings();
            return (
              <button type="button" key={t.id} className="tpl" onClick={() => newFromTemplate(t.id)}>
                <Paper html={tplPreviews[t.id]} settings={st} />
                <span className="tpl-name" dir="auto">{t.name}</span>
                <span className="tpl-desc">{t.desc}</span>
                <span className="tpl-meta"><b className={'lang ' + t.lang.toLowerCase()}>{t.lang}</b>{fontByStack(st.font).name}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <header className="sec-top"><h1>Settings</h1></header>
        <section className="set-group">
          <h2>Appearance</h2>
          <div className="set-card">
            <div className="set-row col">
              <span className="set-label">Theme<small>Dark uses true black, which saves battery on OLED screens.</small></span>
              <Seg label="Theme" value={themeMode} onChange={setThemeMode} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light', icon: 'Sun' }, { value: 'dark', label: 'Dark', icon: 'Moon' }]} />
            </div>
            <label className="set-row">
              <span className="set-label">Dark paper<small>Show pages in a dark colour while editing. Exports stay white.</small></span>
              <input id="set-darkpaper" type="checkbox" className="switch" checked={prefs.darkPaper} onChange={(e) => setPref('darkPaper', e.target.checked, 'writex.darkPaper')} />
            </label>
          </div>
        </section>
        <section className="set-group">
          <h2>Editing on phones</h2>
          <div className="set-card">
            <div className="set-row col">
              <span className="set-label">Open documents in<small>Mobile view reflows text to your screen. Page view shows real A4 pages.</small></span>
              <Seg label="Default view on phones" value={prefs.mobileView} onChange={(v) => setPref('mobileView', v, 'writex.mobileView')} options={[{ value: 'mobile', label: 'Mobile view', icon: 'Smartphone' }, { value: 'print', label: 'Page view', icon: 'Files' }]} />
            </div>
            <label className="set-row">
              <span className="set-label">Formatting toolbar<small>When off, a floating Aa button opens formatting.</small></span>
              <input id="set-toolbar" type="checkbox" className="switch" checked={!prefs.toolbarHidden} onChange={(e) => setPref('toolbarHidden', !e.target.checked, 'writex.mToolbarHidden')} />
            </label>
          </div>
        </section>
        <section className="set-group">
          <h2>Highlight colours</h2>
          <div className="set-card">
            <div className="set-row col">
              <span className="set-label">Your colours<small>These appear next to the built-in highlight colours when you format text.</small></span>
              <div className="mswatches">
                {HIGHLIGHTS.map((c) => <span key={c} className="msw static" style={{ background: c }} />)}
                {customHL.map((c) => (
                  <button type="button" key={c} className="msw removable" style={{ background: c }} aria-label={'Remove colour ' + c} onClick={() => { const n = customHL.filter((x) => x !== c); setCustomHL(n); storage.set('writex.customHighlights', n); }}><Icon name="X" size={12} /></button>
                ))}
                <label className="msw add" aria-label="Add colour"><Icon name="Plus" size={16} />
                  <input id="set-hl" type="color" defaultValue="#FFD6E7" onChange={(e) => { const c = e.target.value; const n = [...customHL.filter((x) => x !== c), c].slice(-8); setCustomHL(n); storage.set('writex.customHighlights', n); }} />
                </label>
              </div>
            </div>
          </div>
        </section>
        <section className="set-group">
          <h2>Writing assistant</h2>
          <div className="set-card">
            <button type="button" className="set-row btn-row" onClick={async () => { setAiState('checking'); setAiState(await providerStatus(getAIConfig())); }}>
              <span className="set-label">Provider: {(PROVIDERS.find((p) => p.id === getAIConfig().provider) || PROVIDERS[0]).label}
                <small>{aiState === 'checking' ? 'Checking…' : aiState ? (aiState.ready ? (aiState.warning || 'Ready to use.') : aiState.message) : 'Tap to check whether AI is available. Change providers from the assistant inside a document.'}</small></span>
              <Icon name="Sparkles" size={18} />
            </button>
          </div>
        </section>
        <section className="set-group">
          <h2>Sync & offline</h2>
          <div className="set-card">
            <div className="set-row"><span className="set-label">{online ? 'Online' : 'Offline'}<small>Documents live on this device, so you can keep editing without a connection. The writing assistant and exports that load extra tools need the internet.</small></span><Icon name={online ? 'Wifi' : 'WifiOff'} size={18} /></div>
            <div className="set-row"><span className="set-label">Cloud sync: not set up<small>Sync and shared editing need a server account. The app keeps a revision timestamp on every document so sync can be added later without changing your files.</small></span><Icon name="CloudOff" size={18} /></div>
          </div>
        </section>
        <section className="set-group">
          <h2>Keyboard shortcuts</h2>
          <div className="set-card kbd-list">
            {[['Ctrl + B / I / U', 'Bold, italic, underline'], ['Ctrl + Z / Y', 'Undo, redo'], ['Ctrl + F', 'Find'], ['Ctrl + H', 'Replace'], ['Ctrl + Enter', 'Page break'], ['Ctrl + S', 'Confirm saved'], ['Ctrl + P', 'Export PDF'], ['Tab / Shift + Tab', 'Indent lists']].map(([k, v]) => (
              <div key={k} className="set-row"><span className="set-label">{v}</span><kbd>{k}</kbd></div>
            ))}
          </div>
        </section>
        <section className="set-group">
          <h2>Storage</h2>
          <div className="set-card">
            <div className="set-row">
              <span className="set-label">{(docs || []).length} {(docs || []).length === 1 ? 'document' : 'documents'} · {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
                <small>{persistent ? 'Saved on this device in this browser. Export to PDF or Word to keep a copy elsewhere.' : "This view can't keep data, so documents last until you close it."}</small>
              </span>
              <Icon name={persistent ? 'HardDrive' : 'TriangleAlert'} size={20} />
            </div>
            <button type="button" className="set-row btn-row" onClick={() => fileRef.current && fileRef.current.click()}>
              <span className="set-label">Import a Word or text file</span><Icon name="Upload" size={18} />
            </button>
          </div>
        </section>
        <section className="set-group">
          <h2>About</h2>
          <div className="set-card">
            <div className="set-row"><span className="set-label">Writex<small>A writing, reading and learning workspace for Arabic and English. Pages, tables, images, equations, references, study notebooks, a reader, a studio and a writing assistant, with PDF and Word export.</small></span></div>
          </div>
        </section>
      </>
    );
  }

  const ad = actionDoc;
  return (
    <div className={'lib' + (embedded ? ' embedded' : '')}>
      {!embedded && (
        <nav className="bnav" aria-label="Main">
          <div className="rail-brand"><img className="brand-mark" src={LOGO} alt="" aria-hidden="true" /><span className="brand-name">Writex</span></div>
          {NAV.map((n) => (
            <button type="button" key={n.id} className={'bnav-item' + (section === n.id ? ' on' : '')} aria-current={section === n.id ? 'page' : undefined} onClick={() => setSection(n.id)}>
              <span className="bnav-ico"><Icon name={n.icon} size={22} stroke={section === n.id ? 2.1 : 1.7} /></span>
              <span className="bnav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      )}
      <main className="lib-main" ref={mainRef}>
        {embedded && (
          <div className="subtabs" role="tablist" aria-label="Write">
            {NAV.filter((n) => n.id !== 'settings').map((n) => (
              <button type="button" role="tab" key={n.id} aria-selected={section === n.id} className={'subtab' + (section === n.id ? ' on' : '')} onClick={() => setSection(n.id)}>
                <Icon name={n.icon} size={16} />{n.label}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={section === 'settings'} aria-label="Settings" className={'subtab icon' + (section === 'settings' ? ' on' : '')} onClick={() => setSection('settings')}><Icon name="Settings" size={17} /></button>
          </div>
        )}
        <div className="lib-inner" key={section}>{content}</div>
      </main>
      <input ref={fileRef} id="import-docx" type="file" accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={onImport} />

      <Sheet open={!!ad} onClose={closeActions} title={ad ? ({ move: 'Move to folder', category: 'Category', subject: 'Study subject' }[actionPage] || ad.title) : ''}
        actions={actionPage ? <button type="button" data-back className="tb" aria-label="Back" onMouseDown={nd} onClick={() => setActionPage(null)}><Icon name="ArrowLeft" size={20} /></button> : null}>
        {ad && actionPage === 'category' && (
          <div className="mlist">
            {[null, ...CATEGORIES].map((c) => (
              <button type="button" key={c || 'none'} className={'mrow' + ((ad.category || null) === c ? ' on' : '')} onClick={() => { patchDoc(ad, { category: c }); closeActions(); }}>
                <span className="mrow-label">{c || 'No category'}</span>{(ad.category || null) === c && <Icon name="Check" size={18} />}
              </button>
            ))}
          </div>
        )}
        {ad && actionPage === 'subject' && (
          <div className="mlist">
            {[{ id: null, name: 'Not a study document' }, ...subjects].map((sub) => (
              <button type="button" key={sub.id || 'none'} className={'mrow' + ((ad.subjectId || null) === sub.id ? ' on' : '')} onClick={() => { patchDoc(ad, { subjectId: sub.id, studyType: sub.id ? (ad.studyType || 'notes') : null }); closeActions(); }}>
                {sub.color && <span className="subj-dot" style={{ background: sub.color }} />}<span className="mrow-label" dir="auto">{sub.name}</span>{(ad.subjectId || null) === sub.id && <Icon name="Check" size={18} />}
              </button>
            ))}
            {ad.subjectId && (
              <div className="mrow col-row">
                <span className="mrow-label">Type</span>
                <div className="mchips">{STUDY_TYPES.map((t) => <button type="button" key={t.id} className={'mchip' + (ad.studyType === t.id ? ' on' : '')} onClick={() => { patchDoc(ad, { studyType: t.id }); closeActions(); }}>{t.label}</button>)}</div>
              </div>
            )}
            {!subjects.length && <p className="mnote" style={{ padding: '0 14px 12px' }}>Create a subject in the Study tab first.</p>}
          </div>
        )}
        {ad && !['move', 'category', 'subject'].includes(actionPage) && (
          <div className="mlist">
            <button type="button" className="mrow" onClick={() => { closeActions(); openSafe(ad); }}><span className="mrow-ico"><Icon name="FolderOpen" size={19} /></span><span className="mrow-label">Open</span></button>
            <button type="button" className="mrow" onClick={() => { patchDoc(ad, { favorite: !ad.favorite }); closeActions(); }}><span className="mrow-ico"><Icon name="Star" size={19} /></span><span className="mrow-label">{ad.favorite ? 'Remove from favorites' : 'Add to favorites'}</span></button>
            <button type="button" className="mrow" onClick={() => setActionPage('category')}><span className="mrow-ico"><Icon name="Tag" size={19} /></span><span className="mrow-label">Category</span><span className="mrow-val">{ad.category || 'None'}</span><Icon name="ChevronRight" size={16} className="mrow-chev" /></button>
            <button type="button" className="mrow" onClick={() => setActionPage('subject')}><span className="mrow-ico"><Icon name="GraduationCap" size={19} /></span><span className="mrow-label">Study subject</span><span className="mrow-val" dir="auto">{(subjects.find((x) => x.id === ad.subjectId) || {}).name || 'None'}</span><Icon name="ChevronRight" size={16} className="mrow-chev" /></button>
            <button type="button" className="mrow" onClick={() => later(() => setDialog({ kind: 'rename', doc: ad }))}><span className="mrow-ico"><Icon name="Pencil" size={19} /></span><span className="mrow-label">Rename</span></button>
            <button type="button" className="mrow" onClick={async () => { closeActions(); try { await store.duplicateDoc(ad.id); await refresh(); toast('Duplicated “' + ad.title + '”'); } catch (e) { toast(e.message, 'error'); } }}><span className="mrow-ico"><Icon name="Copy" size={19} /></span><span className="mrow-label">Duplicate</span></button>
            <button type="button" className="mrow" onClick={() => setActionPage('move')}><span className="mrow-ico"><Icon name="FolderInput" size={19} /></span><span className="mrow-label">Move to folder</span><span className="mrow-val" dir="auto">{folderName(ad.folderId) || 'None'}</span><Icon name="ChevronRight" size={16} className="mrow-chev" /></button>
            <button type="button" className="mrow danger" onClick={() => later(() => setDialog({ kind: 'delete', doc: ad }))}><span className="mrow-ico"><Icon name="Trash2" size={19} /></span><span className="mrow-label">Delete</span></button>
          </div>
        )}
        {ad && actionPage === 'move' && (
          <div className="mlist">
            {[{ id: null, name: 'No folder' }, ...folders].map((f) => (
              <button type="button" key={f.id || 'none'} className={'mrow' + ((ad.folderId || null) === f.id ? ' on' : '')}
                onClick={async () => { await store.updateDoc(ad.id, { folderId: f.id, updatedAt: ad.updatedAt }); closeActions(); refresh(); if (f.id) toast('Moved to ' + f.name); }}>
                <span className="mrow-ico"><Icon name={f.id ? 'Folder' : 'FileText'} size={19} /></span><span className="mrow-label" dir="auto">{f.name}</span>
                {(ad.folderId || null) === f.id && <Icon name="Check" size={18} />}
              </button>
            ))}
            <button type="button" className="mrow accent" onClick={() => later(() => setDialog({ kind: 'new-folder-move', doc: ad }))}><span className="mrow-ico"><Icon name="FolderPlus" size={19} /></span><span className="mrow-label">New folder…</span></button>
          </div>
        )}
      </Sheet>

      {dialog && dialog.kind === 'rename' && (
        <PromptDialog title="Rename document" label="Document name" initial={dialog.doc.title} onClose={() => setDialog(null)}
          onSubmit={async (v) => { await store.updateDoc(dialog.doc.id, { title: v, updatedAt: dialog.doc.updatedAt }); refresh(); toast('Renamed to “' + v + '”'); }} />
      )}
      {dialog && dialog.kind === 'delete' && (
        <ConfirmDialog title="Delete document?" message={`“${dialog.doc.title}” will be permanently removed from this device. This can't be undone.`}
          onClose={() => setDialog(null)} onConfirm={async () => { await store.deleteDoc(dialog.doc.id); refresh(); toast('Deleted “' + dialog.doc.title + '”'); }} />
      )}
      {dialog && dialog.kind === 'new-folder' && (
        <PromptDialog title="New folder" label="Folder name" placeholder="e.g. School, Stories" confirmLabel="Create" onClose={() => setDialog(null)}
          onSubmit={async (v) => { const f = await store.createFolder(v); await refresh(); setSection('docs'); setFolder(f.id); }} />
      )}
      {dialog && dialog.kind === 'rename-folder' && dialog.folder && (
        <PromptDialog title="Rename folder" label="Folder name" initial={dialog.folder.name} onClose={() => setDialog(null)}
          onSubmit={async (v) => { await store.renameFolder(dialog.folder.id, v); refresh(); }} />
      )}
      {dialog && dialog.kind === 'delete-folder' && dialog.folder && (
        <ConfirmDialog title="Delete folder?" message={`“${dialog.folder.name}” will be removed. Its documents stay in All.`}
          onClose={() => setDialog(null)} onConfirm={async () => { await store.deleteFolder(dialog.folder.id); setFolder('all'); refresh(); }} />
      )}
      {dialog && dialog.kind === 'delete-tpl' && (
        <ConfirmDialog title="Delete template?" message={`“${dialog.tpl.name}” will be removed from your templates. Documents made from it are not affected.`}
          onClose={() => setDialog(null)} onConfirm={async () => { await store.deleteCustomTemplate(dialog.tpl.id); refresh(); }} />
      )}
      {unlock && <PasswordDialog mode="unlock" error={unlock.error} onClose={() => setUnlock(null)} onSubmit={tryUnlock} />}
      {dialog && dialog.kind === 'new-folder-move' && (
        <PromptDialog title="New folder" label="Folder name" confirmLabel="Create and move" onClose={() => setDialog(null)}
          onSubmit={async (v) => { const f = await store.createFolder(v); await store.updateDoc(dialog.doc.id, { folderId: f.id, updatedAt: dialog.doc.updatedAt }); refresh(); toast('Moved to ' + v); }} />
      )}
    </div>
  );
}
