import React, { useState, useRef, useEffect } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, Seg } from './ui.jsx';
import { FONTS, LINE_SPACINGS, PARA_SPACINGS, TEXT_COLORS, HIGHLIGHTS, PAGE_SIZES, MARGIN_PRESETS, fontByStack } from '../constants.js';
import { TEMPLATES } from '../templates.js';
import { tr } from '../i18n.js';

const nd = (e) => e.preventDefault();

function Key({ icon, label, onClick, active, disabled, children, className }) {
  return (
    <button type="button" className={'mk' + (active ? ' on' : '') + (className ? ' ' + className : '')} aria-label={label} title={label}
      aria-pressed={active === undefined ? undefined : !!active} disabled={disabled} onMouseDown={nd} onClick={onClick}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}

function Tile({ icon, label, onClick, active, danger }) {
  return (
    <button type="button" className={'mtile' + (active ? ' on' : '') + (danger ? ' danger' : '')} onMouseDown={nd} onClick={onClick}>
      <Icon name={icon} size={22} stroke={1.6} />
      <span>{label}</span>
    </button>
  );
}

function Row({ icon, label, value, onClick, chevron = true, danger, children }) {
  return (
    <button type="button" className={'mrow' + (danger ? ' danger' : '')} onMouseDown={nd} onClick={onClick}>
      {icon && <span className="mrow-ico"><Icon name={icon} size={19} /></span>}
      <span className="mrow-label">{label}</span>
      {value != null && <span className="mrow-val">{value}</span>}
      {children}
      {chevron && <Icon name="ChevronRight" size={16} className="mrow-chev" />}
    </button>
  );
}

function Toggle({ label, icon, checked, onChange, hint }) {
  return (
    <label className="mrow toggle">
      {icon && <span className="mrow-ico"><Icon name={icon} size={19} /></span>}
      <span className="mrow-label">{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" className="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const Section = ({ title, children }) => (
  <section className="msec">
    {title && <h3>{title}</h3>}
    {children}
  </section>
);

function Chips({ items, value, onPick, label }) {
  return (
    <div className="mchips" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button type="button" key={String(it.value)} role="radio" aria-checked={it.active !== undefined ? it.active : value === it.value}
          className={'mchip' + ((it.active !== undefined ? it.active : value === it.value) ? ' on' : '')} onMouseDown={nd} onClick={() => onPick(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onPick, noneLabel, noneIcon }) {
  const cur = value && !Array.isArray(value) ? String(value).toLowerCase() : null;
  return (
    <div className="mswatches">
      <button type="button" className={'msw none' + (!cur ? ' on' : '')} aria-label={noneLabel} title={noneLabel} onMouseDown={nd} onClick={() => onPick(false)}>
        <Icon name={noneIcon} size={16} />
      </button>
      {colors.map((c) => (
        <button type="button" key={c} className={'msw' + (cur === c.toLowerCase() ? ' on' : '')} style={{ background: c }} aria-label={c} onMouseDown={nd} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

function Stepper({ value, onChange, min, max, step = 1, unit, label }) {
  return (
    <div className="mstep" role="group" aria-label={label}>
      <button type="button" aria-label={tr('Decrease {0}', label)} onMouseDown={nd} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}><Icon name="Minus" size={18} /></button>
      <span className="tnum">{value}{unit && <small>{unit}</small>}</span>
      <button type="button" aria-label={tr('Increase {0}', label)} onMouseDown={nd} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}><Icon name="Plus" size={18} /></button>
    </div>
  );
}

function FontList({ value, onPick }) {
  const cur = fontByStack(value);
  return [tr('Latin'), tr('System'), tr('Arabic')].map((g) => (
    <Section key={g} title={g === 'Arabic' ? tr('Arabic · عربي') : g === 'System' ? tr('Installed on most devices') : tr('Latin')}>
      <div className="mlist">
        {FONTS.filter((f) => f.group === g).map((f) => (
          <button type="button" key={f.name} className={'mrow font' + (cur && cur.name === f.name ? ' on' : '')} onMouseDown={nd} onClick={() => onPick(f.stack)}>
            <span className="mrow-label" style={{ fontFamily: f.stack }}>{f.name}</span>
            {f.ar && <span className="mrow-val ar" style={{ fontFamily: f.stack }}>{f.ar}</span>}
            {cur && cur.name === f.name && <Icon name="Check" size={18} />}
          </button>
        ))}
      </div>
    </Section>
  ));
}

const SYMBOLS = ['،', '؛', '؟', '«', '»', '٪', '—', '–', '…', '•', '©', '®', '™', '°', '±', '×', '÷', '≠', '≤', '≥', '→', '←', '✓', '★', '§', '¶', '€', '£', '$', '¥'];

/* ---------------- toolbar ---------------- */

export function MobileToolbar({ ed, open, hidden, setHidden }) {
  const f = ed.formats;
  const dirOf = f._dir || (ed.settings.dir === 'rtl' ? 'rtl' : 'ltr');
  const startSide = dirOf === 'rtl' ? 'right' : 'left';
  const curAlign = f.align || startSide;
  const order = ['left', 'center', 'right', 'justify'];
  const alignIcon = { left: 'AlignLeft', center: 'AlignCenter', right: 'AlignRight', justify: 'AlignJustify' }[curAlign];
  const cycleAlign = () => {
    const next = order[(order.indexOf(curAlign) + 1) % order.length];
    ed.fmt('align', next === startSide ? false : next);
  };
  if (hidden) {
    return (
      <div className="mfab-wrap">
        <button type="button" className="mfab-mini" aria-label={tr('Show formatting toolbar')} onMouseDown={nd} onClick={() => setHidden(false)}><Icon name="ChevronUp" size={18} /></button>
        <button type="button" className="mfab" aria-label={tr('Formatting')} onMouseDown={nd} onClick={() => open('format')}><Icon name="Type" size={22} /></button>
      </div>
    );
  }
  return (
    <div className="mbar" role="toolbar" aria-label={tr('Formatting')}>
      <div className="mbar-scroll">
        <Key icon="Type" label={tr('Formatting')} className="accent" onClick={() => open('format')} />
        <Key icon="Bold" label={tr('Bold')} active={!!f.bold} onClick={() => ed.toggle('bold')} />
        <Key icon="Italic" label={tr('Italic')} active={!!f.italic} onClick={() => ed.toggle('italic')} />
        <Key icon="Underline" label={tr('Underline')} active={!!f.underline} onClick={() => ed.toggle('underline')} />
        <Key icon="List" label={tr('Bulleted list')} active={f.list === 'bullet'} onClick={() => ed.fmt('list', f.list === 'bullet' ? false : 'bullet')} />
        <Key icon="ListOrdered" label={tr('Numbered list')} active={f.list === 'ordered'} onClick={() => ed.fmt('list', f.list === 'ordered' ? false : 'ordered')} />
        <Key icon={alignIcon} label={tr('Alignment: ') + curAlign} onClick={cycleAlign} />
        <Key icon="Plus" label={tr('Insert')} onClick={() => open('insert')} />
        <Key icon="Sparkles" label={tr('Writing assistant')} onClick={() => ed.openPanel('ai')} />
        <Key icon="Mic" label={ed.listening ? tr('Stop voice typing') : tr('Voice typing')} active={!!ed.listening} onClick={() => (ed.listening ? ed.stopDictation() : ed.startDictation())} />
        {ed.inTable && <Key icon="Table" label={tr('Table tools')} className="ctx" onClick={() => open('table')} />}
        {ed.imgSel && <Key icon="Image" label={tr('Picture tools')} className="ctx" onClick={() => open('picture')} />}
        <Key icon="Undo2" label={tr('Undo')} disabled={!ed.hist.undo} onClick={ed.undo} />
        <Key icon="Redo2" label={tr('Redo')} disabled={!ed.hist.redo} onClick={ed.redo} />
      </div>
      <Key icon="ChevronDown" label={tr('Hide toolbar')} className="hide-btn" onClick={() => setHidden(true)} />
    </div>
  );
}

/* ---------------- sheets ---------------- */

export function MobileSheets({ ed, sheet, setSheet, toolbarHidden, setToolbarHidden }) {
  const [page, setPage] = useState(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const imgInput = useRef(null);
  const replaceInput = useRef(null);
  const docxInput = useRef(null);
  useEffect(() => { setPage(null); }, [sheet]);
  const close = () => setSheet(null);
  const f = ed.formats;
  const s = ed.settings;
  const dirOf = f._dir || (s.dir === 'rtl' ? 'rtl' : 'ltr');
  const startSide = dirOf === 'rtl' ? 'right' : 'left';
  const alignVal = f.align || startSide;
  const setAlign = (v) => ed.fmt('align', v === startSide ? false : v);
  const size = ed.currentSize();
  const lh = parseFloat(f.lineheight) || s.lineHeight;
  const styleKey = f.blockquote ? 'quote' : f.header ? 'h' + f.header : 'normal';
  const pn = s.pageNumbers;
  const back = (label) => (
    <button type="button" data-back className="tb" aria-label={tr('Back to {0}', label)} onMouseDown={nd} onClick={() => setPage(null)}><Icon name="ArrowLeft" size={20} /></button>
  );
  const run = (fn) => () => { close(); setTimeout(fn, 220); };

  let title = '';
  let body = null;
  let actions = null;

  if (sheet === 'format') {
    if (page === 'font' || page === 'default-font') {
      title = page === 'font' ? tr('Font') : tr('Default font');
      actions = back('formatting');
      body = <FontList value={page === 'font' ? (f.font && !Array.isArray(f.font) ? f.font : s.font) : s.font}
        onPick={(v) => { if (page === 'font') ed.fmt('font', v); else ed.setSettings({ font: v }); setPage(null); }} />;
    } else {
      title = tr('Formatting');
      body = (
        <>
          <div className="mkeys">
            <Key icon="Bold" label={tr('Bold')} active={!!f.bold} onClick={() => ed.toggle('bold')} />
            <Key icon="Italic" label={tr('Italic')} active={!!f.italic} onClick={() => ed.toggle('italic')} />
            <Key icon="Underline" label={tr('Underline')} active={!!f.underline} onClick={() => ed.toggle('underline')} />
            <Key icon="Strikethrough" label={tr('Strikethrough')} active={!!f.strike} onClick={() => ed.toggle('strike')} />
            <Key icon="Subscript" label={tr('Subscript')} active={f.script === 'sub'} onClick={() => ed.fmt('script', f.script === 'sub' ? false : 'sub')} />
            <Key icon="Superscript" label={tr('Superscript')} active={f.script === 'super'} onClick={() => ed.fmt('script', f.script === 'super' ? false : 'super')} />
            <Key icon="RemoveFormatting" label={tr('Clear formatting')} onClick={ed.clearFormatting} />
          </div>
          <Section title={tr('Style')}>
            <Chips label={tr('Paragraph style')} value={styleKey} onPick={(k) => ed.applyStyle(k)} items={[
              { value: 'normal', label: tr('Normal') }, { value: 'h1', label: tr('Heading 1') }, { value: 'h2', label: tr('Heading 2') }, { value: 'h3', label: tr('Heading 3') }, { value: 'quote', label: tr('Quote') },
            ]} />
          </Section>
          <Section title={tr('Font')}>
            <div className="mlist">
              <Row icon="Type" label={tr('Font')} value={fontByStack(f.font && !Array.isArray(f.font) ? f.font : s.font).name} onClick={() => setPage('font')} />
            </div>
            <div className="mline">
              <span className="mline-label">{tr('Size')}</span>
              <Stepper label={tr('font size')} value={size} min={6} max={96} step={size >= 24 ? 4 : size >= 14 ? 2 : 1} unit=" pt" onChange={(v) => ed.setFontSize(v)} />
            </div>
            <Chips label={tr('Font size')} value={size} onPick={(v) => ed.setFontSize(v)} items={[10, 11, 12, 14, 16, 18, 24, 32].map((v) => ({ value: v, label: String(v) }))} />
          </Section>
          <Section title={tr('Text colour')}>
            <Swatches colors={TEXT_COLORS} value={f.color} noneLabel={tr('Automatic')} noneIcon="RotateCcw" onPick={(c) => ed.fmt('color', c)} />
          </Section>
          <Section title={tr('Highlight')}>
            <Swatches colors={[...HIGHLIGHTS, ...(ed.customHL || [])]} value={f.background} noneLabel={tr('No highlight')} noneIcon="Ban" onPick={(c) => ed.fmt('background', c)} />
          </Section>
          <Section title={tr('Alignment & direction')}>
            <div className="mline">
              <Seg label={tr('Alignment')} value={alignVal} onChange={setAlign} options={[
                { value: 'left', icon: 'AlignLeft', title: tr('Left') }, { value: 'center', icon: 'AlignCenter', title: tr('Center') }, { value: 'right', icon: 'AlignRight', title: tr('Right') }, { value: 'justify', icon: 'AlignJustify', title: tr('Justify') },
              ]} />
            </div>
            <div className="mline">
              <Seg label={tr('Paragraph direction')} value={f.dir === 'rtl' || f.dir === 'ltr' ? f.dir : 'auto'} onChange={(v) => ed.fmt('dir', v)} options={[
                { value: 'auto', label: tr('Auto') }, { value: 'rtl', label: tr('RTL ←'), title: tr('Right to left') }, { value: 'ltr', label: tr('LTR →'), title: tr('Left to right') },
              ]} />
            </div>
          </Section>
          <Section title={tr('Lists & indent')}>
            <div className="mkeys">
              <Key icon="List" label={tr('Bulleted list')} active={f.list === 'bullet'} onClick={() => ed.fmt('list', f.list === 'bullet' ? false : 'bullet')} />
              <Key icon="ListOrdered" label={tr('Numbered list')} active={f.list === 'ordered'} onClick={() => ed.fmt('list', f.list === 'ordered' ? false : 'ordered')} />
              <Key icon={dirOf === 'rtl' ? 'IndentIncrease' : 'IndentDecrease'} label={tr('Decrease indent')} disabled={!f.indent} onClick={() => ed.fmt('indent', '-1')} />
              <Key icon={dirOf === 'rtl' ? 'IndentDecrease' : 'IndentIncrease'} label={tr('Increase indent')} onClick={() => ed.fmt('indent', '+1')} />
            </div>
          </Section>
          <Section title={tr('Line spacing')}>
            <Chips label={tr('Line spacing')} onPick={(v) => ed.fmt('lineheight', String(v))} items={LINE_SPACINGS.map((v) => ({ value: v, label: String(v), active: Math.abs(lh - v) < 0.01 }))} />
          </Section>
          <Section>
            <div className="mlist">
              <Row icon="Pilcrow" label={tr('Paragraph…')} value={tr('Indents, shading, borders')} onClick={run(() => ed.openPanel('paragraph'))} />
              <Row icon="ListTodo" label={tr('Checklist')} chevron={false} onClick={() => ed.fmt('list', f.list === 'unchecked' || f.list === 'checked' ? false : 'unchecked')} />
            </div>
          </Section>
          <Section title={tr('Paragraph spacing')}>
            <Chips label={tr('Paragraph spacing')} onPick={(label) => {
              const p = PARA_SPACINGS.find((x) => x.label === label);
              ed.fmt('spacebefore', p.before ? p.before + 'px' : false); ed.fmt('spaceafter', p.after ? p.after + 'px' : false);
            }} items={PARA_SPACINGS.map((p) => ({ value: p.label, label: p.label, active: (parseFloat(f.spacebefore) || 0) === p.before && (parseFloat(f.spaceafter) || 0) === p.after }))} />
          </Section>
          <Section>
            <div className="mlist">
              <Toggle icon="PanelBottom" label={tr('Show formatting toolbar')} checked={!toolbarHidden} onChange={(v) => setToolbarHidden(!v)} />
            </div>
          </Section>
        </>
      );
    }
  } else if (sheet === 'insert') {
    if (page === 'table') {
      title = tr('Insert table'); actions = back('insert');
      body = (
        <Section>
          <div className="mline"><span className="mline-label">{tr('Rows')}</span><Stepper label="rows" value={rows} min={1} max={50} onChange={setRows} /></div>
          <div className="mline"><span className="mline-label">{tr('Columns')}</span><Stepper label="columns" value={cols} min={1} max={12} onChange={setCols} /></div>
          <div className="tprev" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: Math.min(rows, 8) * cols }, (_, i) => <span key={i} />)}
          </div>
          <button type="button" className="btn primary block" onMouseDown={nd} onClick={run(() => ed.insertTable(rows, cols))}>{tr('Insert {0} × {1} table', rows, cols)}</button>
        </Section>
      );
    } else if (page === 'symbol') {
      title = tr('Symbol'); actions = back('insert');
      body = <div className="msym">{SYMBOLS.map((c) => <button type="button" key={c} onMouseDown={nd} onClick={() => { ed.insertText(c); close(); }}>{c}</button>)}</div>;
    } else if (page === 'pn') {
      title = tr('Page numbers'); actions = back('insert');
      body = (
        <>
          <div className="mlist"><Toggle icon="Hash" label={tr('Show page numbers')} checked={pn.on} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: v } })} /></div>
          <Section title={tr('Position')}><Seg label={tr('Position')} value={pn.where} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, where: v } })} options={[{ value: 'header', label: tr('Top') }, { value: 'footer', label: tr('Bottom') }]} /></Section>
          <Section title={tr('Alignment')}><Seg label={tr('Alignment')} value={pn.align} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, align: v } })} options={[{ value: 'left', icon: 'AlignLeft', title: tr('Left') }, { value: 'center', icon: 'AlignCenter', title: tr('Center') }, { value: 'right', icon: 'AlignRight', title: tr('Right') }]} /></Section>
          <Section title={tr('Format')}>
            <Chips label={tr('Format')} value={pn.format} onPick={(k) => ed.setSettings({ pageNumbers: { ...pn, on: true, format: k } })}
              items={[['n', '1, 2, 3'], ['pageof', tr('Page 1 of 3')], ['slash', '1 / 3'], ['dash', '— 1 —'], ['ar', 'صفحة 1 من 3']].map(([v, l]) => ({ value: v, label: l }))} />
          </Section>
          {ed.viewMode !== 'print' && <p className="mnote">{tr('Page numbers appear in Page view and in exports.')}</p>}
        </>
      );
    } else {
      title = tr('Insert');
      body = (
        <>
          <div className="mtiles">
            <Tile icon="ImagePlus" label={tr('Picture')} onClick={() => imgInput.current && imgInput.current.click()} />
            <Tile icon="Table" label={tr('Table')} onClick={() => setPage('table')} />
            <Tile icon="SeparatorHorizontal" label={tr('Page break')} onClick={run(ed.insertPageBreak)} />
            <Tile icon="Minus" label={tr('Line')} onClick={run(ed.insertDivider)} />
            <Tile icon="Link" label={tr('Link')} active={!!f.link} onClick={run(() => ed.openDialog('link'))} />
            <Tile icon="CalendarDays" label={tr('Date')} onClick={() => { ed.insertDate(); close(); }} />
            <Tile icon="Omega" label={tr('Symbol')} onClick={() => setPage('symbol')} />
            <Tile icon="PanelTop" label={tr('Header')} onClick={run(() => ed.openDialog('hf', { focus: 'header' }))} />
            <Tile icon="PanelBottom" label={tr('Footer')} onClick={run(() => ed.openDialog('hf', { focus: 'footer' }))} />
            <Tile icon="Hash" label={tr('Page numbers')} active={pn.on} onClick={() => setPage('pn')} />
            <Tile icon="Sigma" label={tr('Equation')} onClick={run(ed.openEquation)} />
            <Tile icon="PenTool" label={tr('Drawing')} onClick={run(ed.openDrawing)} />
            <Tile icon="BookOpen" label={tr('Cover page')} onClick={run(ed.openCover)} />
            <Tile icon="ListTree" label={tr('Contents')} onClick={run(ed.updateTOC)} />
            <Tile icon="Superscript" label={tr('Footnote')} onClick={run(ed.openFootnote)} />
            <Tile icon="Quote" label={tr('Citation')} onClick={run(() => ed.openPanel('sources'))} />
          </div>
          <input ref={imgInput} id="m-insert-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; close(); ed.insertImageFile(fl); }} />
        </>
      );
    }
  } else if (sheet === 'table') {
    title = tr('Table');
    body = (
      <>
        <Section title={tr('Rows')}>
          <div className="mtiles three">
            <Tile icon="ArrowUpToLine" label={tr('Insert above')} onClick={() => ed.tableOp('insertRowAbove')} />
            <Tile icon="ArrowDownToLine" label={tr('Insert below')} onClick={() => ed.tableOp('insertRowBelow')} />
            <Tile icon="Rows2" label={tr('Delete row')} onClick={() => ed.tableOp('deleteRow')} />
          </div>
        </Section>
        <Section title={tr('Columns')}>
          <div className="mtiles three">
            <Tile icon="ArrowLeftToLine" label={tr('Insert left')} onClick={() => ed.tableOp('insertColumnLeft')} />
            <Tile icon="ArrowRightToLine" label={tr('Insert right')} onClick={() => ed.tableOp('insertColumnRight')} />
            <Tile icon="Columns2" label={tr('Delete column')} onClick={() => ed.tableOp('deleteColumn')} />
          </div>
        </Section>
        <Section title={tr('Cell shading')}>
          <div className="mchips">{[['', tr('None')], ['gray', tr('Gray')], ['blue', tr('Blue')], ['green', tr('Green')], ['yellow', tr('Yellow')], ['red', tr('Red')], ['purple', tr('Purple')]].map(([k, l]) => (
            <button type="button" key={l} className={'mchip shade-chip' + ((f.shade || '') === k ? ' on' : '')} onMouseDown={nd} onClick={() => ed.fmt('shade', k || false)}><i className={'ql-shade-' + (k || 'none')} />{l}</button>
          ))}</div>
        </Section>
        <Section title={tr('Table style')}>
          <Seg label={tr('Table style')} value={s.tableStyle || 'grid'} onChange={(v) => ed.setSettings({ tableStyle: v })} options={[{ value: 'grid', label: tr('Grid') }, { value: 'striped', label: tr('Striped') }, { value: 'minimal', label: tr('Minimal') }]} />
          <div className="mlist"><Toggle icon="Heading" label={tr('Emphasise header row')} checked={s.tableHeader !== false} onChange={(v) => ed.setSettings({ tableHeader: v })} /></div>
        </Section>
        <div className="mlist"><Row icon="Trash2" label={tr('Delete table')} danger chevron={false} onClick={run(() => ed.tableOp('deleteTable'))} /></div>
      </>
    );
  } else if (sheet === 'picture' && ed.imgSel) {
    title = tr('Picture');
    body = (
      <>
        <Section title={tr('Width')}>
          <Chips label={tr('Width')} value={ed.imgSel.width || 'orig'} onPick={(v) => ed.imageWidth(v === 'orig' ? false : v)}
            items={[{ value: '25%', label: '25%' }, { value: '50%', label: '50%' }, { value: '75%', label: '75%' }, { value: '100%', label: tr('Full') }, { value: 'orig', label: tr('Original') }]} />
        </Section>
        <Section title={tr('Position')}>
          <Seg label={tr('Picture position')} value={alignVal === 'justify' ? startSide : alignVal} onChange={setAlign} options={[{ value: 'left', icon: 'AlignLeft', title: tr('Left') }, { value: 'center', icon: 'AlignCenter', title: tr('Center') }, { value: 'right', icon: 'AlignRight', title: tr('Right') }]} />
        </Section>
        <div className="mlist">
          {ed.imgKind === 'equation' && <Row icon="Sigma" label={tr('Edit equation')} onClick={run(ed.editImageSpecial)} />}
          {ed.imgKind === 'drawing' && <Row icon="PenTool" label={tr('Edit drawing')} onClick={run(ed.editImageSpecial)} />}
          {ed.imgKind === 'image' && <Row icon="Captions" label={tr('Alternative text')} onClick={run(() => ed.openDialog('alt'))} />}
          <Row icon="ImageUp" label={tr('Replace picture')} onClick={() => replaceInput.current && replaceInput.current.click()} />
          <Row icon="Trash2" label={tr('Delete picture')} danger chevron={false} onClick={() => { close(); ed.deleteImage(); }} />
        </div>
        <input ref={replaceInput} id="m-replace-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; const idx = ed.imgSel.index; close(); ed.insertImageFile(fl, idx); }} />
      </>
    );
  } else if (sheet === 'more') {
    if (page === 'default-font') {
      title = tr('Default font'); actions = back('document');
      body = <FontList value={s.font} onPick={(v) => { ed.setSettings({ font: v }); setPage(null); }} />;
    } else if (page === 'template') {
      title = tr('New from template'); actions = back('menu');
      body = (
        <div className="mlist">
          {TEMPLATES.map((t) => <Row key={t.id} icon="FileText" label={<span dir="auto">{t.name}</span>} value={t.lang} onClick={run(() => ed.newDoc(t.id))} />)}
        </div>
      );
    } else {
      title = tr('Document');
      body = (
        <>
          <Section title={tr('Tools')}>
            <div className="mtiles five">
              <Tile icon="Sparkles" label={tr('Assistant')} onClick={run(() => ed.openPanel('ai'))} />
              <Tile icon="MessagesSquare" label={tr('Ask doc')} onClick={run(ed.askDocument)} />
              <Tile icon="BookOpenText" label={tr('Read')} onClick={run(ed.openReader)} />
              <Tile icon="Maximize2" label={tr('Focus')} onClick={run(() => ed.setFocusMode(true))} />
              <Tile icon="History" label={tr('Versions')} onClick={run(() => ed.openPanel('versions'))} />
            </div>
          </Section>
          <Section title={tr('References')}>
            <div className="mlist">
              <Row icon="ListTree" label={tr('Table of contents')} value={tr('Insert or update')} onClick={run(ed.updateTOC)} />
              <Row icon="Superscript" label={tr('Footnote')} onClick={run(ed.openFootnote)} />
              <Row icon="Quote" label={tr('Citations & sources')} value={((s.refs || {}).items || []).length + ' sources'} onClick={run(() => ed.openPanel('sources'))} />
              <Row icon="BookMarked" label={tr('Bibliography')} value={tr('Insert or update')} onClick={run(ed.insertBibliography)} />
            </div>
          </Section>
          <Section title={tr('View')}>
            <Seg label={tr('View')} value={ed.viewMode} onChange={(v) => ed.setViewMode(v)} options={[{ value: 'mobile', label: tr('Mobile'), icon: 'Smartphone' }, { value: 'print', label: tr('Pages'), icon: 'Files' }, { value: 'web', label: tr('Continuous'), icon: 'ScrollText' }]} />
            <div className="mlist">
              {ed.viewMode !== 'mobile' && <Row icon="MoveHorizontal" label={tr('Fit page to screen')} chevron={false} onClick={() => { ed.setFit(true); close(); }} />}
              <Toggle icon="FileText" label={tr('Dark paper')} hint={tr('Exports always stay white')} checked={ed.darkPaper} onChange={ed.setDarkPaper} />
              <Toggle icon="PanelBottom" label={tr('Formatting toolbar')} checked={!toolbarHidden} onChange={(v) => setToolbarHidden(!v)} />
            </div>
          </Section>
          <Section title={tr('Appearance')}>
            <Seg label={tr('Theme')} value={ed.themeMode} onChange={ed.setThemeMode} options={[{ value: 'system', label: tr('System') }, { value: 'light', label: tr('Light'), icon: 'Sun' }, { value: 'dark', label: tr('Dark'), icon: 'Moon' }]} />
          </Section>
          <Section title={tr('Review')}>
            <div className="mlist">
              <Row icon="Search" label="Find & replace" onClick={run(() => ed.openFind('find'))} />
              <Row icon="Sigma" label={tr('Word count')} value={`${ed.stats.words.toLocaleString()} words`} onClick={run(() => ed.openDialog('count'))} />
              <Toggle icon="SpellCheck" label={tr('Spell check')} checked={s.spellcheck} onChange={(v) => ed.setSettings({ spellcheck: v })} />
              <Row icon="WandSparkles" label={tr('Auto direction for all paragraphs')} chevron={false} onClick={() => { ed.autoDirection(); close(); }} />
            </div>
            <Seg label={tr('Proofing language')} value={s.lang} onChange={(v) => ed.setSettings({ lang: v })} options={[{ value: 'auto', label: tr('Auto') }, { value: 'en', label: tr('English') }, { value: 'ar', label: 'العربية' }]} />
          </Section>
          <Section title={tr('Page setup')}>
            <Chips label={tr('Page size')} value={s.size} onPick={(v) => ed.setSettings({ size: v })} items={Object.entries(PAGE_SIZES).map(([k, p]) => ({ value: k, label: p.label }))} />
            <Seg label={tr('Orientation')} value={s.orientation} onChange={(v) => ed.setSettings({ orientation: v })} options={[{ value: 'portrait', label: tr('Portrait'), icon: 'RectangleVertical' }, { value: 'landscape', label: tr('Landscape'), icon: 'RectangleHorizontal' }]} />
            <Chips label={tr('Margins')} value={s.marginPreset} onPick={(k) => { if (k === 'custom') { close(); setTimeout(() => ed.openDialog('margins'), 220); return; } const p = MARGIN_PRESETS[k]; ed.setSettings({ marginPreset: k, margins: { t: p.t, b: p.b, l: p.l, r: p.r } }); }}
              items={[...Object.entries(MARGIN_PRESETS).map(([k, p]) => ({ value: k, label: p.label })), { value: 'custom', label: tr('Custom…') }]} />
          </Section>
          <Section title={tr('Document defaults')}>
            <Seg label={tr('Document direction')} value={s.dir} onChange={(v) => ed.setSettings({ dir: v })} options={[{ value: 'ltr', label: tr('Left to right') }, { value: 'rtl', label: tr('Right to left') }]} />
            <div className="mlist"><Row icon="Type" label={tr('Default font')} value={fontByStack(s.font).name} onClick={() => setPage('default-font')} /></div>
            <div className="mline"><span className="mline-label">{tr('Default size')}</span><Stepper label={tr('default size')} value={s.fontSize} min={6} max={48} step={1} unit=" pt" onChange={(v) => ed.setSettings({ fontSize: v })} /></div>
            <Chips label={tr('Default line spacing')} onPick={(v) => ed.setSettings({ lineHeight: v })} items={[1, 1.15, 1.4, 1.5, 1.8, 2].map((v) => ({ value: v, label: String(v), active: s.lineHeight === v }))} />
          </Section>
          <Section title={tr('Export')}>
            <div className="mtiles">
              <Tile icon="FileText" label="PDF" onClick={run(() => ed.runExport('pdf'))} />
              <Tile icon="FileType" label={tr('Word')} onClick={run(() => ed.runExport('docx'))} />
              <Tile icon="Globe" label="HTML" onClick={run(() => ed.runExport('html'))} />
              <Tile icon="AlignLeft" label={tr('Text')} onClick={run(() => ed.runExport('txt'))} />
            </div>
          </Section>
          <Section title={tr('File')}>
            <div className="mlist">
              <Row icon="Pencil" label={tr('Rename')} onClick={run(ed.rename)} />
              <Row icon="Copy" label={tr('Duplicate')} onClick={run(ed.duplicate)} />
              <Row icon="Share2" label={tr('Share')} onClick={run(ed.share)} />
              <Row icon="LayoutTemplate" label={tr('Save as template')} onClick={run(ed.saveTemplate)} />
              <Toggle icon="Lock" label={tr('Lock editing')} hint={tr('Prevent accidental changes')} checked={ed.readOnly} onChange={() => ed.toggleReadOnly()} />
              <Row icon="KeyRound" label={ed.locked ? tr('Remove password') : tr('Protect with password')} onClick={run(ed.openPassword)} />
              <Row icon="FilePlus2" label={tr('New blank document')} onClick={run(() => ed.newDoc('blank'))} />
              <Row icon="FilePlus2" label={tr('New right-to-left document')} onClick={run(() => ed.newDoc('blank-ar'))} />
              <Row icon="LayoutTemplate" label={tr('New from template')} onClick={() => setPage('template')} />
              <Row icon="FileUp" label={tr('Import .docx or .txt')} onClick={() => docxInput.current && docxInput.current.click()} />
              <Row icon="Trash2" label={tr('Delete document')} danger chevron={false} onClick={run(ed.del)} />
            </div>
            <input ref={docxInput} id="m-import-docx" type="file" accept=".docx,.txt,text/plain" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; close(); ed.importInto(fl); }} />
          </Section>
        </>
      );
    }
  }

  // keep the last content while the sheet animates closed
  const last = useRef({ title: '', body: null, actions: null, kind: '' });
  if (sheet && body) last.current = { title, body, actions, kind: sheet };
  const v = last.current;
  return (
    <Sheet open={!!sheet && !!body} onClose={close} title={v.title} actions={v.actions} className={'sheet-' + v.kind}>
      {v.body}
    </Sheet>
  );
}
