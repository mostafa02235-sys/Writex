import React, { useState, useEffect, useRef, useMemo, useCallback } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, ConfirmDialog, PromptDialog } from './ui.jsx';
import { Reader } from './Reader.jsx';
import * as src from '../sources.js';
import * as store from '../store.js';
import { deltaToHTML } from '../quillHtml.js';
import { fmtDate, storage, AR_RE, firstStrongDir } from '../util.js';
import { loadLib, textToDelta } from '../exporters.js';
import { sessionKeys } from '../crypto.js';
import { tr } from '../i18n.js';

const nd = (e) => e.preventDefault();
const READ_FONT = "'Source Serif 4', 'Noto Naskh Arabic', Georgia, serif";
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sizeText = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + tr(' MB') : Math.max(1, Math.round(n / 1024)) + tr(' KB'));
export const textToHtml = (t) => String(t || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => `<p dir="auto">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

// Join wrapped PDF lines back into paragraphs.
export function pdfTextToParagraphs(pages) {
  const out = [];
  for (const page of pages) {
    const lines = page.split('\n');
    let para = '';
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { if (para) { out.push(para); para = ''; } continue; }
      if (para && /[.!?؟:؛]$/.test(para) && l.length > 0) { out.push(para); para = l; } else para = para ? para + ' ' + l : l;
    }
    if (para) out.push(para);
  }
  return out;
}

/* ---------------- PDF reader ---------------- */
function PdfReader({ file, data, onClose, toast }) {
  const [pdf, setPdf] = useState(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(file.pos || 1);
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(() => storage.get('writex.pdfDark', false));
  const [panel, setPanel] = useState(null);
  const [q, setQ] = useState('');
  const [texts, setTexts] = useState(file.pages || null);
  const [speaking, setSpeaking] = useState(false);
  const [width, setWidth] = useState(0);
  const scroller = useRef(null);
  const pagesRef = useRef([]);
  const rendered = useRef(new Map());
  const tts = typeof window.speechSynthesis !== 'undefined';

  useEffect(() => {
    let live = true;
    src.openPdf(data).then((p) => { if (live) setPdf(p); }).catch((e) => { if (live) setErr(e.message || tr('This PDF could not be opened.')); });
    return () => { live = false; if (tts) window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => { storage.set('writex.pdfDark', dark); }, [dark]);
  useEffect(() => {
    const el = scroller.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // page sizes for layout
  const [sizes, setSizes] = useState([]);
  useEffect(() => {
    if (!pdf) return;
    (async () => {
      const s = [];
      for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const v = pg.getViewport({ scale: 1 }); s.push({ w: v.width, h: v.height }); }
      setSizes(s);
      // jump to the remembered page
      setTimeout(() => { const el = pagesRef.current[(file.pos || 1) - 1]; if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 8; }, 50);
    })();
  }, [pdf]);

  const pageW = Math.max(200, Math.min(width - 24, 900) * zoom);
  const renderPage = useCallback(async (i) => {
    if (!pdf || !pagesRef.current[i]) return;
    const key = i + '@' + Math.round(pageW);
    if (rendered.current.get(i) === key) return;
    rendered.current.set(i, key);
    const pg = await pdf.getPage(i + 1);
    const base = pg.getViewport({ scale: 1 });
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const vp = pg.getViewport({ scale: (pageW / base.width) * dpr });
    const c = pagesRef.current[i].querySelector('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    try { await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; } catch (e) { rendered.current.delete(i); }
  }, [pdf, pageW]);

  useEffect(() => {
    if (!sizes.length) return undefined;
    rendered.current.clear();
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) renderPage(+en.target.dataset.i);
    }, { root: scroller.current, rootMargin: '600px 0px' });
    pagesRef.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [sizes, renderPage]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let p = 1;
    pagesRef.current.forEach((n, i) => { if (n && n.offsetTop <= mid) p = i + 1; });
    if (p !== page) { setPage(p); src.updateFile(file.id, { pos: p, openedAt: Date.now() }).catch(() => {}); }
  };
  const goto = (p) => { const el = pagesRef.current[p - 1]; if (el) scroller.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' }); };

  const ensureText = async () => {
    if (texts) return texts;
    toast(tr('Reading the text in this PDF…'), 'busy').close();
    try { const r = await src.sourceText({ kind: 'file', id: file.id }); setTexts(r.pages || []); return r.pages || []; } catch (e) { toast(e.message, 'error'); return []; }
  };
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !texts) return [];
    const out = [];
    texts.forEach((tx, i) => {
      const lo = tx.toLowerCase(); let at = lo.indexOf(t); let n = 0;
      while (at >= 0 && n < 3) { out.push({ page: i + 1, snip: tx.slice(Math.max(0, at - 40), at + t.length + 60).replace(/\s+/g, ' ') }); at = lo.indexOf(t, at + t.length); n++; }
    });
    return out.slice(0, 200);
  }, [q, texts]);

  const speakPage = async () => {
    if (!tts) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const tx = await ensureText();
    const go = (p) => {
      const text = (tx[p - 1] || '').replace(/\s+/g, ' ').trim();
      if (!text) { setSpeaking(false); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = firstStrongDir(text) === 'rtl' || AR_RE.test(text.slice(0, 60)) ? 'ar-SA' : 'en-US';
      u.onend = () => { if (p < tx.length) { goto(p + 1); go(p + 1); } else setSpeaking(false); };
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.cancel();
    setSpeaking(true);
    go(page);
  };

  return (
    <div className={'reader pdfr theme-night' + (dark ? ' pdf-dark' : '')} role="dialog" aria-label={tr('Reading {0}', file.name)}>
      <header className="r-bar">
        <button type="button" data-close className="tb lg" aria-label={tr('Close')} onClick={onClose}><Icon name="X" size={22} /></button>
        <div className="r-title"><span dir="auto">{file.name}</span><small className="tnum">{pdf ? tr('Page {0} of {1}', page, pdf.numPages) : tr('Opening…')}</small></div>
        <button type="button" className={'tb lg' + (panel === 'search' ? ' on' : '')} aria-label={tr('Search in PDF')} onClick={() => { setPanel(panel === 'search' ? null : 'search'); ensureText(); }}><Icon name="Search" size={20} /></button>
        <button type="button" className={'tb lg' + (panel === 'view' ? ' on' : '')} aria-label={tr('View options')} onClick={() => setPanel(panel === 'view' ? null : 'view')}><Icon name="ALargeSmall" size={21} /></button>
      </header>
      <div className="r-progress" style={{ transform: `scaleX(${pdf ? page / pdf.numPages : 0})` }} />
      {panel === 'search' && (
        <div className="r-panel col">
          <label className="search">
            <Icon name="Search" size={18} />
            <input id="pdf-search" autoFocus dir="auto" type="search" placeholder={texts ? tr('Search in PDF') : tr('Preparing text…')} value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="fp-count tnum">{q && texts ? results.length : ''}</span>
          </label>
          {q && texts && (
            <div className="pdf-results">
              {results.length ? results.map((r, i) => (
                <button type="button" key={i} className="pdf-hit" onClick={() => goto(r.page)}><b className="tnum">{tr('p. {0}', r.page)}</b><span dir="auto">…{r.snip}…</span></button>
              )) : <p className="r-note">{tr('No matches.')}</p>}
            </div>
          )}
        </div>
      )}
      {panel === 'view' && (
        <div className="r-panel col">
          <div className="r-row"><span>{tr('Zoom')}</span>
            <div className="mstep"><button type="button" aria-label={tr('Zoom out')} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}><Icon name="Minus" size={18} /></button><span className="tnum">{Math.round(zoom * 100)}%</span><button type="button" aria-label={tr('Zoom in')} onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}><Icon name="Plus" size={18} /></button></div>
          </div>
          <div className="r-row"><span>{tr('Dark pages')}<small className="r-note">{' '}{tr('· inverts page colours')}</small></span><input type="checkbox" className="switch" checked={dark} onChange={(e) => setDark(e.target.checked)} /></div>
          <div className="r-row"><span>{tr('Go to page')}</span>
            <input className="pg-input" type="number" min="1" max={pdf ? pdf.numPages : 1} defaultValue={page} onKeyDown={(e) => { if (e.key === 'Enter') goto(Math.max(1, Math.min(pdf.numPages, +e.target.value || 1))); }} aria-label={tr('Page number')} />
          </div>
        </div>
      )}
      <div className="r-scroll pdf-scroll" ref={scroller} onScroll={onScroll}>
        {err && <div className="empty"><Icon name="FileX2" size={28} /><p>{err}</p></div>}
        {!err && !sizes.length && <div className="empty"><span className="spin" />{' '}{tr('Opening PDF…')}</div>}
        {sizes.map((sz, i) => (
          <div key={i} data-i={i} className="pdf-page" ref={(el) => { pagesRef.current[i] = el; }} style={{ width: pageW, height: Math.round((pageW * sz.h) / sz.w) }}>
            <canvas aria-label={tr('Page {0}{1}', i, 1)} />
            <span className="pdf-num">{i + 1}</span>
          </div>
        ))}
      </div>
      <footer className="r-foot">
        {tts ? <div className="r-tts"><button type="button" className={'btn' + (speaking ? '' : ' primary')} onClick={speakPage}><Icon name={speaking ? 'Square' : 'Play'} size={18} />{speaking ? tr('Stop') : tr('Read page aloud')}</button></div> : <span className="r-note">{tr('Read aloud is not supported here.')}</span>}
        <span className="r-pct tnum">{pdf ? Math.round((page / pdf.numPages) * 100) : 0}%</span>
      </footer>
    </div>
  );
}

function ImageViewer({ file, data, onClose }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data])), [data]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [z, setZ] = useState(1);
  return (
    <div className="reader theme-night" role="dialog" aria-label={file.name}>
      <header className="r-bar">
        <button type="button" data-close className="tb lg" aria-label={tr('Close')} onClick={onClose}><Icon name="X" size={22} /></button>
        <div className="r-title"><span dir="auto">{file.name}</span><small>{sizeText(file.size)}</small></div>
        <button type="button" className="tb lg" aria-label={tr('Zoom out')} onClick={() => setZ((v) => Math.max(0.5, v - 0.25))}><Icon name="ZoomOut" size={20} /></button>
        <button type="button" className="tb lg" aria-label={tr('Zoom in')} onClick={() => setZ((v) => Math.min(4, v + 0.25))}><Icon name="ZoomIn" size={20} /></button>
      </header>
      <div className="r-scroll img-view"><img src={url} alt={file.name} style={{ width: `${z * 100}%` }} /></div>
    </div>
  );
}

/* ---------------- section ---------------- */
const FILTERS = [['all', tr('All')], ['pdf', 'PDF'], ['docx', tr('Word')], ['txt', tr('Text')], ['image', tr('Images')], ['docs', tr('My documents')]];

export function ReadSection({ toast, openDoc, openSettings, askAbout }) {
  const [files, setFiles] = useState(null);
  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState(() => storage.get('writex.readFilter', 'all'));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); // {kind, file|doc, data|html}
  const [act, setAct] = useState(null);
  const [dialog, setDialog] = useState(null);
  const input = useRef(null);

  const refresh = async () => {
    try { const [f, d] = await Promise.all([src.listFiles(), store.listDocs()]); setFiles(f); setDocs(d); } catch (e) { setFiles([]); toast(tr('Files could not be loaded: {0}', e.message), 'error'); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { storage.set('writex.readFilter', filter); }, [filter]);

  const onPick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    let last = null;
    for (const f of list) {
      try { last = await src.addFile(f); } catch (err) { toast(f.name + ': ' + err.message, 'error'); }
    }
    await refresh();
    if (last && list.length === 1) openFile(last);
    else if (list.length > 1) toast(tr('Added {0} files', list.length));
  };

  const openFile = async (f) => {
    try {
      const data = await src.getFileData(f.id);
      if (!data) throw new Error(tr('The file data is missing.'));
      src.updateFile(f.id, { openedAt: Date.now() }).catch(() => {});
      if (f.type === 'pdf') { setOpen({ kind: 'pdf', file: f, data }); return; }
      if (f.type === 'image') { setOpen({ kind: 'image', file: f, data }); return; }
      let html;
      if (f.type === 'txt') html = textToHtml(new TextDecoder().decode(data));
      else { await loadLib.mammoth(); html = (await window.mammoth.convertToHtml({ arrayBuffer: data.slice(0) })).value; }
      setOpen({ kind: 'html', file: f, html });
    } catch (e) { toast(tr('Could not open {0}: {1}', f.name, e.message), 'error'); }
  };
  const openWriteDoc = (d) => {
    if (d.locked && !sessionKeys.get(d.id)) { toast(tr('This document is password protected. Open it in Write to unlock it.'), 'error'); return; }
    const delta = d.locked ? sessionKeys.get(d.id).plain.delta : d.delta;
    setOpen({ kind: 'html', doc: d, html: deltaToHTML(delta).replace(/ contenteditable="(true|false)"/g, '') });
  };

  const toEditable = async (f) => {
    setAct(null);
    const busy = toast(tr('Converting {0}…', f.name), 'busy');
    try {
      const data = await src.getFileData(f.id);
      const title = f.name.replace(/\.(pdf|docx|txt|md)$/i, '');
      if (f.type === 'docx') {
        await loadLib.mammoth();
        const html = (await window.mammoth.convertToHtml({ arrayBuffer: data.slice(0) })).value;
        const d = await store.createDoc({ title }); busy.close(); openDoc(d.id, { importHtml: html }); return;
      }
      let text;
      if (f.type === 'txt') text = new TextDecoder().decode(data);
      else { const r = await src.sourceText({ kind: 'file', id: f.id }); text = pdfTextToParagraphs(r.pages || []).join('\n\n'); }
      const d = await store.createDoc({ title }); busy.close(); openDoc(d.id, { importHtml: { text: text.replace(/\n{2,}/g, '\n') } });
    } catch (e) { busy.close(); toast(tr('Conversion failed: {0}', e.message), 'error'); }
  };

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (filter === 'docs') return docs.filter((d) => !t || (d.title || '').toLowerCase().includes(t)).map((d) => ({ doc: d }));
    return (files || []).filter((f) => (filter === 'all' || f.type === filter) && (!t || f.name.toLowerCase().includes(t))).map((f) => ({ file: f }));
  }, [files, docs, filter, q]);

  const recentPdf = (files || []).find((f) => f.type === 'pdf' && f.pos > 1);

  return (
    <div className="sec-shell">
      <main className="lib-main">
        <div className="lib-inner">
          <header className="sec-top">
            <h1>{tr('Read')}</h1>
            <div className="sec-top-actions">
              <button type="button" className="tb lg" aria-label={tr('Settings')} onClick={openSettings}><Icon name="Settings" size={20} /></button>
              <button type="button" className="tb lg accent" aria-label={tr('Add files')} onClick={() => input.current && input.current.click()}><Icon name="Plus" size={22} /></button>
            </div>
          </header>
          <input ref={input} id="read-files" type="file" multiple accept={src.ACCEPT_ALL} hidden onChange={onPick} />
          {recentPdf && (
            <button type="button" className="continue-card" onClick={() => openFile(recentPdf)}>
              <Icon name="BookOpen" size={22} />
              <span><b dir="auto">{recentPdf.name}</b><small>{tr('Continue on page {0}', recentPdf.pos)}</small></span>
              <Icon name="ChevronRight" size={18} />
            </button>
          )}
          <label className="search">
            <Icon name="Search" size={18} />
            <input id="read-search" type="search" dir="auto" placeholder={tr('Search files')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="fchips" role="tablist" aria-label={tr('File types')}>
            {FILTERS.map(([k, l]) => <button type="button" role="tab" key={k} aria-selected={filter === k} className={'fchip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          {files === null ? <div className="empty"><span className="spin" />{' '}{tr('Loading…')}</div>
            : !list.length ? (
              <div className="empty">
                <Icon name="FolderOpen" size={30} />
                <p>{filter === 'docs' ? tr('No documents yet.') : tr('Add PDFs, Word files, text files or images to read them here. Everything stays on this device.')}</p>
                {filter !== 'docs' && <button type="button" className="btn primary" onClick={() => input.current && input.current.click()}><Icon name="Upload" size={18} />{tr('Add files')}</button>}
              </div>
            ) : (
              <div className="drows">
                {list.map(({ file: f, doc: d }) => (f ? (
                  <article key={f.id} className="drow">
                    <button type="button" className="drow-main" onClick={() => openFile(f)}>
                      <span className={'ftype t-' + f.type}><Icon name={src.FILE_TYPES[f.type].icon} size={20} /><b>{src.FILE_TYPES[f.type].label}</b></span>
                      <span className="drow-text">
                        <span className="drow-title" dir="auto">{f.name}</span>
                        <span className="drow-meta">{sizeText(f.size)} · {fmtDate(f.openedAt || f.addedAt)}{f.type === 'pdf' && f.pos > 1 ? tr(' · page {0}', f.pos) : ''}</span>
                      </span>
                    </button>
                    <button type="button" className="tb lg" aria-label={tr('Options for {0}', f.name)} onClick={() => setAct(f)}><Icon name="Ellipsis" size={20} /></button>
                  </article>
                ) : (
                  <article key={d.id} className="drow">
                    <button type="button" className="drow-main" onClick={() => openWriteDoc(d)}>
                      <span className="ftype t-doc"><Icon name={d.locked ? 'Lock' : 'PenLine'} size={20} /><b>{tr('Writex')}</b></span>
                      <span className="drow-text"><span className="drow-title" dir="auto">{d.title}</span><span className="drow-meta">{fmtDate(d.updatedAt)}{d.words ? tr(' · {0} words', d.words.toLocaleString()) : ''}</span></span>
                    </button>
                    <button type="button" className="tb lg" aria-label={tr('Ask about {0}', d.title)} onClick={() => askAbout({ kind: 'doc', id: d.id })}><Icon name="MessagesSquare" size={19} /></button>
                  </article>
                )))}
              </div>
            )}
          <p className="mnote">{tr('PDF, Word (.docx), text (.txt, .md) and images (PNG, JPG, WebP, GIF). Scanned PDFs without selectable text open for reading, but can\'t be searched or analysed yet.')}</p>
        </div>
      </main>

      <Sheet open={!!act} onClose={() => setAct(null)} title={act ? act.name : ''}>
        {act && (
          <div className="mlist">
            <button type="button" className="mrow" onMouseDown={nd} onClick={() => { const f = act; setAct(null); openFile(f); }}><span className="mrow-ico"><Icon name="BookOpen" size={19} /></span><span className="mrow-label">{tr('Open')}</span></button>
            {act.type !== 'image' && <button type="button" className="mrow" onMouseDown={nd} onClick={() => { const f = act; setAct(null); askAbout({ kind: 'file', id: f.id }); }}><span className="mrow-ico"><Icon name="MessagesSquare" size={19} /></span><span className="mrow-label">{tr('Ask in Think')}</span></button>}
            {act.type !== 'image' && <button type="button" className="mrow" onMouseDown={nd} onClick={() => toEditable(act)}><span className="mrow-ico"><Icon name="FilePen" size={19} /></span><span className="mrow-label">{tr('Convert to editable document')}<small>{act.type === 'pdf' ? 'Text and paragraphs; layout and images are not kept' : tr('Opens in Write')}</small></span></button>}
            <button type="button" className="mrow" onMouseDown={nd} onClick={() => { const f = act; setAct(null); setTimeout(() => setDialog({ kind: 'rename', f }), 200); }}><span className="mrow-ico"><Icon name="Pencil" size={19} /></span><span className="mrow-label">{tr('Rename')}</span></button>
            <button type="button" className="mrow danger" onMouseDown={nd} onClick={() => { const f = act; setAct(null); setTimeout(() => setDialog({ kind: 'delete', f }), 200); }}><span className="mrow-ico"><Icon name="Trash2" size={19} /></span><span className="mrow-label">{tr('Remove from Read')}</span></button>
          </div>
        )}
      </Sheet>
      {dialog && dialog.kind === 'rename' && <PromptDialog title={tr('Rename file')} label={tr('Name')} initial={dialog.f.name} onClose={() => setDialog(null)} onSubmit={async (v) => { await src.updateFile(dialog.f.id, { name: v }); refresh(); }} />}
      {dialog && dialog.kind === 'delete' && <ConfirmDialog title={tr('Remove file?')} message={tr('“{0}” will be removed from this device.', dialog.f.name)} onClose={() => setDialog(null)} onConfirm={async () => { await src.deleteFile(dialog.f.id); refresh(); toast(tr('Removed')); }} />}

      {open && open.kind === 'pdf' && <PdfReader file={open.file} data={open.data} toast={toast} onClose={() => { setOpen(null); refresh(); }} />}
      {open && open.kind === 'image' && <ImageViewer file={open.file} data={open.data} onClose={() => setOpen(null)} />}
      {open && open.kind === 'html' && (
        <Reader html={open.html} title={open.file ? open.file.name : open.doc.title} docId={open.file ? 'file:' + open.file.id : open.doc.id}
          dir="auto" font={open.doc ? (open.doc.settings || {}).font : READ_FONT} onClose={() => { setOpen(null); refresh(); }} />
      )}
    </div>
  );
}
