import React, { useState, useEffect, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { Modal, Sheet, Seg, ConfirmDialog } from './ui.jsx';
import { CITE_STYLES, formatReference } from '../references.js';
import { diffLines } from '../diff.js';
import { fmtDate, uid } from '../util.js';
import * as store from '../store.js';

const nd = (e) => e.preventDefault();
export const deltaText = (d) => ((d && d.ops) || []).map((op) => (typeof op.insert === 'string' ? op.insert : op.insert && op.insert.image ? '' : '')).join('');

/* ---------- footnotes ---------- */
export function FootnoteDialog({ initial, onSave, onDelete, onClose }) {
  const [t, setT] = useState(initial ? initial.text : '');
  return (
    <Modal title={initial ? 'Edit footnote' : 'Insert footnote'} onClose={onClose} width={440} footer={
      <>
        {onDelete && <button type="button" className="btn ghost danger-text" onClick={() => { onDelete(); onClose(); }}>Delete</button>}
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!t.trim()} onClick={() => { onSave(t.trim()); onClose(); }}>{initial ? 'Save' : 'Insert'}</button>
      </>
    }>
      <label className="field">
        <span>Footnote text</span>
        <textarea id="fn-text" autoFocus dir="auto" rows={4} value={t} onChange={(e) => setT(e.target.value)} placeholder="e.g. Source: Ministry of Education report, 2025." />
      </label>
      <p className="hint" style={{ marginTop: 10 }}>The number appears at the cursor. Notes are listed at the end of the document and become real footnotes in Word exports.</p>
    </Modal>
  );
}

/* ---------- citations & sources ---------- */
const EMPTY = { type: 'book', authors: '', year: '', title: '', container: '', publisher: '', pages: '', url: '' };
export function SourcesSheet({ open, refs, onChange, onCite, onBibliography, onClose }) {
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (!open) setEditing(null); }, [open]);
  const style = refs.style || 'apa';
  const items = refs.items || [];
  const save = (src) => {
    const list = src.id ? items.map((x) => (x.id === src.id ? src : x)) : [...items, { ...src, id: uid('src') }];
    onChange({ ...refs, items: list });
    setEditing(null);
  };
  const del = (id) => { onChange({ ...refs, items: items.filter((x) => x.id !== id) }); setEditing(null); };
  const f = editing;
  const field = (k, label, ph, extra) => (
    <label className="field"><span>{label}</span>
      <input id={'src-' + k} dir="auto" value={f[k] || ''} placeholder={ph} onChange={(e) => setEditing({ ...f, [k]: e.target.value })} {...(extra || {})} /></label>
  );
  return (
    <Sheet open={open} onClose={onClose} title={f ? (f.id ? 'Edit source' : 'New source') : 'Citations & sources'} className="sheet-tall"
      actions={f ? <button type="button" data-back className="tb" aria-label="Back" onMouseDown={nd} onClick={() => setEditing(null)}><Icon name="ArrowLeft" size={20} /></button> : null}>
      {f ? (
        <div className="form-stack">
          <Seg label="Source type" value={f.type} onChange={(v) => setEditing({ ...f, type: v })} options={[{ value: 'book', label: 'Book' }, { value: 'article', label: 'Article' }, { value: 'web', label: 'Website' }]} />
          {field('authors', 'Authors', 'Last, First; Last, First')}
          {field('title', 'Title', 'Title of the work')}
          <div className="grid-2">
            {field('year', 'Year', '2025', { inputMode: 'numeric' })}
            {field('pages', 'Pages', '12–19')}
          </div>
          {field('container', f.type === 'article' ? 'Journal' : f.type === 'web' ? 'Website' : 'Edition / series', '')}
          {field('publisher', 'Publisher', '')}
          {field('url', 'Link (optional)', 'https://…', { dir: 'ltr', type: 'url' })}
          {f.title && <p className="hint">Preview: {formatReference(f, style, 1)}</p>}
          <div className="ai-actions">
            {f.id && <button type="button" className="btn ghost danger-text" onClick={() => del(f.id)}><Icon name="Trash2" size={16} />Delete</button>}
            <span className="grow" />
            <button type="button" className="btn primary" disabled={!f.title && !f.authors} onClick={() => save(f)}>Save source</button>
          </div>
        </div>
      ) : (
        <>
          <section className="msec">
            <h3>Citation style</h3>
            <Seg label="Citation style" value={style} onChange={(v) => onChange({ ...refs, style: v })} options={Object.entries(CITE_STYLES).map(([k, l]) => ({ value: k, label: l }))} />
          </section>
          <section className="msec">
            <h3>Sources ({items.length})</h3>
            {items.length ? (
              <div className="mlist">
                {items.map((s) => (
                  <div key={s.id} className="src-row">
                    <button type="button" className="src-main" onMouseDown={nd} onClick={() => setEditing(s)}>
                      <span dir="auto" className="src-title">{s.title || 'Untitled'}</span>
                      <span className="src-meta" dir="auto">{[s.authors, s.year].filter(Boolean).join(' · ')}</span>
                    </button>
                    <button type="button" className="btn sm" onMouseDown={nd} onClick={() => { onCite(s); onClose(); }}>Cite</button>
                  </div>
                ))}
              </div>
            ) : <p className="mnote">No sources yet. Add the books, articles and websites you use, then tap Cite to place a citation at the cursor.</p>}
            <button type="button" className="btn block" onMouseDown={nd} onClick={() => setEditing({ ...EMPTY })}><Icon name="Plus" size={18} />Add source</button>
          </section>
          <section className="msec">
            <button type="button" className="btn primary block" onMouseDown={nd} onClick={() => { onBibliography(); onClose(); }}><Icon name="BookMarked" size={18} />Insert or update bibliography</button>
          </section>
        </>
      )}
    </Sheet>
  );
}

/* ---------- cover pages ---------- */
const COVERS = [{ id: 'classic', label: 'Classic', note: 'Centered, formal' }, { id: 'bold', label: 'Bold', note: 'Large title with a rule' }, { id: 'minimal', label: 'Minimal', note: 'Left-aligned, quiet' }];
export function CoverDialog({ title, rtl, onInsert, onClose }) {
  const [style, setStyle] = useState('classic');
  const [v, setV] = useState({ title: title || '', subtitle: '', author: '', date: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Modal title="Cover page" onClose={onClose} width={480} footer={
      <><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => { onInsert(style, v); onClose(); }}>Insert at start</button></>
    }>
      <div className="form-stack">
        <div className="cover-pick">
          {COVERS.map((c) => (
            <button type="button" key={c.id} className={'cover-opt cv-' + c.id + (style === c.id ? ' on' : '')} onClick={() => setStyle(c.id)} aria-pressed={style === c.id}>
              <span className="cv-art" aria-hidden="true"><i /><b /><em /></span><span>{c.label}</span><small>{c.note}</small>
            </button>
          ))}
        </div>
        <label className="field"><span>Title</span><input id="cv-title" dir="auto" value={v.title} onChange={set('title')} placeholder={rtl ? 'عنوان المستند' : 'Document title'} /></label>
        <label className="field"><span>Subtitle</span><input id="cv-sub" dir="auto" value={v.subtitle} onChange={set('subtitle')} /></label>
        <div className="grid-2">
          <label className="field"><span>Author</span><input id="cv-author" dir="auto" value={v.author} onChange={set('author')} /></label>
          <label className="field"><span>Date</span><input id="cv-date" dir="auto" value={v.date} onChange={set('date')} placeholder="Today" /></label>
        </div>
        <p className="hint">The cover is ordinary text followed by a page break, so you can edit it like the rest of the document.</p>
      </div>
    </Modal>
  );
}

/* ---------- paragraph ---------- */
const SHADES = [['', 'None'], ['gray', 'Gray'], ['blue', 'Blue'], ['green', 'Green'], ['yellow', 'Yellow'], ['red', 'Red'], ['purple', 'Purple']];
export function ParagraphSheet({ open, formats: f, settings, fmt, onClose }) {
  const first = parseFloat(f.textindent) || 0;
  const mode = f.hanging ? 'hanging' : first > 0 ? 'first' : 'none';
  const setMode = (m) => {
    if (m === 'none') { fmt('textindent', false); fmt('hanging', false); }
    if (m === 'first') { fmt('hanging', false); fmt('textindent', '48px'); }
    if (m === 'hanging') { fmt('textindent', false); fmt('hanging', '1'); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Paragraph">
      <section className="msec"><h3>Special indent</h3>
        <Seg label="Special indent" value={mode} onChange={setMode} options={[{ value: 'none', label: 'None' }, { value: 'first', label: 'First line' }, { value: 'hanging', label: 'Hanging' }]} />
        {mode === 'first' && <div className="mchips">{[24, 36, 48, 72].map((px) => <button type="button" key={px} className={'mchip' + (first === px ? ' on' : '')} onMouseDown={nd} onClick={() => fmt('textindent', px + 'px')}>{(px / 37.8).toFixed(2)} cm</button>)}</div>}
      </section>
      <section className="msec"><h3>Shading</h3>
        <div className="mchips">{SHADES.map(([k, l]) => <button type="button" key={l} className={'mchip shade-chip' + ((f.shade || '') === k ? ' on' : '')} onMouseDown={nd} onClick={() => fmt('shade', k || false)}><i className={'ql-shade-' + (k || 'none')} />{l}</button>)}</div>
      </section>
      <section className="msec"><h3>Border</h3>
        <Seg label="Paragraph border" value={f.pborder || ''} onChange={(v) => fmt('pborder', v || false)} options={[{ value: '', label: 'None' }, { value: 'box', label: 'Box' }, { value: 'left', label: 'Side bar' }, { value: 'bottom', label: 'Bottom' }]} />
      </section>
      <section className="msec"><h3>Spacing</h3>
        <div className="mline"><span className="mline-label">Before</span>
          <div className="mchips">{[0, 6, 12, 18, 24].map((v) => <button type="button" key={v} className={'mchip' + ((parseFloat(f.spacebefore) || 0) === v ? ' on' : '')} onMouseDown={nd} onClick={() => fmt('spacebefore', v ? v + 'px' : false)}>{v}</button>)}</div></div>
        <div className="mline"><span className="mline-label">After</span>
          <div className="mchips">{[0, 6, 12, 18, 24].map((v) => <button type="button" key={v} className={'mchip' + ((parseFloat(f.spaceafter) || 0) === v ? ' on' : '')} onMouseDown={nd} onClick={() => fmt('spaceafter', v ? v + 'px' : false)}>{v}</button>)}</div></div>
        <div className="mline"><span className="mline-label">Line</span>
          <div className="mchips">{[1, 1.15, 1.5, 2].map((v) => <button type="button" key={v} className={'mchip' + (Math.abs((parseFloat(f.lineheight) || settings.lineHeight) - v) < 0.01 ? ' on' : '')} onMouseDown={nd} onClick={() => fmt('lineheight', String(v))}>{v}</button>)}</div></div>
      </section>
    </Sheet>
  );
}

/* ---------- version history ---------- */
export function VersionsSheet({ open, docId, current, onRestore, onCopy, onSaveNow, onClose, locked }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const load = async () => { try { setList(await store.listVersions(docId)); } catch (e) { setList([]); } };
  useEffect(() => { if (open) { setSel(null); load(); } }, [open]);
  const diff = useMemo(() => (sel ? diffLines(deltaText(sel.delta), current()) : null), [sel]);
  const label = (r) => ({ auto: 'Autosave', open: 'Opened', close: 'Closed', manual: 'Saved by you', restore: 'Before restore', ai: 'Before AI change' }[r] || 'Autosave');
  return (
    <>
      <Sheet open={open} onClose={onClose} title={sel ? fmtDate(sel.at) : 'Version history'} className="sheet-tall"
        actions={sel ? <button type="button" data-back className="tb" aria-label="Back" onMouseDown={nd} onClick={() => setSel(null)}><Icon name="ArrowLeft" size={20} /></button> : null}>
        {locked ? <p className="mnote">Version history is off for password-protected documents, so no unencrypted copies are kept.</p>
          : sel ? (
            <>
              <div className="ver-legend"><span className="d-del">Only in this version</span><span className="d-add">Only in the current document</span></div>
              <div className="ver-diff" dir="auto">
                {diff.map((p, i) => (p.type === 'same'
                  ? (p.lines.length > 4
                    ? <div key={i} className="d-same">{p.lines.slice(0, 2).join('\n')}{'\n'}<span className="d-skip">· · · {p.lines.length - 4} unchanged lines · · ·</span>{'\n'}{p.lines.slice(-2).join('\n')}</div>
                    : <div key={i} className="d-same">{p.lines.join('\n')}</div>)
                  : <div key={i} className={'d-' + p.type}>{p.lines.join('\n') || ' '}</div>))}
              </div>
              <div className="ai-actions">
                <button type="button" className="btn primary" onClick={() => setConfirm(sel)}><Icon name="History" size={16} />Restore this version</button>
                <button type="button" className="btn" onClick={() => { onCopy(sel); onClose(); }}><Icon name="Copy" size={16} />Open as copy</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="btn block" onMouseDown={nd} onClick={async () => { await onSaveNow(); load(); }}><Icon name="Save" size={18} />Save a version now</button>
              <section className="msec">
                <h3>Saved versions</h3>
                {list === null ? <p className="mnote"><span className="spin" /> Loading…</p>
                  : list.length ? (
                    <div className="mlist">
                      {list.map((v) => (
                        <button type="button" key={v.id} className="mrow" onMouseDown={nd} onClick={() => setSel(v)}>
                          <span className="mrow-ico"><Icon name="History" size={19} /></span>
                          <span className="mrow-label">{fmtDate(v.at)}<small>{new Date(v.at).toLocaleString()} · {label(v.reason)} · {(v.words || 0).toLocaleString()} words</small></span>
                          <Icon name="ChevronRight" size={16} className="mrow-chev" />
                        </button>
                      ))}
                    </div>
                  ) : <p className="mnote">Versions are saved automatically every 10 minutes while you write and when you close the document.</p>}
              </section>
            </>
          )}
      </Sheet>
      {confirm && <ConfirmDialog title="Restore this version?" danger={false} confirmLabel="Restore" onClose={() => setConfirm(null)}
        message={`The document will go back to how it was ${fmtDate(confirm.at).toLowerCase()}. Your current text is saved as a version first, so you can return to it.`}
        onConfirm={() => { onRestore(confirm); onClose(); }} />}
    </>
  );
}

/* ---------- password protection ---------- */
export function PasswordDialog({ mode, onSubmit, onClose, error }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const setting = mode === 'set';
  const ok = setting ? p1.length >= 6 && p1 === p2 : p1.length > 0;
  const submit = async (e) => { e && e.preventDefault(); if (!ok || busy) return; setBusy(true); try { await onSubmit(p1, hint); } finally { setBusy(false); } };
  return (
    <Modal title={setting ? 'Protect with a password' : mode === 'remove' ? 'Remove password' : 'Unlock document'} onClose={onClose} width={420} footer={
      <><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!ok || busy} onClick={submit}>{busy ? 'Working…' : setting ? 'Protect' : mode === 'remove' ? 'Remove' : 'Unlock'}</button></>
    }>
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>Password</span><input id="pw-1" type="password" autoFocus autoComplete={setting ? 'new-password' : 'current-password'} value={p1} onChange={(e) => setP1(e.target.value)} /></label>
        {setting && <label className="field"><span>Confirm password</span><input id="pw-2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></label>}
        {setting && <label className="field"><span>Hint (optional, not secret)</span><input id="pw-hint" dir="auto" value={hint} onChange={(e) => setHint(e.target.value)} /></label>}
        {setting && <p className="hint">The document is encrypted on this device with AES-256. If you forget the password, the document can't be recovered. Version history is turned off for protected documents.</p>}
        {setting && p1 && p1.length < 6 && <p className="error-text">Use at least 6 characters.</p>}
        {setting && p2 && p1 !== p2 && <p className="error-text">The passwords don't match.</p>}
        {error && <p className="error-text">{error}</p>}
        <button type="submit" hidden>Submit</button>
      </form>
    </Modal>
  );
}
