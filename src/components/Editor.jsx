import React, { useState, useEffect, useRef, useMemo, useCallback } from '../react.js';
import { LOGO } from '../brand.js';
import { Icon } from '../icons.jsx';
import { setupQuill, normalizeDelta, splitNewlines } from '../quillSetup.js';
import { computePagination } from '../paginate.js';
import { pageGeometry, DEFAULT_SETTINGS, fontByStack } from '../constants.js';
import { debounce, countText, clamp, saveFile, savedLabel, safeFilename, readFileAs, downscaleImage, storage } from '../util.js';
import { isNative, nativeShare, BACKGROUND_EVENT } from '../platform.js';
import { previewFromRoot } from '../quillHtml.js';
import { docText, findAll } from '../find.js';
import { exportPDF, exportDOCX, exportHTML, importDOCX } from '../exporters.js';
import * as store from '../store.js';
import { Ribbon } from './Ribbon.jsx';
import { FindPanel } from './FindPanel.jsx';
import { HeaderFooterDialog, WordCountDialog, LinkDialog, MarginsDialog } from './Dialogs.jsx';
import { ConfirmDialog, PromptDialog, Modal, Seg } from './ui.jsx';
import { MobileToolbar, MobileSheets } from './MobileTools.jsx';
import { useIsMobile, matches, MOBILE_QUERY } from '../hooks.js';
import { BLOCK_EMBEDS } from '../quillSetup.js';
import * as refsLib from '../references.js';
import { coverOps } from '../templates.js';
import { textToDelta } from '../exporters.js';
import { sessionKeys, encryptJSON, decryptJSON, deriveKey, cryptoAvailable } from '../crypto.js';
import { AIPanel } from './AIPanel.jsx';
import { Reader } from './Reader.jsx';
import { DrawingEditor } from './Drawing.jsx';
import { EquationDialog } from './EquationDialog.jsx';
import { FootnoteDialog, SourcesSheet, CoverDialog, ParagraphSheet, VersionsSheet, PasswordDialog } from './Tools.jsx';

const ROOT_SEL = '.qwrap .ql-editor';
const PN_FORMATS = {
  n: (k) => String(k),
  pageof: (k, n) => `Page ${k} of ${n}`,
  slash: (k, n) => `${k} / ${n}`,
  dash: (k) => `— ${k} —`,
  ar: (k, n) => `صفحة ${k} من ${n}`,
};

let pgStyle = null;
function pgStyleEl() {
  if (!pgStyle) { pgStyle = document.createElement('style'); pgStyle.id = 'writex-pagination'; document.head.appendChild(pgStyle); }
  return pgStyle;
}

// Reflowed single-column layout used on phones ("Mobile view")
function mobileGeometry(s, workW) {
  const base = pageGeometry(s);
  const W = Math.max(280, Math.round((workW || 360) - 20));
  const m = { t: 28, b: 44, l: 20, r: 20 };
  return { ...base, W, m, C: 320, contentW: W - m.l - m.r };
}

export function Editor({ docId, importHtml, onExit, toast, theme, toggleTheme, themeMode, setThemeMode, openDoc, onAsk }) {
  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState(null);
  const [toolbarHidden, setToolbarHiddenState] = useState(() => storage.get('writex.mToolbarHidden', false));
  const setToolbarHidden = (v) => { setToolbarHiddenState(v); storage.set('writex.mToolbarHidden', v); };
  const [workW, setWorkW] = useState(() => window.innerWidth);
  const [mScale, setMScale] = useState(() => storage.get('writex.mScale', 1));
  const [panel, setPanel] = useState(null); // ai | sources | paragraph | versions
  const [reading, setReading] = useState(null); // html snapshot
  const [drawing, setDrawing] = useState(null); // {initial, index}
  const [equation, setEquation] = useState(null); // {initial, index}
  const [readOnly, setReadOnly] = useState(false);
  const [locked, setLocked] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [listening, setListening] = useState(null); // {interim, lang}
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [customHL, setCustomHL] = useState(() => storage.get('writex.customHighlights', []));
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [formats, setFormats] = useState({});
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [pages, setPages] = useState(1);
  const [curPage, setCurPage] = useState(1);
  const [stats, setStats] = useState({ words: 0, chars: 0, charsNoSpace: 0, paragraphs: 0, arabic: 0, latin: 0 });
  const [saveState, setSaveState] = useState('saved');
  const [tab, setTab] = useState('home');
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(() => window.innerWidth < 900);
  const [viewMode, setViewModeState] = useState(() => (matches(MOBILE_QUERY) ? storage.get('writex.mobileView', 'mobile') : 'print'));
  const setViewMode = (v) => { setViewModeState(v); if (matches(MOBILE_QUERY)) storage.set('writex.mobileView', v); };
  const [darkPaper, setDarkPaper] = useState(() => storage.get('writex.darkPaper', false));
  const [focusMode, setFocusMode] = useState(false);
  const [find, setFind] = useState(null); // {mode}
  const [hits, setHits] = useState({ list: [], cur: -1 });
  const [imgSel, setImgSel] = useState(null); // {el, index}
  const [frame, setFrame] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [inTable, setInTable] = useState(false);
  const [webHeight, setWebHeight] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const quillEl = useRef(null);
  const quillRef = useRef(null);
  const stackRef = useRef(null);
  const workRef = useRef(null);
  const lastRange = useRef(null);
  const settingsRef = useRef(settings);
  const zoomRef = useRef(zoom);
  const viewRef = useRef(viewMode);
  const titleRef = useRef(title);
  const docRef = useRef(null);
  const prevTab = useRef('home');
  settingsRef.current = settings;
  const ez = viewMode === 'mobile' ? 1 : zoom; // effective page zoom
  zoomRef.current = ez;
  const mScaleRef = useRef(mScale);
  mScaleRef.current = mScale;
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  viewRef.current = viewMode;
  titleRef.current = title;

  const geo = useMemo(() => (viewMode === 'mobile' ? mobileGeometry(settings, workW) : pageGeometry(settings)), [settings, viewMode, workW]);
  const geoRef = useRef(geo);
  geoRef.current = geo;

  /* ---------- saving ---------- */
  const dirty = useRef(false);
  const wordsRef = useRef(0);
  const lastVersionAt = useRef(Date.now());
  const editsSinceVersion = useRef(false);
  const persist = useCallback(async (extra) => {
    const q = quillRef.current;
    if (!q || !docRef.current) return;
    if (!dirty.current && !extra) return;
    dirty.current = false;
    try {
      const text = docText(q);
      const c = countText(text);
      let patch = {
        title: titleRef.current || 'Untitled document',
        delta: q.getContents(),
        settings: settingsRef.current,
        preview: previewFromRoot(q.root),
        text: text.replace(/\uFFFC/g, ' ').slice(0, 3000),
        words: c.words,
        ...(extra || {}),
      };
      if (docRef.current.example) patch.example = false;
      const sk = sessionKeys.get(docRef.current.id);
      if (docRef.current.locked && sk) {
        // encrypt the content; keep only the title and settings readable
        const box = await encryptJSON({ delta: patch.delta, preview: patch.preview, text: patch.text }, sk.key);
        patch = { ...patch, delta: null, preview: '', text: '', locked: { ...docRef.current.locked, ...box, salt: sk.salt } };
      }
      const saved = await store.updateDoc(docRef.current.id, patch);
      docRef.current = saved;
      setSaveState('saved');
      store.clearRecovery(saved.id).catch(() => {});
      const gained = c.words - wordsRef.current;
      wordsRef.current = c.words;
      if (gained > 0) store.addWords(gained).catch(() => {});
      if (!saved.locked && Date.now() - lastVersionAt.current > 10 * 60 * 1000) {
        lastVersionAt.current = Date.now();
        editsSinceVersion.current = false;
        store.saveVersion({ ...saved, delta: patch.delta, words: c.words }, 'auto').catch(() => {});
      }
    } catch (e) {
      dirty.current = true;
      setSaveState('error');
      toast('Saving failed: ' + e.message, 'error');
    }
  }, [toast]);
  const saveSoon = useMemo(() => debounce(() => persist(), 650), [persist]);
  const markDirty = useCallback(() => { dirty.current = true; setSaveState('saving'); saveSoon(); }, [saveSoon]);

  const setSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const n = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
      settingsRef.current = n;
      return n;
    });
    dirty.current = true;
    setSaveState('saving');
    saveSoon();
  }, [saveSoon]);

  /* ---------- pagination ---------- */
  const pgFrame = useRef(0);
  const lastCss = useRef('');
  const repaginate = useCallback(() => {
    cancelAnimationFrame(pgFrame.current);
    pgFrame.current = requestAnimationFrame(() => {
      const q = quillRef.current;
      if (!q) return;
      const el = pgStyleEl();
      if (viewRef.current !== 'print') {
        if (lastCss.current) { el.textContent = ''; lastCss.current = ''; }
        setPages(1);
        setWebHeight(q.root.getBoundingClientRect().height / zoomRef.current);
        updateFrame();
        updateHits();
        return;
      }
      try {
        const { css, pages: n } = computePagination(q.root, geoRef.current, zoomRef.current, ROOT_SEL);
        if (css !== lastCss.current) { el.textContent = css; lastCss.current = css; }
        setPages(n);
        tocSoon();
      } catch (e) { /* layout not ready */ }
      updateFrame();
      updateHits();
    });
  }, []);

  /* ---------- stats ---------- */
  const statsSoon = useMemo(() => debounce(() => {
    const q = quillRef.current;
    if (q) setStats(countText(docText(q)));
  }, 500), []);

  /* ---------- crash recovery: a copy of unsaved work, written every couple of seconds ---------- */
  const recoverySoon = useMemo(() => {
    let t = 0; let last = 0;
    return () => {
      const run = () => {
        last = Date.now();
        const q = quillRef.current; const d = docRef.current;
        if (!q || !d || d.locked) return;
        store.putRecovery(d.id, { delta: q.getContents(), title: titleRef.current, settings: settingsRef.current }).catch(() => {});
      };
      clearTimeout(t);
      if (Date.now() - last > 2000) run(); else t = setTimeout(run, 1200);
    };
  }, []);

  /* ---------- keep footnotes, citations and the TOC in step with the text ---------- */
  const refsSoon = useMemo(() => debounce(() => {
    const q = quillRef.current; if (!q) return;
    try {
      if (q.root.querySelector('.ql-fn, .ql-notes')) refsLib.syncNotes(q, 'api');
      if (q.root.querySelector('.ql-cite, .ql-biblio')) refsLib.refreshCitations(q, settingsRef.current.refs || {}, 'api');
    } catch (e) { /* ignore */ }
  }, 900), []);
  const tocSoon = useMemo(() => debounce(() => {
    const q = quillRef.current;
    if (!q || viewRef.current !== 'print' || !q.root.querySelector('.ql-toc')) return;
    try { refsLib.refreshTOCPages(q, geoRef.current, 'print'); } catch (e) { /* ignore */ }
  }, 1500), []);

  const gotoHeading = (text) => {
    const q = quillRef.current; const work = workRef.current; if (!q || !work) return;
    const ln = q.getLines(0, q.getLength()).find((l) => l.statics.blotName === 'header' && (l.domNode.textContent || '').replace(/\uFEFF/g, '').trim() === text.trim());
    if (!ln) return;
    const r = ln.domNode.getBoundingClientRect(); const wr = work.getBoundingClientRect();
    work.scrollTo({ top: work.scrollTop + r.top - wr.top - 24, behavior: 'smooth' });
    lastRange.current = { index: q.getIndex(ln), length: 0 };
  };
  const updateTOC = () => {
    const q = quillRef.current; if (!q) return;
    const at = (lastRange.current || { index: 0 }).index;
    const r = refsLib.insertOrUpdateTOC(q, at, { geo: geoRef.current, viewMode: viewRef.current });
    toast(r === 'updated' ? 'Table of contents updated' : 'Table of contents inserted. Tap it any time to update.');
    if (viewRef.current !== 'print') toast('Switch to Page view to see page numbers in the table of contents.');
  };

  /* ---------- voice typing (browser speech recognition) ---------- */
  const recognizer = useRef(null);
  const stopDictation = () => { if (recognizer.current) { try { recognizer.current.stop(); } catch (e) { /* ignore */ } } recognizer.current = null; setListening(null); };
  const startDictation = (lang) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Voice typing is not supported in this browser. Try your keyboard’s microphone button instead.', 'error'); return; }
    if (recognizer.current) stopDictation();
    const l = lang || (settingsRef.current.dir === 'rtl' ? 'ar-SA' : (navigator.language || 'en-US'));
    let rec;
    try { rec = new SR(); } catch (e) { toast('Voice typing could not start here.', 'error'); return; }
    rec.lang = l; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (ev) => {
      const q = quillRef.current; if (!q) return;
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (!text) continue;
          const at = (q.getSelection() || lastRange.current || { index: q.getLength() - 1 }).index;
          const prev = at > 0 ? q.getText(at - 1, 1) : '\n';
          const chunk = (/\s/.test(prev) ? '' : ' ') + text;
          q.insertText(at, chunk, 'user');
          lastRange.current = { index: at + chunk.length, length: 0 };
          if (q.hasFocus()) q.setSelection(at + chunk.length, 0, 'silent');
        } else interim += r[0].transcript;
      }
      setListening((v) => (v ? { ...v, interim } : v));
    };
    rec.onerror = (ev) => {
      const msg = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? 'Microphone access is not available here. Inside the Claude app the page cannot use your microphone; your keyboard’s voice input still works.'
        : ev.error === 'no-speech' ? 'No speech was heard.' : ev.error === 'network' ? 'Voice typing needs an internet connection.' : 'Voice typing stopped: ' + ev.error;
      toast(msg, 'error');
      recognizer.current = null; setListening(null);
    };
    rec.onend = () => { if (recognizer.current === rec) { recognizer.current = null; setListening(null); } };
    try { rec.start(); recognizer.current = rec; setListening({ interim: '', lang: l }); } catch (e) { toast('Voice typing could not start here.', 'error'); }
  };

  /* ---------- UI sync ---------- */
  const uiFrame = useRef(0);
  const syncUI = useCallback(() => {
    cancelAnimationFrame(uiFrame.current);
    uiFrame.current = requestAnimationFrame(() => {
      const q = quillRef.current;
      if (!q) return;
      const r = q.getSelection() || lastRange.current;
      if (r) {
        const len = q.getLength();
        const safe = { index: Math.min(r.index, len - 1), length: Math.min(r.length, Math.max(0, len - 1 - r.index)) };
        let f = {};
        try { f = q.getFormat(safe); } catch (e) { f = {}; }
        // resolved direction of current line for alignment display
        try {
          const [line] = q.getLine(safe.index);
          if (line && line.domNode) f._dir = getComputedStyle(line.domNode).direction;
        } catch (e) { /* ignore */ }
        setFormats(f);
        setInTable(!!f.table);
        try {
          const b = q.getBounds(safe.index);
          if (b) setCurPage(Math.floor((b.top / zoomRef.current) / geoRef.current.stride) + 1);
        } catch (e) { /* ignore */ }
      }
      const h = q.history.stack;
      setHist({ undo: h.undo.length > 0, redo: h.redo.length > 0 });
    });
  }, []);

  /* ---------- keep the caret above the keyboard / toolbar ---------- */
  const caretFrame = useRef(0);
  const ensureCaret = useCallback(() => {
    if (!isMobileRef.current) return;
    cancelAnimationFrame(caretFrame.current);
    caretFrame.current = requestAnimationFrame(() => {
      const q = quillRef.current; const work = workRef.current;
      if (!q || !work || !q.hasFocus()) return;
      const r = q.getSelection();
      if (!r) return;
      let b;
      try { b = q.getBounds(r.index + r.length, 0); } catch (e) { return; }
      if (!b) return;
      const cr = q.container.getBoundingClientRect();
      const wr = work.getBoundingClientRect();
      const top = cr.top + b.top;
      const bottom = cr.top + b.bottom;
      const vv = window.visualViewport;
      const visBottom = Math.min(wr.bottom, vv ? vv.offsetTop + vv.height : wr.bottom) - 16;
      if (bottom > visBottom) work.scrollTop += bottom - visBottom + 8;
      else if (top < wr.top + 8) work.scrollTop -= wr.top + 8 - top + 8;
    });
  }, []);

  /* ---------- image frame ---------- */
  const imgRef = useRef(null);
  const updateFrame = useCallback(() => {
    const img = imgRef.current && imgRef.current.el;
    const stack = stackRef.current;
    if (!img || !stack || !img.isConnected) { if (imgRef.current) { imgRef.current = null; setImgSel(null); } setFrame(null); return; }
    const z = zoomRef.current;
    const sr = stack.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    setFrame({ left: (r.left - sr.left) / z, top: (r.top - sr.top) / z, width: r.width / z, height: r.height / z });
  }, []);
  const selectImage = useCallback((el) => {
    const q = quillRef.current;
    if (!el) { imgRef.current = null; setImgSel(null); setFrame(null); return; }
    const blot = window.Quill.find(el);
    if (!blot || !q) return;
    const index = q.getIndex(blot);
    imgRef.current = { el, index };
    setImgSel({ el, index, width: el.getAttribute('width') || '' });
    q.setSelection(index, 1, 'user');
    updateFrame();
  }, [updateFrame]);

  /* ---------- find hits ---------- */
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const [hitRects, setHitRects] = useState([]);
  const updateHits = useCallback(() => {
    const q = quillRef.current;
    const list = hitsRef.current.list;
    if (!q || !list.length) { setHitRects([]); return; }
    const z = zoomRef.current;
    const g = geoRef.current;
    const rects = [];
    for (let i = 0; i < Math.min(list.length, 400); i++) {
      try {
        const b = q.getBounds(list[i].index, list[i].length);
        if (b) rects.push({ i, left: b.left / z + g.m.l, top: b.top / z + (viewRef.current === 'print' ? g.m.t : g.m.t), width: Math.max(2, b.width / z), height: b.height / z });
      } catch (e) { /* ignore */ }
    }
    setHitRects(rects);
  }, []);
  useEffect(() => { updateHits(); }, [hits, zoom, updateHits]);

  /* ---------- load doc & create quill ---------- */
  useEffect(() => {
    let disposed = false;
    let ro = null;
    const Quill = setupQuill();
    if (!Quill) { setError('The editor engine did not load. Check your connection and reload the page.'); return undefined; }
    (async () => {
      let d;
      try { d = await store.getDoc(docId); } catch (e) { d = null; }
      if (d && d.locked && !importHtml) { /* decrypted copy comes from the unlock step */ }
      if (disposed) return;
      if (!d) { setError('This document could not be found. It may have been deleted.'); return; }
      if (d.locked) {
        const sk = sessionKeys.get(d.id);
        if (!sk || !sk.plain) { setError('This document is password protected. Go back and open it again to enter the password.'); return; }
        d = { ...d, delta: sk.plain.delta };
        setLocked(true);
      }
      docRef.current = d;
      wordsRef.current = d.words || 0;
      setReadOnly(!!d.readOnly);
      store.updateDoc(d.id, { openedAt: Date.now(), updatedAt: d.updatedAt }).then((nd) => { if (docRef.current && docRef.current.id === nd.id) docRef.current = { ...docRef.current, openedAt: nd.openedAt }; }).catch(() => {});
      if (!d.locked) {
        store.getRecovery(d.id).then((rec) => { if (rec && rec.at > (d.updatedAt || 0) + 1500 && rec.delta) setRecovery(rec); }).catch(() => {});
      }
      const s = { ...DEFAULT_SETTINGS, ...(d.settings || {}), margins: { ...DEFAULT_SETTINGS.margins, ...((d.settings || {}).margins || {}) } };
      settingsRef.current = s;
      geoRef.current = pageGeometry(s);
      setSettingsState(s);
      setTitle(d.title);
      titleRef.current = d.title;
      setDoc(d);
      await new Promise((r) => setTimeout(r, 0));
      if (disposed || !quillEl.current) return;
      const q = new Quill(quillEl.current, {
        modules: {
          toolbar: false,
          table: true,
          history: { delay: 700, maxStack: 500, userOnly: true },
          keyboard: {
            bindings: {
              pagebreak: { key: 'Enter', shortKey: true, handler() { insertPageBreak(); return false; } },
            },
          },
        },
        placeholder: 'Start writing…  ابدأ الكتابة…',
      });
      quillRef.current = q;
      q.root.setAttribute('spellcheck', s.spellcheck ? 'true' : 'false');
      q.root.setAttribute('aria-label', 'Document body');
      try {
        if (importHtml) {
          const delta = importHtml.text != null ? textToDelta(importHtml.text) : q.clipboard.convert({ html: importHtml });
          q.setContents(normalizeDelta(splitNewlines(delta)), 'api');
        } else {
          q.setContents(normalizeDelta(splitNewlines(d.delta)), 'api');
        }
      } catch (e) {
        toast('Part of this document could not be displayed.', 'error');
      }
      q.history.clear();
      if (d.readOnly) q.enable(false);
      if (importHtml) { dirty.current = true; persist(); toast('Imported “' + d.title + '”'); }

      q.on('editor-change', (name, a) => {
        if (name === 'selection-change') {
          if (a) {
            lastRange.current = a;
            // image selected?
            if (a.length === 1) {
              const op = q.getContents(a.index, 1).ops[0];
              if (!(op && op.insert && op.insert.image)) { imgRef.current = null; setImgSel(null); setFrame(null); }
            } else if (imgRef.current) { imgRef.current = null; setImgSel(null); setFrame(null); }
          }
        }
        syncUI();
        ensureCaret();
      });
      q.on('text-change', (delta, old, source) => {
        markDirty();
        ensureCaret();
        editsSinceVersion.current = true;
        recoverySoon();
        if (source === 'user') refsSoon();
        repaginate();
        statsSoon();
        if (hitsRef.current.list.length) setHits((h) => ({ ...h, stale: true }));
        if (source === 'user') {
          // Quill copies line formats on Enter, but pasted lines may lack a direction
          const ops = delta.ops || [];
          const pasted = ops.some((op) => typeof op.insert === 'string' && op.insert.length > 1 && op.insert.includes('\n'));
          if (pasted) {
            setTimeout(() => {
              const lines = q.getLines(0, q.getLength());
              lines.forEach((ln) => {
                const f = ln.formats ? ln.formats() : {};
                if (!f.dir && !f.table && !BLOCK_EMBEDS.includes(ln.statics.blotName)) {
                  try { q.formatLine(q.getIndex(ln), 1, 'dir', 'auto', 'api'); } catch (e) { /* ignore */ }
                }
              });
            }, 0);
          }
        }
      });
      q.root.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.tagName === 'IMG') { selectImage(t); return; }
        const fn = t.closest('.ql-fn');
        if (fn) { setDialog({ kind: 'footnote', id: fn.getAttribute('data-id'), text: fn.getAttribute('data-text') || '' }); return; }
        if (t.closest('.ql-cite')) { setPanel('sources'); return; }
        const row = t.closest('.toc-row');
        if (row) { gotoHeading(row.querySelector('.toc-text').textContent); return; }
        if (t.closest('.ql-toc')) { updateTOC(); }
      });
      q.root.addEventListener('load', () => repaginate(), true);
      ro = new ResizeObserver(() => repaginate());
      ro.observe(q.root);
      if (document.fonts) document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', repaginate);
      setStats(countText(docText(q)));
      repaginate();
      setTimeout(repaginate, 400);
      // on phones, don't pop the keyboard until the writer taps the page
      setTimeout(() => { if (!matches(MOBILE_QUERY)) q.focus(); q.setSelection(0, 0, 'silent'); lastRange.current = { index: 0, length: 0 }; syncUI(); }, 50);
    })();
    return () => {
      disposed = true;
      if (ro) ro.disconnect();
      if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', repaginate);
      saveSoon.cancel();
      if (quillRef.current && docRef.current) {
        const q0 = quillRef.current; const d0 = docRef.current;
        const hadEdits = editsSinceVersion.current;
        persist().then(() => { if (hadEdits && !d0.locked) store.saveVersion({ ...docRef.current || d0, delta: q0.getContents() }, 'close').catch(() => {}); });
      }
      if (recognizer.current) { try { recognizer.current.abort(); } catch (e) { /* ignore */ } }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      const el = pgStyleEl();
      el.textContent = '';
      lastCss.current = '';
      quillRef.current = null;
    };
  }, [docId]);

  // repaginate on geometry / view changes
  useEffect(() => { repaginate(); }, [geo, viewMode, ez, mScale, settings.font, settings.fontSize, settings.lineHeight, repaginate]);

  // track workspace width (mobile view reflows to it) and keep the caret visible when the keyboard resizes it
  useEffect(() => {
    const el = workRef.current;
    if (!el) return undefined;
    let last = el.clientWidth;
    setWorkW(last);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - last) > 1) { last = w; setWorkW(w); }
      ensureCaret();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ensureCaret]);

  /* ---------- pinch to zoom ---------- */
  const layoutRef = useRef({ W: 0, stackH: 0 });
  useEffect(() => {
    const el = workRef.current;
    if (!el) return undefined;
    let active = false; let d0 = 0; let z0 = 1; let cur = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mobileMode = () => viewRef.current === 'mobile';
    const start = (e) => {
      if (e.touches.length !== 2) return;
      active = true; d0 = dist(e.touches) || 1;
      z0 = mobileMode() ? mScaleRef.current : zoomRef.current; cur = z0;
      e.preventDefault();
    };
    const move = (e) => {
      if (!active || e.touches.length !== 2) return;
      e.preventDefault();
      const k = dist(e.touches) / d0;
      const stack = stackRef.current; const box = stack && stack.parentElement;
      if (!stack) return;
      if (mobileMode()) {
        cur = clamp(z0 * k, 0.8, 1.8);
        stack.style.transform = `scale(${cur / z0})`;
      } else {
        cur = clamp(z0 * k, 0.3, 2);
        stack.style.transform = `scale(${cur})`;
        box.style.width = layoutRef.current.W * cur + 'px';
        box.style.height = layoutRef.current.stackH * cur + 'px';
      }
    };
    const end = (e) => {
      if (!active || e.touches.length >= 2) return;
      active = false;
      const stack = stackRef.current; const box = stack && stack.parentElement;
      if (mobileMode()) {
        if (stack) stack.style.transform = 'scale(1)';
        const v = Math.round(cur * 20) / 20;
        setMScale(v); storage.set('writex.mScale', v);
      } else {
        const v = Math.round(cur * 100) / 100;
        if (stack) stack.style.transform = `scale(${v})`;
        if (box) { box.style.width = layoutRef.current.W * v + 'px'; box.style.height = layoutRef.current.stackH * v + 'px'; }
        setFit(false); setZoom(v);
      }
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []);
  useEffect(() => {
    const q = quillRef.current;
    if (q) q.root.setAttribute('spellcheck', settings.spellcheck ? 'true' : 'false');
  }, [settings.spellcheck]);

  // save on tab close
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') { saveSoon.cancel(); persist(); } };
    const hide = () => { saveSoon.cancel(); persist(); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', hide);
    window.addEventListener(BACKGROUND_EVENT, hide);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', hide); window.removeEventListener(BACKGROUND_EVENT, hide); };
  }, [persist, saveSoon]);

  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ---------- zoom fit ---------- */
  useEffect(() => {
    if (!fit || viewMode === 'mobile') return undefined;
    const calc = () => {
      const w = workRef.current ? workRef.current.clientWidth : window.innerWidth;
      const pad = w < 600 ? 16 : 64;
      setZoom(clamp(Math.floor(((w - pad) / geoRef.current.W) * 100) / 100, 0.3, 2));
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (workRef.current) ro.observe(workRef.current);
    return () => ro.disconnect();
  }, [fit, geo.W, viewMode]);

  /* ---------- actions ---------- */
  const Q = () => quillRef.current;
  const ensureRange = () => {
    const q = Q();
    if (!q) return null;
    let r = q.getSelection(true);
    if (!r) r = lastRange.current || { index: q.getLength() - 1, length: 0 };
    return r;
  };
  const after = () => { syncUI(); };

  // Apply a format. When the editor isn't focused (e.g. a bottom sheet is open on a
  // phone) line and range formats are applied directly so the keyboard stays down.
  const fmt = (name, value) => {
    const q = Q(); if (!q) return;
    const r = q.hasFocus() ? null : lastRange.current;
    let block = false;
    try { block = !!q.scroll.query(name, window.Quill.import('parchment').Scope.BLOCK); } catch (e) { block = false; }
    if (r && block) q.formatLine(r.index, r.length, name, value, 'user');
    else if (r && r.length) q.formatText(r.index, r.length, name, value, 'user');
    else { ensureRange(); q.format(name, value, 'user'); }
    after();
  };
  const toggle = (name) => fmt(name, !formats[name]);

  const insertPageBreak = () => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    const [line, offset] = q.getLine(r.index);
    let at = r.index;
    if (line && offset > 0) { q.insertText(r.index, '\n', 'user'); at = r.index + 1; }
    q.insertEmbed(at, 'pagebreak', true, 'user');
    q.setSelection(at + 1, 0, 'user');
    after();
  };
  const insertDivider = () => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    const [, offset] = q.getLine(r.index);
    let at = r.index;
    if (offset > 0) { q.insertText(r.index, '\n', 'user'); at = r.index + 1; }
    q.insertEmbed(at, 'divider', true, 'user');
    q.setSelection(at + 1, 0, 'user');
  };
  const insertImageFile = async (file, replaceIndex) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choose an image file (PNG, JPG, GIF, WebP or SVG).', 'error'); return; }
    try {
      const raw = await readFileAs(file, 'dataurl');
      const url = file.type === 'image/svg+xml' ? raw : await downscaleImage(raw);
      const q = Q(); if (!q) return;
      if (replaceIndex != null) {
        const width = (q.getContents(replaceIndex, 1).ops[0].attributes || {}).width;
        q.deleteText(replaceIndex, 1, 'user');
        q.insertEmbed(replaceIndex, 'image', url, 'user');
        if (width) q.formatText(replaceIndex, 1, 'width', width, 'user');
        q.setSelection(replaceIndex + 1, 0, 'user');
      } else {
        const r = ensureRange();
        q.insertEmbed(r.index, 'image', url, 'user');
        q.setSelection(r.index + 1, 0, 'user');
      }
      setTimeout(repaginate, 60);
    } catch (e) { toast(e.message, 'error'); }
  };
  const insertTable = (rows, cols) => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    const t = q.getModule('table');
    if (!t) { toast('Tables are not available in this editor build.', 'error'); return; }
    // tables start on their own line
    const [, offset] = q.getLine(r.index);
    if (offset > 0) { q.insertText(r.index, '\n', 'user'); q.setSelection(r.index + 1, 0, 'silent'); }
    try { t.insertTable(rows, cols); } catch (e) { toast('The table could not be inserted here.', 'error'); }
    after();
  };
  const tableOp = (op) => {
    const q = Q(); if (!q) return;
    ensureRange();
    const t = q.getModule('table');
    try { t[op](); } catch (e) { toast('That table action is not available here.', 'error'); }
    after();
  };
  const insertLink = (url, text) => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    let u = url.trim();
    if (!/^(https?:|mailto:|tel:)/i.test(u)) u = 'https://' + u;
    if (r.length > 0) q.formatText(r.index, r.length, 'link', u, 'user');
    else {
      const label = text || u;
      q.insertText(r.index, label, { link: u }, 'user');
      q.setSelection(r.index + label.length, 0, 'user');
    }
  };
  const removeLink = () => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    if (r.length) q.formatText(r.index, r.length, 'link', false, 'user');
    else {
      // expand to the linked run around the caret
      const [leaf, off] = q.getLeaf(r.index);
      if (leaf) { const start = r.index - off; q.formatText(start, leaf.length(), 'link', false, 'user'); }
    }
    after();
  };
  const clearFormatting = () => {
    const q = Q(); if (!q) return;
    const r = ensureRange();
    if (r.length) {
      q.removeFormat(r.index, r.length, 'user');
      q.formatLine(r.index, r.length, 'dir', 'auto', 'user');
    } else {
      const fmts = q.getFormat(r);
      ['bold', 'italic', 'underline', 'strike', 'color', 'background', 'font', 'size', 'script', 'link'].forEach((k) => { if (fmts[k]) q.format(k, false, 'user'); });
    }
    after();
  };
  const setFontSize = (pt) => fmt('size', pt ? `${pt}pt` : false);
  const currentSize = () => {
    const s = formats.size;
    if (s && !Array.isArray(s)) { const n = parseFloat(s); return /px$/.test(s) ? Math.round(n * 0.75 * 2) / 2 : n; }
    if (formats.header) return { 1: 2, 2: 1.5, 3: 1.2, 4: 1.05, 5: 1, 6: 0.9 }[formats.header] * settings.fontSize;
    return settings.fontSize;
  };
  const grow = (dir) => {
    const ladder = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
    const c = currentSize();
    let n;
    if (dir > 0) n = ladder.find((x) => x > c + 0.01) || 72;
    else n = [...ladder].reverse().find((x) => x < c - 0.01) || 8;
    setFontSize(n);
  };
  const applyStyle = (key) => {
    const q = Q(); if (!q) return;
    const r = (!q.hasFocus() && lastRange.current) || ensureRange();
    const set = { header: false, blockquote: false };
    if (key.startsWith('h')) set.header = parseInt(key.slice(1), 10);
    if (key === 'quote') set.blockquote = true;
    q.formatLine(r.index, r.length || 0, set, 'user');
    after();
  };
  const imageWidth = (w) => {
    const q = Q(); if (!q || !imgRef.current) return;
    q.formatText(imgRef.current.index, 1, 'width', w || false, 'user');
    setImgSel((s) => (s ? { ...s, width: w || '' } : s));
    setTimeout(() => { updateFrame(); repaginate(); }, 30);
  };
  const deleteImage = () => {
    const q = Q(); if (!q || !imgRef.current) return;
    const i = imgRef.current.index;
    q.deleteText(i, 1, 'user');
    imgRef.current = null; setImgSel(null); setFrame(null);
    q.setSelection(i, 0, 'user');
  };
  /* ---------- new insert tools ---------- */
  const insertImageData = ({ url, width, alt }, replaceIndex) => {
    const q = Q(); if (!q) return;
    let at;
    if (replaceIndex != null) { q.deleteText(replaceIndex, 1, 'user'); at = replaceIndex; } else at = (q.hasFocus() ? q.getSelection() : lastRange.current || { index: q.getLength() - 1 }).index;
    q.insertEmbed(at, 'image', url, 'user');
    q.formatText(at, 1, { width: width ? Math.round(width) + 'px' : false, alt: alt || '' }, 'user');
    q.setSelection(at + 1, 0, 'silent');
    lastRange.current = { index: at + 1, length: 0 };
    imgRef.current = null; setImgSel(null); setFrame(null);
    setTimeout(repaginate, 60);
  };
  const editImageSpecial = () => {
    const sel = imgRef.current; if (!sel) return;
    const alt = sel.el.getAttribute('alt') || '';
    if (alt.startsWith('latex:')) setEquation({ initial: alt.slice(6), index: sel.index });
    else if (alt.startsWith('drawing:')) { try { setDrawing({ initial: JSON.parse(alt.slice(8)), index: sel.index }); } catch (e) { toast('This drawing can no longer be edited.', 'error'); } }
  };
  const insertCover = (style, v) => {
    const q = Q(); if (!q) return;
    const Delta = window.Quill.import('delta');
    q.updateContents(new Delta(coverOps(style, { ...v, rtl: settingsRef.current.dir === 'rtl' })), 'user');
    if (workRef.current) workRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Cover page added at the start');
  };
  const insertFootnoteText = (text) => {
    const q = Q(); if (!q) return;
    const at = (q.hasFocus() ? q.getSelection() : lastRange.current || { index: q.getLength() - 1 }).index;
    refsLib.insertFootnote(q, at, text);
    lastRange.current = { index: at + 1, length: 0 };
  };
  const setRefs = (refs) => {
    setSettings({ refs });
    settingsRef.current = { ...settingsRef.current, refs };
    const q = Q(); if (q) refsLib.refreshCitations(q, refs, 'user');
  };
  const citeSource = (src) => {
    const q = Q(); if (!q) return;
    const at = (q.hasFocus() ? q.getSelection() : lastRange.current || { index: q.getLength() - 1 }).index;
    refsLib.insertCitation(q, at, src, settingsRef.current.refs || {});
    lastRange.current = { index: at + 1, length: 0 };
  };
  const insertBibliography = () => {
    const q = Q(); if (!q) return;
    const refs = settingsRef.current.refs || {};
    if (!(refs.items || []).length) { toast('Add a source and cite it first.', 'error'); return; }
    const at = (lastRange.current || { index: q.getLength() - 1 }).index;
    const r = refsLib.insertBibliography(q, at, refs);
    toast(r === 'updated' ? 'Bibliography updated' : 'Bibliography inserted');
  };

  /* ---------- protection ---------- */
  const toggleReadOnly = async () => {
    const q = Q(); if (!q || !docRef.current) return;
    const v = !readOnly;
    setReadOnly(v); q.enable(!v);
    try { docRef.current = await store.updateDoc(docRef.current.id, { readOnly: v, updatedAt: docRef.current.updatedAt }); } catch (e) { /* ignore */ }
    toast(v ? 'Editing locked. Tap Unlock to make changes.' : 'Editing unlocked');
  };
  const setPassword = async (pw, hint) => {
    if (!cryptoAvailable()) { toast('Encryption is not available in this browser.', 'error'); return; }
    const d = docRef.current; if (!d) return;
    const { key, salt } = await deriveKey(pw);
    sessionKeys.set(d.id, { key, salt, plain: null });
    docRef.current = { ...d, locked: { hint: hint || '', salt } };
    setLocked(true);
    dirty.current = true;
    await persist();
    try { await store.deleteVersionsFor(d.id); await store.clearRecovery(d.id); } catch (e) { /* ignore */ }
    setDialog(null);
    toast('Password protection is on. You will be asked for it next time.');
  };
  const removePassword = async () => {
    const d = docRef.current; if (!d) return;
    docRef.current = { ...d, locked: null };
    sessionKeys.delete(d.id);
    setLocked(false);
    dirty.current = true;
    await persist({ locked: null });
    toast('Password removed');
  };

  /* ---------- versions ---------- */
  const saveVersionNow = async () => {
    const q = Q(); if (!q || !docRef.current) return;
    dirty.current = true; await persist();
    await store.saveVersion({ ...docRef.current, delta: q.getContents(), words: wordsRef.current }, 'manual');
    lastVersionAt.current = Date.now(); editsSinceVersion.current = false;
    toast('Version saved');
  };
  const restoreVersion = async (v) => {
    const q = Q(); if (!q) return;
    await store.saveVersion({ ...docRef.current, delta: q.getContents(), words: wordsRef.current }, 'restore');
    q.setContents(normalizeDelta(splitNewlines(v.delta)), 'user');
    toast('Version restored. The text from before is saved in version history.');
  };
  const copyVersion = async (v) => {
    const d = await store.createDoc({ title: `${titleRef.current} (${new Date(v.at).toLocaleDateString()})`, delta: v.delta, settings: settingsRef.current, folderId: docRef.current.folderId });
    openDoc(d.id);
  };
  const saveAsTemplate = async (name) => {
    const q = Q(); if (!q) return;
    await store.saveCustomTemplate({ name, delta: q.getContents(), settings: settingsRef.current, lang: settingsRef.current.dir === 'rtl' ? 'AR' : 'EN' });
    toast('Saved “' + name + '” to your templates');
  };
  const openReader = () => {
    const q = Q(); if (!q) return;
    setReading(q.root.innerHTML.replace(/ contenteditable="(true|false)"/g, '').replace(/ data-placeholder="[^"]*"/g, ''));
  };
  const addCustomHighlight = (c) => {
    const next = [...customHL.filter((x) => x.toLowerCase() !== c.toLowerCase()), c].slice(-8);
    setCustomHL(next); storage.set('writex.customHighlights', next);
  };

  const undo = () => { const q = Q(); if (q) { q.history.undo(); after(); } };
  const redo = () => { const q = Q(); if (q) { q.history.redo(); after(); } };

  /* ---------- exports ---------- */
  // Test hook used by scripts/device-test.mjs on the Android emulator
  const runExportRef = useRef(null);
  useEffect(() => {
    const hooks = (window.__writex = window.__writex || {});
    hooks.exportCurrent = (kind) => runExportRef.current && runExportRef.current(kind);
    return () => { delete hooks.exportCurrent; };
  }, []);
  const runExport = async (kind) => {
    const q = Q(); if (!q) return;
    await persist();
    const name = titleRef.current || 'Untitled document';
    try {
      if (kind === 'pdf') {
        setBusy({ text: 'Preparing PDF…' });
        const prevZoom = zoomRef.current; const prevFit = fit; const prevView = viewRef.current;
        setFit(false); setZoom(1); zoomRef.current = 1;
        if (prevView !== 'print') { setViewMode('print'); viewRef.current = 'print'; }
        imgRef.current = null; setImgSel(null); setFrame(null);
        await new Promise((r) => setTimeout(r, 120));
        const res = computePagination(q.root, geoRef.current, 1, ROOT_SEL);
        pgStyleEl().textContent = res.css; lastCss.current = res.css;
        await new Promise((r) => setTimeout(r, 60));
        let blob;
        try {
          blob = await exportPDF({ stackEl: stackRef.current, settings: settingsRef.current, pages: res.pages, onProgress: (k, n) => setBusy({ text: `Rendering page ${k} of ${n}…` }) });
        } finally {
          if (prevView !== 'print') setViewMode(prevView);
          if (prevFit) setFit(true); else setZoom(prevZoom);
          setBusy(null);
        }
        const r = await saveFile(safeFilename(name, 'pdf'), blob);
        if (r === 'saved') toast(savedLabel('PDF ready: ' + safeFilename(name, 'pdf')));
      } else if (kind === 'docx') {
        setBusy({ text: 'Building Word document…' });
        let blob;
        try { blob = await exportDOCX({ delta: q.getContents(), settings: settingsRef.current, title: name }); } finally { setBusy(null); }
        const r = await saveFile(safeFilename(name, 'docx'), blob);
        if (r === 'saved') toast(savedLabel('Word file ready: ' + safeFilename(name, 'docx')));
      } else if (kind === 'html') {
        const blob = exportHTML({ html: q.root.innerHTML, settings: settingsRef.current, title: name });
        const r = await saveFile(safeFilename(name, 'html'), blob);
        if (r === 'saved') toast(savedLabel('Web page ready: ' + safeFilename(name, 'html')));
      } else if (kind === 'txt') {
        const blob = new Blob([q.getText()], { type: 'text/plain' });
        const r = await saveFile(safeFilename(name, 'txt'), blob);
        if (r === 'saved') toast(savedLabel('Text file ready: ' + safeFilename(name, 'txt')));
      }
    } catch (e) {
      setBusy(null);
      toast('Export failed: ' + e.message, 'error');
    }
  };

  runExportRef.current = runExport;

  const importInto = async (file) => {
    if (!file) return;
    if (/\.txt$/i.test(file.name) || file.type === 'text/plain') {
      try {
        const text = await readFileAs(file, 'text');
        const d = await store.createDoc({ title: file.name.replace(/\.txt$/i, ''), folderId: docRef.current ? docRef.current.folderId : null });
        openDoc(d.id, { importHtml: { text } });
      } catch (e) { toast('Import failed: ' + e.message, 'error'); }
      return;
    }
    if (!/\.docx$/i.test(file.name)) { toast('Choose a Word (.docx) or text (.txt) file.', 'error'); return; }
    setBusy({ text: 'Importing ' + file.name + '…' });
    try {
      const buf = await readFileAs(file, 'buffer');
      const { html } = await importDOCX(buf);
      const d = await store.createDoc({ title: file.name.replace(/\.docx$/i, ''), folderId: docRef.current ? docRef.current.folderId : null });
      setBusy(null);
      openDoc(d.id, { importHtml: html });
    } catch (e) { setBusy(null); toast('Import failed: ' + e.message, 'error'); }
  };

  const newDoc = async (tid) => {
    await persist();
    const d = await store.fromTemplate(tid || 'blank', docRef.current ? docRef.current.folderId : null);
    openDoc(d.id);
  };
  const duplicate = async () => {
    await persist();
    const d = await store.duplicateDoc(docRef.current.id);
    toast('Opened a copy: ' + d.title);
    openDoc(d.id);
  };

  /* ---------- find ---------- */
  const runFind = useCallback((query, opts, focusIndex) => {
    const q = Q(); if (!q) return [];
    const list = findAll(docText(q), query, opts);
    let cur = -1;
    if (list.length) {
      const from = focusIndex != null ? focusIndex : (q.getSelection() || lastRange.current || { index: 0 }).index;
      cur = list.findIndex((m) => m.index >= from);
      if (cur < 0) cur = 0;
    }
    setHits({ list, cur });
    list.cur = cur;
    return list;
  }, []);
  const gotoHit = (i, listArg) => {
    const q = Q(); const list = listArg || hitsRef.current.list;
    if (!q || !list.length) return;
    const k = ((i % list.length) + list.length) % list.length;
    hitsRef.current = { list, cur: k };
    setHits({ list, cur: k });
    const m = list[k];
    // keep focus in the find box; the match is shown by the highlight overlay
    lastRange.current = { index: m.index, length: m.length };
    // scroll into view
    try {
      const b = q.getBounds(m.index, m.length);
      const work = workRef.current;
      const cr = q.container.getBoundingClientRect();
      const wr = work.getBoundingClientRect();
      const y = cr.top + b.top - wr.top + work.scrollTop;
      if (y < work.scrollTop + 60 || y > work.scrollTop + work.clientHeight - 80) work.scrollTo({ top: y - work.clientHeight / 3, behavior: 'smooth' });
    } catch (e) { /* ignore */ }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const key = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && !e.shiftKey) { e.preventDefault(); setFind({ mode: 'find', t: Date.now() }); }
      else if (k === 'h') { e.preventDefault(); setFind({ mode: 'replace', t: Date.now() }); }
      else if (k === 's') { e.preventDefault(); saveSoon.cancel(); persist(); toast('All changes are saved in this browser'); }
      else if (k === 'p') { e.preventDefault(); runExport('pdf'); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // picture tab follows image selection
  useEffect(() => {
    if (imgSel && tab !== 'picture') { prevTab.current = tab; setTab('picture'); }
    if (!imgSel && tab === 'picture') setTab(prevTab.current === 'picture' ? 'home' : prevTab.current);
  }, [!!imgSel]);
  useEffect(() => { if (!inTable && tab === 'table') setTab('insert'); }, [inTable]);

  /* ---------- image resize drag ---------- */
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const img = imgRef.current && imgRef.current.el;
    if (!img) return;
    const z = zoomRef.current;
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width / z;
    const rtl = getComputedStyle(img.parentElement).direction === 'rtl';
    const maxW = geoRef.current.contentW;
    let w = startW;
    const move = (ev) => {
      const dx = (ev.clientX - startX) / z;
      w = clamp(startW + (rtl ? -dx : dx), 24, maxW);
      img.style.width = w + 'px';
      updateFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      img.style.width = '';
      imageWidth(Math.round(w) + 'px');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---------- render helpers ---------- */
  const { W, H, m, stride, contentW } = geo;
  const nPages = viewMode === 'print' ? pages : 1;
  const sheetH = viewMode === 'print' ? H : Math.max(viewMode === 'mobile' ? 360 : H, webHeight + m.t + m.b);
  const stackH = viewMode === 'print' ? nPages * H + (nPages - 1) * (stride - H) : sheetH;
  layoutRef.current = { W, stackH };
  const dateStr = new Date().toLocaleDateString();
  const fill = (tpl, k) => String(tpl || '').replace(/\{page\}/g, k).replace(/\{pages\}/g, nPages).replace(/\{title\}/g, title).replace(/\{date\}/g, dateStr);
  const pn = settings.pageNumbers;
  const hfTop = Math.max(10, Math.min(48, m.t / 2 - 10));
  const hfBottom = Math.max(10, Math.min(48, m.b / 2 - 10));

  const hfZone = (where, k) => {
    const cfg = settings[where] || {};
    const hide = settings.firstPageDifferent && k === 1;
    const text = hide ? '' : fill(cfg.text, k);
    const num = !hide && pn.on && pn.where === where ? (PN_FORMATS[pn.format] || PN_FORMATS.n)(k, nPages) : '';
    const style = { left: m.l, right: m.r, fontFamily: settings.font };
    if (where === 'header') style.top = hfTop; else style.bottom = hfBottom;
    return (
      <div className={'hf ' + where + (text || num ? '' : ' empty')} style={style} dir={settings.dir}
        onDoubleClick={() => setDialog({ kind: 'hf', focus: where })} title={`Double-click to edit the ${where}`}>
        {text && <div className="hf-line" dir="auto" style={{ textAlign: cfg.align || 'center' }}>{text}</div>}
        {num && <div className="hf-line" dir="auto" style={{ textAlign: pn.align }}>{num}</div>}
        {!text && !num && <div className="hf-hint">{where === 'header' ? 'Double-click to add a header' : 'Double-click to add a footer'}</div>}
      </div>
    );
  };

  const sheets = [];
  for (let k = 1; k <= nPages; k++) {
    sheets.push(
      <div key={k} className="sheet" style={{ top: (k - 1) * stride, width: W, height: sheetH }}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const q = Q(); if (!q) return;
          e.preventDefault();
          const sr = stackRef.current.getBoundingClientRect();
          const y = (e.clientY - sr.top) / zoomRef.current;
          const rr = q.root.getBoundingClientRect();
          const bottom = (rr.bottom - sr.top) / zoomRef.current;
          q.focus();
          if (y > bottom) q.setSelection(q.getLength() - 1, 0, 'user');
        }}>
        {viewMode === 'print' && hfZone('header', k)}
        {viewMode === 'print' && hfZone('footer', k)}
        {viewMode === 'print' && nPages > 1 && <span className="page-tag" aria-hidden="true">{k}</span>}
      </div>,
    );
  }

  const ed = {
    quill: Q, formats, settings, setSettings, geo, fmt, toggle, setFontSize, grow, currentSize, clearFormatting, applyStyle,
    insertPageBreak, insertDivider, insertImageFile, insertTable, tableOp, insertLink, removeLink,
    undo, redo, hist, inTable, imgSel, imageWidth, deleteImage,
    zoom: ez, setZoom: (z) => { if (viewMode === 'mobile') setViewMode('print'); setFit(false); setZoom(clamp(z, 0.3, 2)); },
    fit, setFit: (v) => { if (v && viewMode === 'mobile') setViewMode('print'); setFit(v); }, viewMode, setViewMode,
    darkPaper, setDarkPaper: (v) => { setDarkPaper(v); storage.set('writex.darkPaper', v); }, focusMode, setFocusMode,
    theme, toggleTheme, themeMode, setThemeMode,
    insertText: (text) => {
      const q = Q(); if (!q) return;
      const r = ensureRange();
      if (r.length) q.deleteText(r.index, r.length, 'user');
      q.insertText(r.index, text, 'user');
      q.setSelection(r.index + text.length, 0, 'user');
    },
    readOnly, toggleReadOnly, locked, online, customHL, addCustomHighlight,
    openPanel: setPanel, openReader, updateTOC, insertBibliography, setRefs,
    askDocument: async () => { saveSoon.cancel(); await persist(); if (onAsk && docRef.current) onAsk({ kind: 'doc', id: docRef.current.id }); },
    openFootnote: () => setDialog({ kind: 'footnote' }),
    openEquation: () => setEquation({ initial: null }),
    openDrawing: () => setDrawing({ initial: null }),
    openCover: () => setDialog({ kind: 'cover' }),
    editImageSpecial,
    imgKind: imgSel ? ((imgSel.el.getAttribute('alt') || '').startsWith('latex:') ? 'equation' : (imgSel.el.getAttribute('alt') || '').startsWith('drawing:') ? 'drawing' : 'image') : null,
    listening, startDictation, stopDictation,
    openPassword: () => setDialog({ kind: locked ? 'pw-remove' : 'pw-set' }),
    saveTemplate: () => setDialog({ kind: 'save-template' }),
    share: () => setDialog({ kind: 'share' }),
    insertDate: () => ed.insertText(new Date().toLocaleDateString(settings.dir === 'rtl' ? 'ar' : undefined, { day: 'numeric', month: 'long', year: 'numeric' })),
    autoDirection: () => { const q = Q(); if (q) q.formatLine(0, q.getLength(), 'dir', 'auto', 'user'); },
    openFind: (mode) => setFind({ mode, t: Date.now() }),
    openDialog: (kind, extra) => setDialog({ kind, ...(extra || {}) }),
    runExport, importInto, newDoc, duplicate, onExit,
    rename: () => setEditingTitle(true),
    del: () => setDialog({ kind: 'delete' }),
    stats, pages: nPages,
  };

  if (error) {
    return (
      <div className="ed-error">
        <Icon name="FileX2" size={32} />
        <p>{error}</p>
        <button type="button" className="btn primary" onClick={onExit}>Back to documents</button>
      </div>
    );
  }

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved';

  return (
    <div className={'ed' + (isMobile ? ' m' : '') + (focusMode ? ' focus' : '') + (darkPaper ? ' dark-paper' : '') + (isMobile && toolbarHidden ? ' bar-hidden' : '')}>
      {!focusMode && (isMobile ? (
        <header className="ed-bar m">
          <button type="button" data-back className="tb lg" aria-label="Back to documents" onMouseDown={(e) => e.preventDefault()} onClick={async () => { saveSoon.cancel(); await persist(); onExit(); }}>
            <Icon name="ChevronLeft" size={24} />
          </button>
          <div className="m-title">
            {editingTitle ? (
              <input id="doc-title-m" className="title-input" dir="auto" autoFocus defaultValue={title} maxLength={160}
                onBlur={(e) => { const v = e.target.value.trim() || 'Untitled document'; setTitle(v); titleRef.current = v; setEditingTitle(false); markDirty(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = title; e.target.blur(); } }} />
            ) : (
              <button type="button" className="m-title-btn" dir="auto" onClick={() => setEditingTitle(true)} aria-label={'Rename ' + (title || 'document')}>{title || 'Untitled document'}</button>
            )}
            <span className={'m-sub ' + saveState}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved'}
              {' · '}{viewMode === 'print' ? `Page ${Math.min(curPage, nPages)} of ${nPages}` : `${stats.words.toLocaleString()} words`}
            </span>
          </div>
          <button type="button" className="tb lg" aria-label={viewMode === 'mobile' ? 'Switch to page view' : 'Switch to mobile view'} title={viewMode === 'mobile' ? 'Page view' : 'Mobile view'}
            onMouseDown={(e) => e.preventDefault()} onClick={() => { setViewMode(viewMode === 'mobile' ? 'print' : 'mobile'); if (viewMode === 'mobile') setFit(true); }}>
            <Icon name={viewMode === 'mobile' ? 'Files' : 'Smartphone'} size={21} />
          </button>
          <button type="button" className="tb lg" aria-label="Find and replace" onMouseDown={(e) => e.preventDefault()} onClick={() => setFind({ mode: 'find', t: Date.now() })}><Icon name="Search" size={21} /></button>
          <button type="button" className="tb lg" aria-label="Document menu" onMouseDown={(e) => e.preventDefault()} onClick={() => setSheet('more')}><Icon name="Ellipsis" size={22} /></button>
        </header>
      ) : (
        <>
      <header className="ed-bar">
        <button type="button" data-back className="tb" aria-label="Back to documents" title="Back to documents" onClick={async () => { saveSoon.cancel(); await persist(); onExit(); }}>
          <Icon name="ArrowLeft" />
        </button>
        <img className="brand-mark sm" src={LOGO} alt="" aria-hidden="true" />
        <div className="title-wrap">
          {editingTitle ? (
            <input id="doc-title" className="title-input" dir="auto" autoFocus defaultValue={title} maxLength={160}
              onBlur={(e) => { const v = e.target.value.trim() || 'Untitled document'; setTitle(v); titleRef.current = v; setEditingTitle(false); markDirty(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = title; e.target.blur(); } }} />
          ) : (
            <button type="button" className="title-btn" dir="auto" title="Rename document" onClick={() => setEditingTitle(true)}>{title || 'Untitled document'}</button>
          )}
          <span className={'save-state ' + saveState} aria-live="polite">
            {saveState === 'saving' ? <span className="dot" /> : <Icon name={saveState === 'error' ? 'CloudOff' : 'CloudCheck'} size={14} />}
            {saveLabel}
          </span>
        </div>
        <div className="ed-bar-actions">
          <button type="button" className="tb" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!hist.undo} onMouseDown={(e) => e.preventDefault()} onClick={undo}><Icon name="Undo2" /></button>
          <button type="button" className="tb" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!hist.redo} onMouseDown={(e) => e.preventDefault()} onClick={redo}><Icon name="Redo2" /></button>
          <button type="button" className="tb hide-sm" aria-label="Find and replace" title="Find and replace (Ctrl+F)" onClick={() => setFind({ mode: 'find', t: Date.now() })}><Icon name="Search" /></button>
          <button type="button" className="tb hide-sm" aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'Sun' : 'Moon'} /></button>
          {focusMode && <button type="button" className="btn sm" onClick={() => setFocusMode(false)}><Icon name="Minimize2" size={16} />Exit focus</button>}
          <ExportButton run={runExport} />
        </div>
      </header>

          <Ribbon tab={tab} setTab={setTab} ed={ed} />
        </>
      ))}

      <div className="ed-work" ref={workRef}>
        {!doc ? <div className="empty"><span className="spin" /> Opening document…</div> : null}
        {recovery && (
          <div className="banner warn" role="alert">
            <Icon name="LifeBuoy" size={18} />
            <span>Unsaved changes from {new Date(recovery.at).toLocaleString()} were found after the app closed unexpectedly.</span>
            <button type="button" className="btn sm primary" onClick={() => { const q = Q(); if (q && recovery.delta) { q.setContents(normalizeDelta(splitNewlines(recovery.delta)), 'user'); } setRecovery(null); toast('Recovered your unsaved changes'); }}>Recover</button>
            <button type="button" className="btn sm" onClick={() => { if (docRef.current) store.clearRecovery(docRef.current.id).catch(() => {}); setRecovery(null); }}>Discard</button>
          </div>
        )}
        {readOnly && (
          <div className="banner" role="status">
            <Icon name="Lock" size={18} /><span>Editing is locked for this document.</span>
            <button type="button" className="btn sm" onClick={toggleReadOnly}>Unlock editing</button>
          </div>
        )}
        <div className="zoom-box" style={{ width: W * ez, height: stackH * ez }}>
          <div className={'stack' + (viewMode !== 'print' ? ' ' + viewMode : '')} ref={stackRef} style={{ width: W, height: stackH, transform: `scale(${ez})` }}>
            {sheets}
            <div className={'qwrap tbl-' + (settings.tableStyle || 'grid') + (settings.tableHeader === false ? ' no-thead' : '')} dir={settings.dir} lang={settings.lang === 'auto' ? undefined : settings.lang}
              style={{ left: m.l, top: m.t, width: viewMode === 'mobile' ? contentW / mScale : contentW, zoom: viewMode === 'mobile' && mScale !== 1 ? mScale : undefined, fontFamily: settings.font, fontSize: settings.fontSize + 'pt', lineHeight: settings.lineHeight, '--content-h': (viewMode === 'mobile' ? Math.round(geo.C / mScale) : geo.C) + 'px' }}>
              <div ref={quillEl} />
            </div>
            {hitRects.map((r) => (
              <div key={r.i} className={'find-hit' + (r.i === hits.cur ? ' cur' : '')} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
            ))}
            {frame && (
              <div className="img-frame" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
                <span className="img-size">{Math.round(frame.width)} × {Math.round(frame.height)}</span>
                <button type="button" className="img-handle" aria-label="Resize image" onPointerDown={startResize} />
              </div>
            )}
          </div>
        </div>
      </div>

      {find && (
        <FindPanel key={find.t} mode={find.mode} hits={hits} runFind={runFind} gotoHit={gotoHit} quill={Q} lastRange={lastRange}
          onClose={() => {
            const q = Q(); const h = hitsRef.current; const m = h.list[h.cur];
            setFind(null); setHits({ list: [], cur: -1 });
            if (q) { q.focus(); if (m) q.setSelection(m.index, m.length, 'user'); }
          }} toast={toast} />
      )}

      {focusMode && (
        <div className="focus-pill" role="status">
          <span className="tnum">{stats.words.toLocaleString()} words</span>
          <button type="button" className="btn sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setFocusMode(false)}><Icon name="Minimize2" size={15} />Exit focus</button>
        </div>
      )}
      {listening && (
        <div className="dictate-pill" role="status" aria-live="polite">
          <span className="rec-dot" />
          <span className="dict-text" dir="auto">{listening.interim || (listening.lang.startsWith('ar') ? 'أستمع… تحدّث الآن' : 'Listening… speak now')}</span>
          <button type="button" className="btn sm" onMouseDown={(e) => e.preventDefault()} onClick={() => startDictation(listening.lang.startsWith('ar') ? 'en-US' : 'ar-SA')}>{listening.lang.startsWith('ar') ? 'EN' : 'عربي'}</button>
          <button type="button" className="btn sm primary" onMouseDown={(e) => e.preventDefault()} onClick={stopDictation}>Done</button>
        </div>
      )}
      {isMobile && (
        <>
          {!focusMode && <MobileToolbar ed={ed} open={setSheet} hidden={toolbarHidden} setHidden={setToolbarHidden} />}
          <MobileSheets ed={ed} sheet={sheet} setSheet={setSheet} toolbarHidden={toolbarHidden} setToolbarHidden={setToolbarHidden} />
        </>
      )}

      {!isMobile && !focusMode && <footer className="status">
        <span>Page {Math.min(curPage, nPages)} of {nPages}</span>
        <button type="button" className="st-btn" onClick={() => setDialog({ kind: 'count' })} title="Word count">{stats.words.toLocaleString()} words</button>
        <span className="hide-sm">{stats.chars.toLocaleString()} characters</span>
        <span className="hide-sm st-lang">{stats.arabic && stats.latin ? 'Arabic + English' : stats.arabic ? 'Arabic' : stats.latin ? 'English' : '—'}</span>
        <span className="st-grow" />
        <span className="hide-sm">{fontByStack(settings.font).name} · {settings.fontSize} pt</span>
        <div className="zoom-ctl">
          <button type="button" className="tb sm" aria-label="Zoom out" onClick={() => ed.setZoom(Math.round((ez - 0.1) * 10) / 10)}><Icon name="Minus" size={14} /></button>
          <input id="zoom-range" type="range" min="30" max="200" step="5" value={Math.round(ez * 100)} aria-label="Zoom" onChange={(e) => ed.setZoom(+e.target.value / 100)} />
          <button type="button" className="tb sm" aria-label="Zoom in" onClick={() => ed.setZoom(Math.round((ez + 0.1) * 10) / 10)}><Icon name="Plus" size={14} /></button>
          <button type="button" className="st-btn zoom-pct" title="Fit page width" onClick={() => ed.setFit(true)}>{Math.round(ez * 100)}%</button>
        </div>
      </footer>}

      {busy && (
        <div className="busy" role="status"><span className="spin" /><span>{busy.text}</span></div>
      )}

      {dialog && dialog.kind === 'hf' && <HeaderFooterDialog settings={settings} focus={dialog.focus} onSave={(p) => setSettings(p)} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'count' && <WordCountDialog stats={stats} pages={nPages} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'link' && <LinkDialog initial={formats.link || ''} hasSelection={!!(lastRange.current && lastRange.current.length)} onSave={insertLink} onRemove={formats.link ? removeLink : null} onClose={() => { setDialog(null); const q = Q(); if (q) q.focus(); }} />}
      {dialog && dialog.kind === 'margins' && <MarginsDialog settings={settings} onSave={(p) => setSettings(p)} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'delete' && (
        <ConfirmDialog title="Delete document?" message={`“${title}” will be permanently removed from this browser. This can't be undone.`} onClose={() => setDialog(null)}
          onConfirm={async () => { saveSoon.cancel(); const id = docRef.current.id; docRef.current = null; await store.deleteDoc(id); toast('Deleted “' + title + '”'); onExit(); }} />
      )}
      {dialog && dialog.kind === 'alt' && (
        <PromptDialog title="Alternative text" label="Describe the image for screen readers" initial={(imgSel && imgSel.el.getAttribute('alt')) || ''} onClose={() => setDialog(null)}
          onSubmit={(v) => { const q = Q(); if (q && imgRef.current) q.formatText(imgRef.current.index, 1, 'alt', v, 'user'); }} />
      )}

      <AIPanel open={panel === 'ai'} onClose={() => setPanel(null)} quill={Q} lastRange={lastRange} toast={toast}
        setTitle={(t) => { setTitle(t); titleRef.current = t; markDirty(); }} />
      <SourcesSheet open={panel === 'sources'} refs={settings.refs || { style: 'apa', items: [] }} onChange={setRefs} onCite={citeSource} onBibliography={insertBibliography} onClose={() => setPanel(null)} />
      <ParagraphSheet open={panel === 'paragraph'} formats={formats} settings={settings} fmt={fmt} onClose={() => setPanel(null)} />
      <VersionsSheet open={panel === 'versions'} docId={docId} locked={locked} current={() => (Q() ? Q().getText() : '')} onRestore={restoreVersion} onCopy={copyVersion} onSaveNow={saveVersionNow} onClose={() => setPanel(null)} />
      {dialog && dialog.kind === 'footnote' && (
        <FootnoteDialog initial={dialog.id ? { id: dialog.id, text: dialog.text } : null} onClose={() => setDialog(null)}
          onSave={(t) => { const q = Q(); if (!q) return; if (dialog.id) refsLib.editFootnote(q, dialog.id, t); else insertFootnoteText(t); }}
          onDelete={dialog.id ? () => { const q = Q(); if (q) refsLib.deleteFootnote(q, dialog.id); } : null} />
      )}
      {dialog && dialog.kind === 'cover' && <CoverDialog title={title} rtl={settings.dir === 'rtl'} onInsert={insertCover} onClose={() => setDialog(null)} />}
      {dialog && (dialog.kind === 'pw-set' || dialog.kind === 'pw-remove') && (
        <PasswordDialog mode={dialog.kind === 'pw-set' ? 'set' : 'remove'} onClose={() => setDialog(null)} error={dialog.error}
          onSubmit={async (pw, hint) => {
            if (dialog.kind === 'pw-set') { await setPassword(pw, hint); return; }
            const sk = sessionKeys.get(docRef.current.id);
            try {
              const { key } = await deriveKey(pw, sk && sk.salt);
              const probe = await encryptJSON({ ok: 1 }, sk.key);
              await decryptJSON(probe, key);
              await removePassword(); setDialog(null);
            } catch (e) { setDialog({ ...dialog, error: 'That password is not correct.' }); }
          }} />
      )}
      {dialog && dialog.kind === 'save-template' && (
        <PromptDialog title="Save as template" label="Template name" initial={title} confirmLabel="Save template" onClose={() => setDialog(null)} onSubmit={saveAsTemplate} />
      )}
      {dialog && dialog.kind === 'share' && <ShareDialog title={title} build={async (kind) => {
        const q = Q();
        if (kind === 'docx') return { blob: await exportDOCX({ delta: q.getContents(), settings: settingsRef.current, title }), name: safeFilename(title, 'docx'), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        return { blob: new Blob([q.getText()], { type: 'text/plain' }), name: safeFilename(title, 'txt'), type: 'text/plain' };
      }} onPdf={() => { setDialog(null); runExport('pdf'); }} onClose={() => setDialog(null)} toast={toast} />}
      {equation && <EquationDialog initial={equation.initial} onClose={() => setEquation(null)} onInsert={(img) => insertImageData(img, equation.index)} />}
      {drawing && <DrawingEditor initial={drawing.initial} maxWidth={geo.contentW} onClose={() => setDrawing(null)} onInsert={(img) => { insertImageData(img, drawing.index); setDrawing(null); }} />}
      {reading != null && <Reader html={reading} title={title} docId={docId} dir={settings.dir} font={settings.font} onClose={() => setReading(null)} />}
    </div>
  );
}

// Device share sheet where the browser allows it; otherwise saves the file.
function ShareDialog({ title, build, onPdf, onClose, toast }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('docx');
  const [busy, setBusy] = useState(false);
  const canShare = isNative || typeof navigator.share === 'function';
  const prepare = async () => {
    setBusy(true);
    try { const r = await build(kind); setFile(r); } catch (e) { toast('Could not prepare the file: ' + e.message, 'error'); } finally { setBusy(false); }
  };
  const share = async () => {
    if (!file) return;
    if (isNative) {
      try { const r = await nativeShare({ title, filename: file.name, blob: file.blob }); if (r === 'shared') onClose(); } catch (e) { toast('Sharing failed: ' + (e.message || e), 'error'); }
      return;
    }
    const f = new File([file.blob], file.name, { type: file.type });
    try {
      if (!canShare || (navigator.canShare && !navigator.canShare({ files: [f] }))) throw Object.assign(new Error('no-share'), { name: 'NotAllowedError' });
      await navigator.share({ files: [f], title });
      onClose();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      const r = await saveFile(file.name, file.blob).catch(() => null);
      toast(r === 'saved' ? 'The share menu isn’t available here, so the file was saved instead. Share it from your Files app.' : 'Sharing isn’t available here.', r === 'saved' ? undefined : 'error');
      onClose();
    }
  };
  return (
    <Modal title="Share document" onClose={onClose} width={420} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        {file ? <button type="button" className="btn primary" onClick={share}><Icon name="Share2" size={16} />{canShare ? 'Share…' : 'Save file'}</button>
          : <button type="button" className="btn primary" disabled={busy} onClick={prepare}>{busy ? 'Preparing…' : 'Prepare file'}</button>}
      </>
    }>
      <div className="form-stack">
        <Seg label="File type" value={kind} onChange={(v) => { setKind(v); setFile(null); }} options={[{ value: 'docx', label: 'Word' }, { value: 'txt', label: 'Text' }]} />
        <button type="button" className="link-btn" onClick={onPdf}>Need a PDF? Export it from the menu instead.</button>
        <p className="hint">{canShare ? 'Your device’s share menu opens with the file, so you can send it to WhatsApp, email, Drive and more. Some views (including the Claude app preview) block the share menu; then the file is saved instead.' : 'This browser has no share menu, so the file will be saved and you can share it from your Files app.'}</p>
        {file && <p className="muted-p">Ready: {file.name}</p>}
      </div>
    </Modal>
  );
}

function ExportButton({ run }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const d = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', d);
    return () => window.removeEventListener('mousedown', d);
  }, [open]);
  const pick = (k) => { setOpen(false); run(k); };
  return (
    <div className="export-btn" ref={ref}>
      <button type="button" className="btn primary sm" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="Download" size={16} /><span className="hide-xs">Export</span><Icon name="ChevronDown" size={14} />
      </button>
      {open && (
        <div className="pop export-pop" role="menu">
          <button type="button" className="mi" onClick={() => pick('pdf')}><span className="mi-ico"><Icon name="FileText" size={16} /></span><span className="mi-text">PDF document<small>Pages exactly as shown</small></span></button>
          <button type="button" className="mi" onClick={() => pick('docx')}><span className="mi-ico"><Icon name="FileType" size={16} /></span><span className="mi-text">Word document (.docx)<small>Editable in Word and Google Docs</small></span></button>
          <button type="button" className="mi" onClick={() => pick('html')}><span className="mi-ico"><Icon name="Globe" size={16} /></span><span className="mi-text">Web page (.html)</span></button>
          <button type="button" className="mi" onClick={() => pick('txt')}><span className="mi-ico"><Icon name="AlignLeft" size={16} /></span><span className="mi-text">Plain text (.txt)</span></button>
        </div>
      )}
    </div>
  );
}
