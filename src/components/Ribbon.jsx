import React, { useState, useRef } from '../react.js';
import { Icon } from '../icons.jsx';
import { TB, Group, Drop, MenuItem, Seg } from './ui.jsx';
import { FONTS, SIZES, LINE_SPACINGS, PARA_SPACINGS, TEXT_COLORS, HIGHLIGHTS, PAGE_SIZES, MARGIN_PRESETS, fontByStack } from '../constants.js';
import { TEMPLATES } from '../templates.js';
import { tr, trn } from '../i18n.js';

const TABS = [
  { id: 'file', label: tr('File') },
  { id: 'home', label: tr('Home') },
  { id: 'insert', label: tr('Insert') },
  { id: 'references', label: tr('References') },
  { id: 'layout', label: tr('Layout') },
  { id: 'review', label: tr('Review') },
  { id: 'view', label: tr('View') },
];

function Big({ icon, label, onClick, active, disabled, title }) {
  return (
    <button type="button" className={'big' + (active ? ' on' : '')} disabled={disabled} title={title || label} aria-pressed={active === undefined ? undefined : !!active}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={22} stroke={1.6} />
      <span>{label}</span>
    </button>
  );
}

function FontPicker({ value, onPick, label = tr('Font') }) {
  const cur = fontByStack(value);
  const groups = [tr('Latin'), tr('System'), tr('Arabic')];
  return (
    <Drop label={label} className="combo font-combo" width={260} trigger={<><span className="combo-val" style={{ fontFamily: value }}>{cur ? cur.name : tr('Mixed')}</span><Icon name="ChevronDown" size={14} /></>}>
      {(close) => groups.map((g) => (
        <div key={g} className="font-group">
          <div className="pop-label">{g === 'Arabic' ? tr('Arabic · عربي') : g === 'System' ? tr('Installed on most computers') : tr('Latin')}</div>
          {FONTS.filter((f) => f.group === g).map((f) => (
            <button type="button" key={f.name} className={'mi font-mi' + (cur && cur.name === f.name ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(f.stack); }}>
              <span className="mi-text" style={{ fontFamily: f.stack }}>{f.name}</span>
              {f.ar && <span className="mi-hint ar" style={{ fontFamily: f.stack }}>{f.ar}</span>}
            </button>
          ))}
        </div>
      ))}
    </Drop>
  );
}

function SizePicker({ value, onPick, label = tr('Font size') }) {
  const [custom, setCustom] = useState('');
  const shown = value ? (Math.round(value * 2) / 2) : '';
  return (
    <Drop label={label} className="combo size-combo" width={150} trigger={<><span className="combo-val">{shown || '—'}</span><Icon name="ChevronDown" size={14} /></>}>
      {(close) => (
        <>
          <form className="pop-form" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(custom); if (n >= 1 && n <= 400) { close(); onPick(n); } }}>
            <input id="size-custom" type="number" min="1" max="400" step="0.5" inputMode="decimal" placeholder={tr('Custom')} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={tr('Custom font size in points')} />
          </form>
          <div className="size-list">
            {SIZES.map((s) => (
              <button type="button" key={s} className={'mi' + (Math.abs(s - value) < 0.01 ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(s); }}>
                <span className="mi-text tnum">{s}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Drop>
  );
}

function ColorPicker({ icon, label, value, colors, onPick, autoLabel }) {
  const swatch = value && !Array.isArray(value) ? value : null;
  return (
    <Drop label={label} className="color-combo" width={232} trigger={
      <span className="color-trigger"><Icon name={icon} size={18} /><span className="color-bar" style={{ background: swatch || (icon === 'Highlighter' ? '#FFE066' : 'currentColor') }} /></span>
    }>
      {(close) => (
        <div className="color-pop">
          <button type="button" className="mi" onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(false); }}>
            <span className="mi-ico"><Icon name={icon === 'Highlighter' ? 'Ban' : 'RotateCcw'} size={16} /></span><span className="mi-text">{autoLabel}</span>
          </button>
          <div className="swatches">
            {colors.map((c) => (
              <button type="button" key={c} className={'sw' + (swatch && swatch.toLowerCase() === c.toLowerCase() ? ' on' : '')} style={{ background: c }} aria-label={c} title={c}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(c); }} />
            ))}
          </div>
          <label className="custom-color">
            <span>{tr('Custom colour')}</span>
            <input id={'cc-' + icon} type="color" defaultValue={swatch && /^#[0-9a-f]{6}$/i.test(swatch) ? swatch : '#1D4ED8'} onChange={(e) => onPick(e.target.value)} />
          </label>
        </div>
      )}
    </Drop>
  );
}

function TableGrid({ onPick }) {
  const [hover, setHover] = useState([0, 0]);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const N = 8;
  return (
    <Drop label={tr('Insert table')} className="big-drop" width={236} trigger={<span className="big-inner"><Icon name="Table" size={22} stroke={1.6} /><span>{tr('Table')}</span></span>}>
      {(close) => (
        <div className="tgrid-pop">
          <div className="pop-label">{hover[0] ? tr('{0} × {1} table', hover[1], hover[0]) : tr('Choose a size')}</div>
          <div className="tgrid" onMouseLeave={() => setHover([0, 0])}>
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N) + 1;
              const c = (i % N) + 1;
              return (
                <button type="button" key={i} aria-label={tr('{0} columns by {1} rows', c, r)} className={'tcell' + (r <= hover[0] && c <= hover[1] ? ' on' : '')}
                  onMouseEnter={() => setHover([r, c])} onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(r, c); }} />
              );
            })}
          </div>
          <form className="tgrid-form" onSubmit={(e) => { e.preventDefault(); close(); onPick(Math.max(1, Math.min(50, rows)), Math.max(1, Math.min(12, cols))); }}>
            <label>{tr('Rows')}<input id="tbl-rows" type="number" min="1" max="50" value={rows} onChange={(e) => setRows(+e.target.value)} /></label>
            <label>{tr('Columns')}<input id="tbl-cols" type="number" min="1" max="12" value={cols} onChange={(e) => setCols(+e.target.value)} /></label>
            <button type="submit" className="btn primary sm">{tr('Insert')}</button>
          </form>
        </div>
      )}
    </Drop>
  );
}

const SYMBOLS = ['،', '؛', '؟', '«', '»', '٪', '—', '–', '…', '•', '©', '®', '™', '°', '±', '×', '÷', '≠', '≤', '≥', '→', '←', '✓', '★', '§', '¶', '€', '£', '$', '¥'];

function insertText(ed, text) {
  const q = ed.quill(); if (!q) return;
  const r = q.getSelection(true) || { index: q.getLength() - 1, length: 0 };
  if (r.length) q.deleteText(r.index, r.length, 'user');
  q.insertText(r.index, text, 'user');
  q.setSelection(r.index + text.length, 0, 'user');
}

export function Ribbon({ tab, setTab, ed }) {
  const f = ed.formats;
  const s = ed.settings;
  const imgInput = useRef(null);
  const replaceInput = useRef(null);
  const docxInput = useRef(null);
  const dirOf = f._dir || (s.dir === 'rtl' ? 'rtl' : 'ltr');
  const alignIs = (v) => f.align === v || (!f.align && ((v === 'left' && dirOf === 'ltr') || (v === 'right' && dirOf === 'rtl')));
  const setAlign = (v) => {
    // "start" alignment is stored as no value so it follows the paragraph direction
    const startSide = dirOf === 'rtl' ? 'right' : 'left';
    ed.fmt('align', v === startSide ? false : v);
  };
  const styleKey = f.blockquote ? 'quote' : f.header ? 'h' + f.header : 'normal';
  const lh = parseFloat(f.lineheight) || s.lineHeight;
  const tabs = [...TABS];
  if (ed.inTable) tabs.push({ id: 'table', label: tr('Table'), ctx: true });
  if (ed.imgSel) tabs.push({ id: 'picture', label: tr('Picture'), ctx: true });

  const fontSize = ed.currentSize();
  const pn = s.pageNumbers;

  const panels = {
    file: (
      <>
        <Group label={tr('New')}>
          <Big icon="FilePlus2" label={tr('Blank')} onClick={() => ed.newDoc('blank')} />
          <Big icon="FilePlus2" label={tr('Blank (RTL)')} onClick={() => ed.newDoc('blank-ar')} />
          <Drop label={tr('New from template')} className="big-drop" width={240} trigger={<span className="big-inner"><Icon name="LayoutTemplate" size={22} stroke={1.6} /><span>{tr('Template')}</span></span>}>
            {(close) => TEMPLATES.filter((t) => !t.id.startsWith('blank')).map((t) => (
              <MenuItem key={t.id} icon="FileText" hint={t.lang} onClick={() => { close(); ed.newDoc(t.id); }}><span dir="auto">{t.name}</span></MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label={tr('Document')}>
          <Big icon="LibraryBig" label={tr('All documents')} onClick={ed.onExit} />
          <Big icon="Pencil" label={tr('Rename')} onClick={ed.rename} />
          <Big icon="Copy" label={tr('Duplicate')} onClick={ed.duplicate} />
          <Big icon="FileUp" label={tr('Import .docx or .txt')} onClick={() => docxInput.current && docxInput.current.click()} />
          <Big icon="History" label={tr('Versions')} onClick={() => ed.openPanel('versions')} />
          <Big icon="LayoutTemplate" label={tr('Save as template')} onClick={ed.saveTemplate} />
          <input ref={docxInput} id="file-import-docx" type="file" accept=".docx,.txt,text/plain" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.importInto(fl); }} />
        </Group>
        <Group label={tr('Export')}>
          <Big icon="Share2" label={tr('Share')} onClick={ed.share} />
          <Big icon="FileText" label="PDF" onClick={() => ed.runExport('pdf')} />
          <Big icon="FileType" label={tr('Word')} onClick={() => ed.runExport('docx')} />
          <Big icon="Globe" label="HTML" onClick={() => ed.runExport('html')} />
          <Big icon="AlignLeft" label={tr('Text')} onClick={() => ed.runExport('txt')} />
        </Group>
        <Group label={tr('Remove')}>
          <Big icon="Trash2" label={tr('Delete')} onClick={ed.del} />
        </Group>
      </>
    ),
    home: (
      <>
        <Group label={tr('Font')} className="g-font">
          <div className="rg-rows">
            <div className="rg-row">
              <FontPicker value={f.font && !Array.isArray(f.font) ? f.font : s.font} onPick={(v) => ed.fmt('font', v)} />
              <SizePicker value={fontSize} onPick={ed.setFontSize} />
              <TB icon="AArrowUp" label={tr('Grow font')} onClick={() => ed.grow(1)} />
              <TB icon="AArrowDown" label={tr('Shrink font')} onClick={() => ed.grow(-1)} />
            </div>
            <div className="rg-row">
              <TB icon="Bold" label={tr('Bold')} kbd="Ctrl+B" active={!!f.bold} onClick={() => ed.toggle('bold')} />
              <TB icon="Italic" label={tr('Italic')} kbd="Ctrl+I" active={!!f.italic} onClick={() => ed.toggle('italic')} />
              <TB icon="Underline" label={tr('Underline')} kbd="Ctrl+U" active={!!f.underline} onClick={() => ed.toggle('underline')} />
              <TB icon="Strikethrough" label={tr('Strikethrough')} active={!!f.strike} onClick={() => ed.toggle('strike')} />
              <TB icon="Subscript" label={tr('Subscript')} active={f.script === 'sub'} onClick={() => ed.fmt('script', f.script === 'sub' ? false : 'sub')} />
              <TB icon="Superscript" label={tr('Superscript')} active={f.script === 'super'} onClick={() => ed.fmt('script', f.script === 'super' ? false : 'super')} />
              <ColorPicker icon="Baseline" label={tr('Text colour')} value={f.color} colors={TEXT_COLORS} autoLabel={tr('Automatic')} onPick={(c) => ed.fmt('color', c)} />
              <ColorPicker icon="Highlighter" label={tr('Highlight')} value={f.background} colors={[...HIGHLIGHTS, ...(ed.customHL || [])]} autoLabel={tr('No highlight')} onPick={(c) => { ed.fmt('background', c); if (c && !HIGHLIGHTS.includes(c) && !(ed.customHL || []).includes(c)) ed.addCustomHighlight(c); }} />
              <TB icon="RemoveFormatting" label={tr('Clear formatting')} onClick={ed.clearFormatting} />
            </div>
          </div>
        </Group>
        <Group label={tr('Paragraph')} className="g-para">
          <div className="rg-rows">
            <div className="rg-row">
              <TB icon="List" label={tr('Bulleted list')} active={f.list === 'bullet'} onClick={() => ed.fmt('list', f.list === 'bullet' ? false : 'bullet')} />
              <TB icon="ListOrdered" label={tr('Numbered list')} active={f.list === 'ordered'} onClick={() => ed.fmt('list', f.list === 'ordered' ? false : 'ordered')} />
              <TB icon={dirOf === 'rtl' ? 'IndentIncrease' : 'IndentDecrease'} label={tr('Decrease indent')} onClick={() => ed.fmt('indent', '-1')} disabled={!f.indent} />
              <TB icon={dirOf === 'rtl' ? 'IndentDecrease' : 'IndentIncrease'} label={tr('Increase indent')} onClick={() => ed.fmt('indent', '+1')} />
              <Drop label={tr('Line and paragraph spacing')} width={230} trigger={<><Icon name="ListCollapse" size={18} /><Icon name="ChevronDown" size={12} /></>}>
                {(close) => (
                  <>
                    <div className="pop-label">{tr('Line spacing')}</div>
                    {LINE_SPACINGS.map((v) => (
                      <MenuItem key={v} active={Math.abs(lh - v) < 0.01} onClick={() => { close(); ed.fmt('lineheight', String(v)); }}>{v.toFixed(v % 1 ? 2 : 1).replace(/0$/, '')}</MenuItem>
                    ))}
                    <div className="mi-sep" />
                    <div className="pop-label">{tr('Space between paragraphs')}</div>
                    {PARA_SPACINGS.map((p) => (
                      <MenuItem key={p.label} hint={`${p.before} / ${p.after} px`} active={parseFloat(f.spaceafter || 0) === p.after && parseFloat(f.spacebefore || 0) === p.before}
                        onClick={() => { close(); ed.fmt('spacebefore', p.before ? p.before + 'px' : false); ed.fmt('spaceafter', p.after ? p.after + 'px' : false); }}>{p.label}</MenuItem>
                    ))}
                  </>
                )}
              </Drop>
            </div>
            <div className="rg-row">
              <TB icon="AlignLeft" label={tr('Align left')} active={alignIs('left')} onClick={() => setAlign('left')} />
              <TB icon="AlignCenter" label={tr('Center')} kbd="Ctrl+E" active={alignIs('center')} onClick={() => setAlign('center')} />
              <TB icon="AlignRight" label={tr('Align right')} active={alignIs('right')} onClick={() => setAlign('right')} />
              <TB icon="AlignJustify" label={tr('Justify')} active={alignIs('justify')} onClick={() => setAlign('justify')} />
              <span className="rg-sep" />
              <TB icon="PilcrowRight" label={tr('Left-to-right paragraph')} active={f.dir === 'ltr'} onClick={() => ed.fmt('dir', f.dir === 'ltr' ? 'auto' : 'ltr')} />
              <TB icon="PilcrowLeft" label={tr('Right-to-left paragraph')} active={f.dir === 'rtl'} onClick={() => ed.fmt('dir', f.dir === 'rtl' ? 'auto' : 'rtl')} />
            </div>
          </div>
        </Group>
        <Group label={tr('Styles')} className="g-styles">
          <div className="styles">
            {[
              { k: 'normal', label: tr('Normal'), cls: 'st-n' },
              { k: 'h1', label: tr('Heading 1'), cls: 'st-h1' },
              { k: 'h2', label: tr('Heading 2'), cls: 'st-h2' },
              { k: 'h3', label: tr('Heading 3'), cls: 'st-h3' },
              { k: 'quote', label: tr('Quote'), cls: 'st-q' },
            ].map((x) => (
              <button type="button" key={x.k} className={'style-chip ' + x.cls + (styleKey === x.k ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => ed.applyStyle(x.k)}>
                <span className="style-sample">{tr('Aa')}</span><span className="style-name">{x.label}</span>
              </button>
            ))}
          </div>
        </Group>
        <Group label={tr('Editing')}>
          <Big icon="Search" label={tr('Find')} onClick={() => ed.openFind('find')} />
          <Big icon="Replace" label={tr('Replace')} onClick={() => ed.openFind('replace')} />
        </Group>
        <Group label={tr('Assistant')}>
          <Big icon="Sparkles" label={tr('AI assistant')} onClick={() => ed.openPanel('ai')} />
          <Big icon="Mic" label={ed.listening ? tr('Stop') : tr('Dictate')} active={!!ed.listening} onClick={() => (ed.listening ? ed.stopDictation() : ed.startDictation())} />
        </Group>
      </>
    ),
    references: (
      <>
        <Group label={tr('Contents')}>
          <Big icon="ListTree" label={tr('Table of contents')} title={tr('Insert or update the table of contents')} onClick={ed.updateTOC} />
        </Group>
        <Group label={tr('Footnotes')}>
          <Big icon="Superscript" label={tr('Footnote')} onClick={ed.openFootnote} />
        </Group>
        <Group label={tr('Citations')}>
          <Big icon="Quote" label={tr('Citation')} title={tr('Cite a source at the cursor')} onClick={() => ed.openPanel('sources')} />
          <Big icon="BookMarked" label={tr('Bibliography')} onClick={ed.insertBibliography} />
          <Drop label={tr('Citation style')} className="big-drop" width={180} trigger={<span className="big-inner"><Icon name="Type" size={22} stroke={1.6} /><span>{({ apa: 'APA', mla: 'MLA', ieee: 'IEEE' })[(s.refs || {}).style || 'apa']}</span></span>}>
            {(close) => [['apa', tr('APA 7')], ['mla', tr('MLA 9')], ['ieee', 'IEEE']].map(([k, l]) => (
              <MenuItem key={k} active={((s.refs || {}).style || 'apa') === k} onClick={() => { close(); ed.setRefs({ ...(s.refs || { items: [] }), style: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
        </Group>
      </>
    ),
    insert: (
      <>
        <Group label={tr('Pages')}>
          <Big icon="BookOpen" label={tr('Cover page')} onClick={ed.openCover} />
          <Big icon="SeparatorHorizontal" label={tr('Page break')} title={tr('Page break (Ctrl+Enter)')} onClick={ed.insertPageBreak} />
        </Group>
        <Group label={tr('Tables')}>
          <TableGrid onPick={ed.insertTable} />
        </Group>
        <Group label={tr('Illustrations')}>
          <Big icon="ImagePlus" label={tr('Picture')} onClick={() => imgInput.current && imgInput.current.click()} />
          <input ref={imgInput} id="insert-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.insertImageFile(fl); }} />
          <Big icon="PenTool" label={tr('Drawing')} title={tr('Shapes and freehand drawing')} onClick={ed.openDrawing} />
          <Big icon="Sigma" label={tr('Equation')} onClick={ed.openEquation} />
          <Big icon="Minus" label={tr('Line')} onClick={ed.insertDivider} />
        </Group>
        <Group label={tr('Links')}>
          <Big icon="Link" label={tr('Link')} active={!!f.link} onClick={() => ed.openDialog('link')} />
        </Group>
        <Group label={tr('Header & footer')}>
          <Big icon="PanelTop" label={tr('Header')} onClick={() => ed.openDialog('hf', { focus: 'header' })} />
          <Big icon="PanelBottom" label={tr('Footer')} onClick={() => ed.openDialog('hf', { focus: 'footer' })} />
          <Drop label={tr('Page numbers')} className="big-drop" width={250} trigger={<span className="big-inner"><Icon name="Hash" size={22} stroke={1.6} /><span>{tr('Page numbers')}</span></span>}>
            {(close) => (
              <div className="pn-pop">
                <label className="switch-row">
                  <span>{tr('Show page numbers')}</span>
                  <input id="pn-on" type="checkbox" checked={pn.on} onChange={(e) => ed.setSettings({ pageNumbers: { ...pn, on: e.target.checked } })} />
                </label>
                <div className="pop-label">{tr('Position')}</div>
                <Seg label={tr('Position')} value={pn.where} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, where: v } })}
                  options={[{ value: 'header', label: tr('Top') }, { value: 'footer', label: tr('Bottom') }]} />
                <div className="pop-label">{tr('Alignment')}</div>
                <Seg label={tr('Alignment')} value={pn.align} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, align: v } })}
                  options={[{ value: 'left', icon: 'AlignLeft', title: tr('Left') }, { value: 'center', icon: 'AlignCenter', title: tr('Center') }, { value: 'right', icon: 'AlignRight', title: tr('Right') }]} />
                <div className="pop-label">{tr('Format')}</div>
                {[['n', '1, 2, 3'], ['pageof', tr('Page 1 of 3')], ['slash', '1 / 3'], ['dash', '— 1 —'], ['ar', 'صفحة 1 من 3']].map(([k, l]) => (
                  <MenuItem key={k} active={pn.format === k} onClick={() => ed.setSettings({ pageNumbers: { ...pn, on: true, format: k } })}><span dir="auto">{l}</span></MenuItem>
                ))}
                <div className="mi-sep" />
                <MenuItem icon="Check" onClick={close}>{tr('Done')}</MenuItem>
              </div>
            )}
          </Drop>
        </Group>
        <Group label={tr('Text')}>
          <Big icon="CalendarDays" label={tr('Date')} onClick={() => insertText(ed, new Date().toLocaleDateString(ed.settings.dir === 'rtl' ? 'ar' : undefined, { day: 'numeric', month: 'long', year: 'numeric' }))} />
          <Drop label={tr('Insert symbol')} className="big-drop" width={236} trigger={<span className="big-inner"><Icon name="Omega" size={22} stroke={1.6} /><span>{tr('Symbol')}</span></span>}>
            {(close) => (
              <div className="sym-grid">
                {SYMBOLS.map((c) => (
                  <button type="button" key={c} className="sym" onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); insertText(ed, c); }}>{c}</button>
                ))}
              </div>
            )}
          </Drop>
        </Group>
      </>
    ),
    layout: (
      <>
        <Group label={tr('Page setup')}>
          <Drop label={tr('Margins')} className="big-drop" width={250} trigger={<span className="big-inner"><Icon name="Frame" size={22} stroke={1.6} /><span>{tr('Margins')}</span></span>}>
            {(close) => (
              <>
                {Object.entries(MARGIN_PRESETS).map(([k, p]) => (
                  <MenuItem key={k} hint={p.note} active={s.marginPreset === k} onClick={() => { close(); ed.setSettings({ marginPreset: k, margins: { t: p.t, b: p.b, l: p.l, r: p.r } }); }}>{p.label}</MenuItem>
                ))}
                <div className="mi-sep" />
                <MenuItem icon="SlidersHorizontal" active={s.marginPreset === 'custom'} onClick={() => { close(); ed.openDialog('margins'); }}>{tr('Custom margins…')}</MenuItem>
              </>
            )}
          </Drop>
          <Drop label={tr('Orientation')} className="big-drop" width={190} trigger={<span className="big-inner"><Icon name={s.orientation === 'landscape' ? 'RectangleHorizontal' : 'RectangleVertical'} size={22} stroke={1.6} /><span>{tr('Orientation')}</span></span>}>
            {(close) => (
              <>
                <MenuItem icon="RectangleVertical" active={s.orientation === 'portrait'} onClick={() => { close(); ed.setSettings({ orientation: 'portrait' }); }}>{tr('Portrait')}</MenuItem>
                <MenuItem icon="RectangleHorizontal" active={s.orientation === 'landscape'} onClick={() => { close(); ed.setSettings({ orientation: 'landscape' }); }}>{tr('Landscape')}</MenuItem>
              </>
            )}
          </Drop>
          <Drop label={tr('Page size')} className="big-drop" width={220} trigger={<span className="big-inner"><Icon name="File" size={22} stroke={1.6} /><span>{tr('Size')}</span></span>}>
            {(close) => Object.entries(PAGE_SIZES).map(([k, p]) => (
              <MenuItem key={k} hint={p.note} active={s.size === k} onClick={() => { close(); ed.setSettings({ size: k }); }}>{p.label}</MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label={tr('Paragraph')}>
          <Big icon="Pilcrow" label={tr('Paragraph…')} title={tr('Indents, shading and borders')} onClick={() => ed.openPanel('paragraph')} />
          <div className="rg-rows">
            <div className="rg-row">
              <span className="rg-cap">{tr('Indent')}</span>
              <TB icon={dirOf === 'rtl' ? 'IndentIncrease' : 'IndentDecrease'} label={tr('Decrease indent')} onClick={() => ed.fmt('indent', '-1')} disabled={!f.indent} />
              <span className="rg-val tnum">{f.indent || 0}</span>
              <TB icon={dirOf === 'rtl' ? 'IndentDecrease' : 'IndentIncrease'} label={tr('Increase indent')} onClick={() => ed.fmt('indent', '+1')} />
            </div>
            <div className="rg-row">
              <span className="rg-cap">{tr('Before')}</span>
              <Stepper value={parseFloat(f.spacebefore) || 0} onChange={(v) => ed.fmt('spacebefore', v ? v + 'px' : false)} label={tr('Space before paragraph')} />
              <span className="rg-cap">{tr('After')}</span>
              <Stepper value={parseFloat(f.spaceafter) || 0} onChange={(v) => ed.fmt('spaceafter', v ? v + 'px' : false)} label={tr('Space after paragraph')} />
            </div>
          </div>
        </Group>
        <Group label={tr('Document defaults')}>
          <div className="rg-rows">
            <div className="rg-row">
              <span className="rg-cap">{tr('Direction')}</span>
              <Seg label={tr('Document direction')} value={s.dir} onChange={(v) => ed.setSettings({ dir: v })}
                options={[{ value: 'ltr', label: tr('LTR'), icon: 'PilcrowRight', title: tr('Left to right') }, { value: 'rtl', label: tr('RTL'), icon: 'PilcrowLeft', title: tr('Right to left (Arabic)') }]} />
            </div>
            <div className="rg-row">
              <FontPicker label={tr('Default font')} value={s.font} onPick={(v) => ed.setSettings({ font: v })} />
              <SizePicker label={tr('Default size')} value={s.fontSize} onPick={(v) => ed.setSettings({ fontSize: v })} />
              <Drop label={tr('Default line spacing')} width={150} trigger={<><Icon name="ListCollapse" size={18} /><span className="combo-val tnum">{s.lineHeight}</span><Icon name="ChevronDown" size={12} /></>}>
                {(close) => [1, 1.15, 1.4, 1.5, 1.6, 1.8, 2].map((v) => (
                  <MenuItem key={v} active={s.lineHeight === v} onClick={() => { close(); ed.setSettings({ lineHeight: v }); }}>{String(v)}</MenuItem>
                ))}
              </Drop>
            </div>
          </div>
        </Group>
      </>
    ),
    review: (
      <>
        <Group label={tr('Proofing')}>
          <Big icon="SpellCheck" label={tr('Spelling')} active={s.spellcheck} title={tr('Underline spelling mistakes')} onClick={() => ed.setSettings({ spellcheck: !s.spellcheck })} />
          <Drop label={tr('Proofing language')} className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="Languages" size={22} stroke={1.6} /><span>{{ auto: tr('Auto'), en: tr('English'), ar: 'العربية' }[s.lang] || tr('Auto')}</span></span>}>
            {(close) => [['auto', tr('Detect per paragraph')], ['en', tr('English')], ['ar', 'العربية']].map(([k, l]) => (
              <MenuItem key={k} active={s.lang === k} onClick={() => { close(); ed.setSettings({ lang: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
          <Big icon="Sigma" label={tr('Word count')} onClick={() => ed.openDialog('count')} />
        </Group>
        <Group label={tr('Statistics')}>
          <div className="mini-stats">
            <div><b className="tnum">{ed.stats.words.toLocaleString()}</b><span>{tr('words')}</span></div>
            <div><b className="tnum">{ed.stats.chars.toLocaleString()}</b><span>{tr('characters')}</span></div>
            <div><b className="tnum">{ed.pages}</b><span>{trn(ed.pages, 'page', 'pages')}</span></div>
          </div>
        </Group>
        <Group label={tr('Find')}>
          <Big icon="Search" label={tr('Find')} onClick={() => ed.openFind('find')} />
          <Big icon="Replace" label={tr('Replace')} onClick={() => ed.openFind('replace')} />
        </Group>
        <Group label={tr('Assistant')}>
          <Big icon="Sparkles" label={tr('AI assistant')} onClick={() => ed.openPanel('ai')} />
          <Big icon="MessagesSquare" label={tr('Ask document')} title={tr('Chat with this document in Think')} onClick={ed.askDocument} />
        </Group>
        <Group label={tr('Protect')}>
          <Big icon="History" label={tr('Versions')} onClick={() => ed.openPanel('versions')} />
          <Big icon={ed.readOnly ? 'LockOpen' : 'Lock'} label={ed.readOnly ? tr('Unlock editing') : tr('Lock editing')} active={ed.readOnly} onClick={ed.toggleReadOnly} />
          <Big icon="KeyRound" label={ed.locked ? tr('Remove password') : tr('Password')} active={ed.locked} onClick={ed.openPassword} />
        </Group>
        <Group label={tr('Direction')}>
          <Big icon="WandSparkles" label={tr('Auto direction')} title={tr('Let every paragraph choose its direction from its first letters')} onClick={() => {
            const q = ed.quill(); if (!q) return;
            q.formatLine(0, q.getLength(), 'dir', 'auto', 'user');
          }} />
        </Group>
      </>
    ),
    view: (
      <>
        <Group label={tr('Views')}>
          <Big icon="Files" label={tr('Print layout')} active={ed.viewMode === 'print'} onClick={() => ed.setViewMode('print')} />
          <Big icon="ScrollText" label={tr('Continuous')} active={ed.viewMode === 'web'} onClick={() => ed.setViewMode('web')} />
          <Big icon="Maximize2" label={tr('Focus')} title={tr('Hide everything but the page')} onClick={() => ed.setFocusMode(true)} />
          <Big icon="BookOpenText" label={tr('Read')} title={tr('Reading mode with read aloud')} onClick={ed.openReader} />
        </Group>
        <Group label={tr('Zoom')}>
          <TB icon="ZoomOut" label={tr('Zoom out')} wide onClick={() => ed.setZoom(Math.round((ed.zoom - 0.1) * 10) / 10)} />
          <Big icon="Search" label={Math.round(ed.zoom * 100) + '%'} title={tr('Zoom to 100%')} active={!ed.fit && Math.abs(ed.zoom - 1) < 0.001} onClick={() => ed.setZoom(1)} />
          <TB icon="ZoomIn" label={tr('Zoom in')} wide onClick={() => ed.setZoom(Math.round((ed.zoom + 0.1) * 10) / 10)} />
          <Big icon="MoveHorizontal" label={tr('Page width')} active={ed.fit} onClick={() => ed.setFit(true)} />
        </Group>
        <Group label={tr('Appearance')}>
          <Big icon={ed.theme === 'dark' ? 'Sun' : 'Moon'} label={ed.theme === 'dark' ? tr('Light mode') : tr('Dark mode')} onClick={ed.toggleTheme} />
          <Big icon="FileText" label={tr('Dark paper')} active={ed.darkPaper} title={tr('Show pages in a dark colour (exports stay white)')} onClick={() => ed.setDarkPaper(!ed.darkPaper)} />
        </Group>
      </>
    ),
    table: (
      <>
        <Group label={tr('Rows')}>
          <Big icon="ArrowUpToLine" label={tr('Insert above')} onClick={() => ed.tableOp('insertRowAbove')} />
          <Big icon="ArrowDownToLine" label={tr('Insert below')} onClick={() => ed.tableOp('insertRowBelow')} />
          <Big icon="Rows2" label={tr('Delete row')} onClick={() => ed.tableOp('deleteRow')} />
        </Group>
        <Group label={tr('Columns')}>
          <Big icon="ArrowLeftToLine" label={tr('Insert left')} onClick={() => ed.tableOp('insertColumnLeft')} />
          <Big icon="ArrowRightToLine" label={tr('Insert right')} onClick={() => ed.tableOp('insertColumnRight')} />
          <Big icon="Columns2" label={tr('Delete column')} onClick={() => ed.tableOp('deleteColumn')} />
        </Group>
        <Group label={tr('Cells')}>
          <Drop label={tr('Cell shading')} className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="PaintBucket" size={22} stroke={1.6} /><span>{tr('Shading')}</span></span>}>
            {(close) => [['', tr('None')], ['gray', tr('Gray')], ['blue', tr('Blue')], ['green', tr('Green')], ['yellow', tr('Yellow')], ['red', tr('Red')], ['purple', tr('Purple')]].map(([k, l]) => (
              <MenuItem key={l} active={(f.shade || '') === k} onClick={() => { close(); ed.fmt('shade', k || false); }}><span className={'shade-swatch ql-shade-' + (k || 'none')} />{l}</MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label={tr('Table style')}>
          <Drop label={tr('Table style')} className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="Grid3x3" size={22} stroke={1.6} /><span>{tr('Style')}</span></span>}>
            {(close) => [['grid', tr('Grid')], ['striped', tr('Striped rows')], ['minimal', tr('Minimal lines')]].map(([k, l]) => (
              <MenuItem key={k} active={(s.tableStyle || 'grid') === k} onClick={() => { close(); ed.setSettings({ tableStyle: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
          <Big icon="Heading" label={tr('Header row')} active={s.tableHeader !== false} title={tr('Emphasise the first row of every table')} onClick={() => ed.setSettings({ tableHeader: s.tableHeader === false })} />
          <Big icon="Trash2" label={tr('Delete table')} onClick={() => ed.tableOp('deleteTable')} />
        </Group>
      </>
    ),
    picture: ed.imgSel ? (
      <>
        <Group label={tr('Size')}>
          {['25%', '50%', '75%', '100%'].map((w) => (
            <TB key={w} label={tr('Width {0}', w)} wide className="txt" active={ed.imgSel.width === w} onClick={() => ed.imageWidth(w)}><span>{w}</span></TB>
          ))}
          <Big icon="RotateCcw" label={tr('Original')} active={!ed.imgSel.width} onClick={() => ed.imageWidth(false)} />
        </Group>
        <Group label={tr('Position')}>
          <TB icon="AlignLeft" label={tr('Align left')} wide active={alignIs('left')} onClick={() => setAlign('left')} />
          <TB icon="AlignCenter" label={tr('Center')} wide active={alignIs('center')} onClick={() => setAlign('center')} />
          <TB icon="AlignRight" label={tr('Align right')} wide active={alignIs('right')} onClick={() => setAlign('right')} />
        </Group>
        <Group label={tr('Picture')}>
          {ed.imgKind === 'equation' && <Big icon="Sigma" label={tr('Edit equation')} onClick={ed.editImageSpecial} />}
          {ed.imgKind === 'drawing' && <Big icon="PenTool" label={tr('Edit drawing')} onClick={ed.editImageSpecial} />}
          {ed.imgKind === 'image' && <Big icon="Captions" label={tr('Alt text')} onClick={() => ed.openDialog('alt')} />}
          <Big icon="ImageUp" label={tr('Replace')} onClick={() => replaceInput.current && replaceInput.current.click()} />
          <input ref={replaceInput} id="replace-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.insertImageFile(fl, ed.imgSel.index); }} />
          <Big icon="Trash2" label={tr('Delete')} onClick={ed.deleteImage} />
        </Group>
      </>
    ) : null,
  };

  return (
    <div className="ribbon">
      <div className="rb-tabs" role="tablist" aria-label={tr('Ribbon')}>
        {tabs.map((t) => (
          <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={'rb-tab' + (tab === t.id ? ' on' : '') + (t.ctx ? ' ctx' : '')}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="rb-panel" role="tabpanel" key={tab}>
        {panels[tab] || panels.home}
      </div>
    </div>
  );
}

function Stepper({ value, onChange, label }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={tr('Less {0}', label)} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(Math.max(0, value - 4))}><Icon name="Minus" size={12} /></button>
      <span className="tnum">{value}<small>{tr('px')}</small></span>
      <button type="button" aria-label={tr('More {0}', label)} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(Math.min(96, value + 4))}><Icon name="Plus" size={12} /></button>
    </span>
  );
}
