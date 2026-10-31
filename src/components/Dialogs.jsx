import React, { useState } from '../react.js';
import { Modal, Seg } from './ui.jsx';
import { PX_PER_CM } from '../constants.js';
import { tr } from '../i18n.js';

export function HeaderFooterDialog({ settings, focus, onSave, onClose }) {
  const [header, setHeader] = useState({ ...settings.header });
  const [footer, setFooter] = useState({ ...settings.footer });
  const [first, setFirst] = useState(!!settings.firstPageDifferent);
  const alignOpts = [{ value: 'left', icon: 'AlignLeft', title: tr('Left') }, { value: 'center', icon: 'AlignCenter', title: tr('Center') }, { value: 'right', icon: 'AlignRight', title: tr('Right') }];
  const save = () => { onSave({ header, footer, firstPageDifferent: first }); onClose(); };
  return (
    <Modal title={tr('Header & footer')} onClose={onClose} width={500} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>{tr('Cancel')}</button>
        <button type="button" className="btn primary" onClick={save}>{tr('Apply')}</button>
      </>
    }>
      <div className="form-stack">
        <label className="field">
          <span>{tr('Header text')}</span>
          <input id="hf-header" dir="auto" autoFocus={focus === 'header'} value={header.text} placeholder="e.g. {title} — Chapter 1" onChange={(e) => setHeader({ ...header, text: e.target.value })} />
        </label>
        <Seg label={tr('Header alignment')} value={header.align} onChange={(v) => setHeader({ ...header, align: v })} options={alignOpts} />
        <label className="field">
          <span>{tr('Footer text')}</span>
          <input id="hf-footer" dir="auto" autoFocus={focus === 'footer'} value={footer.text} placeholder="e.g. Confidential · {date}" onChange={(e) => setFooter({ ...footer, text: e.target.value })} />
        </label>
        <Seg label={tr('Footer alignment')} value={footer.align} onChange={(v) => setFooter({ ...footer, align: v })} options={alignOpts} />
        <label className="switch-row">
          <span>{tr('Different first page')}<small>{tr('Hide the header, footer and page number on page 1, e.g. for a cover page.')}</small></span>
          <input id="hf-first" type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />
        </label>
        <p className="hint">{tr('Placeholders:')}{' '}<code>{'{page}'}</code>{' '}{tr('page number,')}{' '}<code>{'{pages}'}</code>{' '}{tr('total pages,')}{' '}<code>{'{title}'}</code>{' '}{tr('document name,')}{' '}<code>{'{date}'}</code>{' '}{tr('today. Page numbers have their own control in Insert → Page numbers.')}</p>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ stats, pages, onClose }) {
  const minutes = Math.max(1, Math.round(stats.words / 200));
  const rows = [
    [tr('Pages'), pages],
    [tr('Words'), stats.words],
    [tr('Arabic words'), stats.arabic],
    [tr('Latin-script words'), stats.latin],
    [tr('Characters (no spaces)'), stats.charsNoSpace],
    [tr('Characters (with spaces)'), stats.chars],
    [tr('Paragraphs'), stats.paragraphs],
  ];
  return (
    <Modal title={tr('Word count')} onClose={onClose} width={380} footer={<button type="button" className="btn primary" onClick={onClose}>{tr('Close')}</button>}>
      <dl className="stats-table">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd className="tnum">{Number(v).toLocaleString()}</dd></div>))}
        <div><dt>{tr('Reading time')}</dt><dd className="tnum">{stats.words ? tr('about {0} min', minutes) : '—'}</dd></div>
      </dl>
    </Modal>
  );
}

export function LinkDialog({ initial, hasSelection, onSave, onRemove, onClose }) {
  const [url, setUrl] = useState(initial || '');
  const [text, setText] = useState('');
  const submit = (e) => { e && e.preventDefault(); if (!url.trim()) return; onSave(url, text.trim()); onClose(); };
  return (
    <Modal title={initial ? tr('Edit link') : tr('Insert link')} onClose={onClose} width={440} footer={
      <>
        {onRemove && <button type="button" className="btn ghost danger-text" onClick={() => { onRemove(); onClose(); }}>{tr('Remove link')}</button>}
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>{tr('Cancel')}</button>
        <button type="button" className="btn primary" disabled={!url.trim()} onClick={submit}>{initial ? tr('Update') : tr('Insert')}</button>
      </>
    }>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>{tr('Web address')}</span>
          <input id="link-url" autoFocus dir="ltr" value={url} placeholder="https://example.com" onChange={(e) => setUrl(e.target.value)} />
        </label>
        {!hasSelection && !initial && (
          <label className="field">
            <span>{tr('Text to show')}</span>
            <input id="link-text" dir="auto" value={text} placeholder={tr('Leave empty to show the address')} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <button type="submit" hidden>{tr('Insert')}</button>
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
      <div className="unit-input"><input id={'m-' + k} type="number" min="0" max="8" step="0.1" inputMode="decimal" value={v[k]} onChange={(e) => set(k, e.target.value)} /><em>{tr('cm')}</em></div>
    </label>
  );
  return (
    <Modal title={tr('Custom margins')} onClose={onClose} width={420} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>{tr('Cancel')}</button>
        <button type="button" className="btn primary" disabled={!valid} onClick={save}>{tr('Apply')}</button>
      </>
    }>
      <div className="grid-2">
        {field('t', tr('Top'))}{field('b', tr('Bottom'))}{field('l', tr('Left'))}{field('r', tr('Right'))}
      </div>
      {!valid && <p className="error-text">{tr('Margins must be between 0 and 8 cm.')}</p>}
    </Modal>
  );
}
