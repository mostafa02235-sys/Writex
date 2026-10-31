import React, { useState } from '../react.js';
import { Modal, Seg } from './ui.jsx';
import { PX_PER_CM } from '../constants.js';

export function HeaderFooterDialog({ settings, focus, onSave, onClose }) {
  const [header, setHeader] = useState({ ...settings.header });
  const [footer, setFooter] = useState({ ...settings.footer });
  const [first, setFirst] = useState(!!settings.firstPageDifferent);
  const alignOpts = [{ value: 'left', icon: 'AlignLeft', title: 'Left' }, { value: 'center', icon: 'AlignCenter', title: 'Center' }, { value: 'right', icon: 'AlignRight', title: 'Right' }];
  const save = () => { onSave({ header, footer, firstPageDifferent: first }); onClose(); };
  return (
    <Modal title="Header & footer" onClose={onClose} width={500} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Apply</button>
      </>
    }>
      <div className="form-stack">
        <label className="field">
          <span>Header text</span>
          <input id="hf-header" dir="auto" autoFocus={focus === 'header'} value={header.text} placeholder="e.g. {title} — Chapter 1" onChange={(e) => setHeader({ ...header, text: e.target.value })} />
        </label>
        <Seg label="Header alignment" value={header.align} onChange={(v) => setHeader({ ...header, align: v })} options={alignOpts} />
        <label className="field">
          <span>Footer text</span>
          <input id="hf-footer" dir="auto" autoFocus={focus === 'footer'} value={footer.text} placeholder="e.g. Confidential · {date}" onChange={(e) => setFooter({ ...footer, text: e.target.value })} />
        </label>
        <Seg label="Footer alignment" value={footer.align} onChange={(v) => setFooter({ ...footer, align: v })} options={alignOpts} />
        <label className="switch-row">
          <span>Different first page<small>Hide the header, footer and page number on page 1, e.g. for a cover page.</small></span>
          <input id="hf-first" type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />
        </label>
        <p className="hint">Placeholders: <code>{'{page}'}</code> page number, <code>{'{pages}'}</code> total pages, <code>{'{title}'}</code> document name, <code>{'{date}'}</code> today. Page numbers have their own control in Insert → Page numbers.</p>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ stats, pages, onClose }) {
  const minutes = Math.max(1, Math.round(stats.words / 200));
  const rows = [
    ['Pages', pages],
    ['Words', stats.words],
    ['Arabic words', stats.arabic],
    ['Latin-script words', stats.latin],
    ['Characters (no spaces)', stats.charsNoSpace],
    ['Characters (with spaces)', stats.chars],
    ['Paragraphs', stats.paragraphs],
  ];
  return (
    <Modal title="Word count" onClose={onClose} width={380} footer={<button type="button" className="btn primary" onClick={onClose}>Close</button>}>
      <dl className="stats-table">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd className="tnum">{Number(v).toLocaleString()}</dd></div>))}
        <div><dt>Reading time</dt><dd className="tnum">{stats.words ? `about ${minutes} min` : '—'}</dd></div>
      </dl>
    </Modal>
  );
}

export function LinkDialog({ initial, hasSelection, onSave, onRemove, onClose }) {
  const [url, setUrl] = useState(initial || '');
  const [text, setText] = useState('');
  const submit = (e) => { e && e.preventDefault(); if (!url.trim()) return; onSave(url, text.trim()); onClose(); };
  return (
    <Modal title={initial ? 'Edit link' : 'Insert link'} onClose={onClose} width={440} footer={
      <>
        {onRemove && <button type="button" className="btn ghost danger-text" onClick={() => { onRemove(); onClose(); }}>Remove link</button>}
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!url.trim()} onClick={submit}>{initial ? 'Update' : 'Insert'}</button>
      </>
    }>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Web address</span>
          <input id="link-url" autoFocus dir="ltr" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} />
        </label>
        {!hasSelection && !initial && (
          <label className="field">
            <span>Text to show</span>
            <input id="link-text" dir="auto" value={text} placeholder="Leave empty to show the address" onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <button type="submit" hidden>Insert</button>
      </form>
    </Modal>
  );
}

export function MarginsDialog({ settings, onSave, onClose }) {
  const cm = (px) => Math.round((px / PX_PER_CM) * 100) / 100;
  const [v, setV] = useState({ t: cm(settings.margins.t), b: cm(settings.margins.b), l: cm(settings.margins.l), r: cm(settings.margins.r) });
  const set = (k, x) => setV({ ...v, [k]: x });
  const valid = ['t', 'b', 'l', 'r'].every((k) => +v[k] >= 0 && +v[k] <= 8);
  const save = () => {
    if (!valid) return;
    const px = (x) => Math.round(+x * PX_PER_CM);
    onSave({ marginPreset: 'custom', margins: { t: px(v.t), b: px(v.b), l: px(v.l), r: px(v.r) } });
    onClose();
  };
  const field = (k, label) => (
    <label className="field">
      <span>{label}</span>
      <div className="unit-input"><input id={'m-' + k} type="number" min="0" max="8" step="0.1" inputMode="decimal" value={v[k]} onChange={(e) => set(k, e.target.value)} /><em>cm</em></div>
    </label>
  );
  return (
    <Modal title="Custom margins" onClose={onClose} width={420} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!valid} onClick={save}>Apply</button>
      </>
    }>
      <div className="grid-2">
        {field('t', 'Top')}{field('b', 'Bottom')}{field('l', 'Left')}{field('r', 'Right')}
      </div>
      {!valid && <p className="error-text">Margins must be between 0 and 8 cm.</p>}
    </Modal>
  );
}
