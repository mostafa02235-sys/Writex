import React, { useState, useRef } from '../react.js';
import { Icon } from '../icons.jsx';
import { TB, Group, Drop, MenuItem, Seg } from './ui.jsx';
import { FONTS, SIZES, LINE_SPACINGS, PARA_SPACINGS, TEXT_COLORS, HIGHLIGHTS, PAGE_SIZES, MARGIN_PRESETS, fontByStack } from '../constants.js';
import { TEMPLATES } from '../templates.js';

const TABS = [
  { id: 'file', label: 'File' },
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'references', label: 'References' },
  { id: 'layout', label: 'Layout' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
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

function FontPicker({ value, onPick, label = 'Font' }) {
  const cur = fontByStack(value);
  const groups = ['Latin', 'System', 'Arabic'];
  return (
    <Drop label={label} className="combo font-combo" width={260} trigger={<><span className="combo-val" style={{ fontFamily: value }}>{cur ? cur.name : 'Mixed'}</span><Icon name="ChevronDown" size={14} /></>}>
      {(close) => groups.map((g) => (
        <div key={g} className="font-group">
          <div className="pop-label">{g === 'Arabic' ? 'Arabic · عربي' : g === 'System' ? 'Installed on most computers' : 'Latin'}</div>
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

function SizePicker({ value, onPick, label = 'Font size' }) {
  const [custom, setCustom] = useState('');
  const shown = value ? (Math.round(value * 2) / 2) : '';
  return (
    <Drop label={label} className="combo size-combo" width={150} trigger={<><span className="combo-val">{shown || '—'}</span><Icon name="ChevronDown" size={14} /></>}>
      {(close) => (
        <>
          <form className="pop-form" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(custom); if (n >= 1 && n <= 400) { close(); onPick(n); } }}>
            <input id="size-custom" type="number" min="1" max="400" step="0.5" inputMode="decimal" placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom font size in points" />
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
            <span>Custom colour</span>
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
    <Drop label="Insert table" className="big-drop" width={236} trigger={<span className="big-inner"><Icon name="Table" size={22} stroke={1.6} /><span>Table</span></span>}>
      {(close) => (
        <div className="tgrid-pop">
          <div className="pop-label">{hover[0] ? `${hover[1]} × ${hover[0]} table` : 'Choose a size'}</div>
          <div className="tgrid" onMouseLeave={() => setHover([0, 0])}>
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N) + 1;
              const c = (i % N) + 1;
              return (
                <button type="button" key={i} aria-label={`${c} columns by ${r} rows`} className={'tcell' + (r <= hover[0] && c <= hover[1] ? ' on' : '')}
                  onMouseEnter={() => setHover([r, c])} onMouseDown={(e) => e.preventDefault()} onClick={() => { close(); onPick(r, c); }} />
              );
            })}
          </div>
          <form className="tgrid-form" onSubmit={(e) => { e.preventDefault(); close(); onPick(Math.max(1, Math.min(50, rows)), Math.max(1, Math.min(12, cols))); }}>
            <label>Rows<input id="tbl-rows" type="number" min="1" max="50" value={rows} onChange={(e) => setRows(+e.target.value)} /></label>
            <label>Columns<input id="tbl-cols" type="number" min="1" max="12" value={cols} onChange={(e) => setCols(+e.target.value)} /></label>
            <button type="submit" className="btn primary sm">Insert</button>
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
  if (ed.inTable) tabs.push({ id: 'table', label: 'Table', ctx: true });
  if (ed.imgSel) tabs.push({ id: 'picture', label: 'Picture', ctx: true });

  const fontSize = ed.currentSize();
  const pn = s.pageNumbers;

  const panels = {
    file: (
      <>
        <Group label="New">
          <Big icon="FilePlus2" label="Blank" onClick={() => ed.newDoc('blank')} />
          <Big icon="FilePlus2" label="Blank (RTL)" onClick={() => ed.newDoc('blank-ar')} />
          <Drop label="New from template" className="big-drop" width={240} trigger={<span className="big-inner"><Icon name="LayoutTemplate" size={22} stroke={1.6} /><span>Template</span></span>}>
            {(close) => TEMPLATES.filter((t) => !t.id.startsWith('blank')).map((t) => (
              <MenuItem key={t.id} icon="FileText" hint={t.lang} onClick={() => { close(); ed.newDoc(t.id); }}><span dir="auto">{t.name}</span></MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label="Document">
          <Big icon="LibraryBig" label="All documents" onClick={ed.onExit} />
          <Big icon="Pencil" label="Rename" onClick={ed.rename} />
          <Big icon="Copy" label="Duplicate" onClick={ed.duplicate} />
          <Big icon="FileUp" label="Import .docx or .txt" onClick={() => docxInput.current && docxInput.current.click()} />
          <Big icon="History" label="Versions" onClick={() => ed.openPanel('versions')} />
          <Big icon="LayoutTemplate" label="Save as template" onClick={ed.saveTemplate} />
          <input ref={docxInput} id="file-import-docx" type="file" accept=".docx,.txt,text/plain" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.importInto(fl); }} />
        </Group>
        <Group label="Export">
          <Big icon="Share2" label="Share" onClick={ed.share} />
          <Big icon="FileText" label="PDF" onClick={() => ed.runExport('pdf')} />
          <Big icon="FileType" label="Word" onClick={() => ed.runExport('docx')} />
          <Big icon="Globe" label="HTML" onClick={() => ed.runExport('html')} />
          <Big icon="AlignLeft" label="Text" onClick={() => ed.runExport('txt')} />
        </Group>
        <Group label="Remove">
          <Big icon="Trash2" label="Delete" onClick={ed.del} />
        </Group>
      </>
    ),
    home: (
      <>
        <Group label="Font" className="g-font">
          <div className="rg-rows">
            <div className="rg-row">
              <FontPicker value={f.font && !Array.isArray(f.font) ? f.font : s.font} onPick={(v) => ed.fmt('font', v)} />
              <SizePicker value={fontSize} onPick={ed.setFontSize} />
              <TB icon="AArrowUp" label="Grow font" onClick={() => ed.grow(1)} />
              <TB icon="AArrowDown" label="Shrink font" onClick={() => ed.grow(-1)} />
            </div>
            <div className="rg-row">
              <TB icon="Bold" label="Bold" kbd="Ctrl+B" active={!!f.bold} onClick={() => ed.toggle('bold')} />
              <TB icon="Italic" label="Italic" kbd="Ctrl+I" active={!!f.italic} onClick={() => ed.toggle('italic')} />
              <TB icon="Underline" label="Underline" kbd="Ctrl+U" active={!!f.underline} onClick={() => ed.toggle('underline')} />
              <TB icon="Strikethrough" label="Strikethrough" active={!!f.strike} onClick={() => ed.toggle('strike')} />
              <TB icon="Subscript" label="Subscript" active={f.script === 'sub'} onClick={() => ed.fmt('script', f.script === 'sub' ? false : 'sub')} />
              <TB icon="Superscript" label="Superscript" active={f.script === 'super'} onClick={() => ed.fmt('script', f.script === 'super' ? false : 'super')} />
              <ColorPicker icon="Baseline" label="Text colour" value={f.color} colors={TEXT_COLORS} autoLabel="Automatic" onPick={(c) => ed.fmt('color', c)} />
              <ColorPicker icon="Highlighter" label="Highlight" value={f.background} colors={[...HIGHLIGHTS, ...(ed.customHL || [])]} autoLabel="No highlight" onPick={(c) => { ed.fmt('background', c); if (c && !HIGHLIGHTS.includes(c) && !(ed.customHL || []).includes(c)) ed.addCustomHighlight(c); }} />
              <TB icon="RemoveFormatting" label="Clear formatting" onClick={ed.clearFormatting} />
            </div>
          </div>
        </Group>
        <Group label="Paragraph" className="g-para">
          <div className="rg-rows">
            <div className="rg-row">
              <TB icon="List" label="Bulleted list" active={f.list === 'bullet'} onClick={() => ed.fmt('list', f.list === 'bullet' ? false : 'bullet')} />
              <TB icon="ListOrdered" label="Numbered list" active={f.list === 'ordered'} onClick={() => ed.fmt('list', f.list === 'ordered' ? false : 'ordered')} />
              <TB icon={dirOf === 'rtl' ? 'IndentIncrease' : 'IndentDecrease'} label="Decrease indent" onClick={() => ed.fmt('indent', '-1')} disabled={!f.indent} />
              <TB icon={dirOf === 'rtl' ? 'IndentDecrease' : 'IndentIncrease'} label="Increase indent" onClick={() => ed.fmt('indent', '+1')} />
              <Drop label="Line and paragraph spacing" width={230} trigger={<><Icon name="ListCollapse" size={18} /><Icon name="ChevronDown" size={12} /></>}>
                {(close) => (
                  <>
                    <div className="pop-label">Line spacing</div>
                    {LINE_SPACINGS.map((v) => (
                      <MenuItem key={v} active={Math.abs(lh - v) < 0.01} onClick={() => { close(); ed.fmt('lineheight', String(v)); }}>{v.toFixed(v % 1 ? 2 : 1).replace(/0$/, '')}</MenuItem>
                    ))}
                    <div className="mi-sep" />
                    <div className="pop-label">Space between paragraphs</div>
                    {PARA_SPACINGS.map((p) => (
                      <MenuItem key={p.label} hint={`${p.before} / ${p.after} px`} active={parseFloat(f.spaceafter || 0) === p.after && parseFloat(f.spacebefore || 0) === p.before}
                        onClick={() => { close(); ed.fmt('spacebefore', p.before ? p.before + 'px' : false); ed.fmt('spaceafter', p.after ? p.after + 'px' : false); }}>{p.label}</MenuItem>
                    ))}
                  </>
                )}
              </Drop>
            </div>
            <div className="rg-row">
              <TB icon="AlignLeft" label="Align left" active={alignIs('left')} onClick={() => setAlign('left')} />
              <TB icon="AlignCenter" label="Center" kbd="Ctrl+E" active={alignIs('center')} onClick={() => setAlign('center')} />
              <TB icon="AlignRight" label="Align right" active={alignIs('right')} onClick={() => setAlign('right')} />
              <TB icon="AlignJustify" label="Justify" active={alignIs('justify')} onClick={() => setAlign('justify')} />
              <span className="rg-sep" />
              <TB icon="PilcrowRight" label="Left-to-right paragraph" active={f.dir === 'ltr'} onClick={() => ed.fmt('dir', f.dir === 'ltr' ? 'auto' : 'ltr')} />
              <TB icon="PilcrowLeft" label="Right-to-left paragraph" active={f.dir === 'rtl'} onClick={() => ed.fmt('dir', f.dir === 'rtl' ? 'auto' : 'rtl')} />
            </div>
          </div>
        </Group>
        <Group label="Styles" className="g-styles">
          <div className="styles">
            {[
              { k: 'normal', label: 'Normal', cls: 'st-n' },
              { k: 'h1', label: 'Heading 1', cls: 'st-h1' },
              { k: 'h2', label: 'Heading 2', cls: 'st-h2' },
              { k: 'h3', label: 'Heading 3', cls: 'st-h3' },
              { k: 'quote', label: 'Quote', cls: 'st-q' },
            ].map((x) => (
              <button type="button" key={x.k} className={'style-chip ' + x.cls + (styleKey === x.k ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => ed.applyStyle(x.k)}>
                <span className="style-sample">Aa</span><span className="style-name">{x.label}</span>
              </button>
            ))}
          </div>
        </Group>
        <Group label="Editing">
          <Big icon="Search" label="Find" onClick={() => ed.openFind('find')} />
          <Big icon="Replace" label="Replace" onClick={() => ed.openFind('replace')} />
        </Group>
        <Group label="Assistant">
          <Big icon="Sparkles" label="AI assistant" onClick={() => ed.openPanel('ai')} />
          <Big icon="Mic" label={ed.listening ? 'Stop' : 'Dictate'} active={!!ed.listening} onClick={() => (ed.listening ? ed.stopDictation() : ed.startDictation())} />
        </Group>
      </>
    ),
    references: (
      <>
        <Group label="Contents">
          <Big icon="ListTree" label="Table of contents" title="Insert or update the table of contents" onClick={ed.updateTOC} />
        </Group>
        <Group label="Footnotes">
          <Big icon="Superscript" label="Footnote" onClick={ed.openFootnote} />
        </Group>
        <Group label="Citations">
          <Big icon="Quote" label="Citation" title="Cite a source at the cursor" onClick={() => ed.openPanel('sources')} />
          <Big icon="BookMarked" label="Bibliography" onClick={ed.insertBibliography} />
          <Drop label="Citation style" className="big-drop" width={180} trigger={<span className="big-inner"><Icon name="Type" size={22} stroke={1.6} /><span>{({ apa: 'APA', mla: 'MLA', ieee: 'IEEE' })[(s.refs || {}).style || 'apa']}</span></span>}>
            {(close) => [['apa', 'APA 7'], ['mla', 'MLA 9'], ['ieee', 'IEEE']].map(([k, l]) => (
              <MenuItem key={k} active={((s.refs || {}).style || 'apa') === k} onClick={() => { close(); ed.setRefs({ ...(s.refs || { items: [] }), style: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
        </Group>
      </>
    ),
    insert: (
      <>
        <Group label="Pages">
          <Big icon="BookOpen" label="Cover page" onClick={ed.openCover} />
          <Big icon="SeparatorHorizontal" label="Page break" title="Page break (Ctrl+Enter)" onClick={ed.insertPageBreak} />
        </Group>
        <Group label="Tables">
          <TableGrid onPick={ed.insertTable} />
        </Group>
        <Group label="Illustrations">
          <Big icon="ImagePlus" label="Picture" onClick={() => imgInput.current && imgInput.current.click()} />
          <input ref={imgInput} id="insert-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.insertImageFile(fl); }} />
          <Big icon="PenTool" label="Drawing" title="Shapes and freehand drawing" onClick={ed.openDrawing} />
          <Big icon="Sigma" label="Equation" onClick={ed.openEquation} />
          <Big icon="Minus" label="Line" onClick={ed.insertDivider} />
        </Group>
        <Group label="Links">
          <Big icon="Link" label="Link" active={!!f.link} onClick={() => ed.openDialog('link')} />
        </Group>
        <Group label="Header & footer">
          <Big icon="PanelTop" label="Header" onClick={() => ed.openDialog('hf', { focus: 'header' })} />
          <Big icon="PanelBottom" label="Footer" onClick={() => ed.openDialog('hf', { focus: 'footer' })} />
          <Drop label="Page numbers" className="big-drop" width={250} trigger={<span className="big-inner"><Icon name="Hash" size={22} stroke={1.6} /><span>Page numbers</span></span>}>
            {(close) => (
              <div className="pn-pop">
                <label className="switch-row">
                  <span>Show page numbers</span>
                  <input id="pn-on" type="checkbox" checked={pn.on} onChange={(e) => ed.setSettings({ pageNumbers: { ...pn, on: e.target.checked } })} />
                </label>
                <div className="pop-label">Position</div>
                <Seg label="Position" value={pn.where} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, where: v } })}
                  options={[{ value: 'header', label: 'Top' }, { value: 'footer', label: 'Bottom' }]} />
                <div className="pop-label">Alignment</div>
                <Seg label="Alignment" value={pn.align} onChange={(v) => ed.setSettings({ pageNumbers: { ...pn, on: true, align: v } })}
                  options={[{ value: 'left', icon: 'AlignLeft', title: 'Left' }, { value: 'center', icon: 'AlignCenter', title: 'Center' }, { value: 'right', icon: 'AlignRight', title: 'Right' }]} />
                <div className="pop-label">Format</div>
                {[['n', '1, 2, 3'], ['pageof', 'Page 1 of 3'], ['slash', '1 / 3'], ['dash', '— 1 —'], ['ar', 'صفحة 1 من 3']].map(([k, l]) => (
                  <MenuItem key={k} active={pn.format === k} onClick={() => ed.setSettings({ pageNumbers: { ...pn, on: true, format: k } })}><span dir="auto">{l}</span></MenuItem>
                ))}
                <div className="mi-sep" />
                <MenuItem icon="Check" onClick={close}>Done</MenuItem>
              </div>
            )}
          </Drop>
        </Group>
        <Group label="Text">
          <Big icon="CalendarDays" label="Date" onClick={() => insertText(ed, new Date().toLocaleDateString(ed.settings.dir === 'rtl' ? 'ar' : undefined, { day: 'numeric', month: 'long', year: 'numeric' }))} />
          <Drop label="Insert symbol" className="big-drop" width={236} trigger={<span className="big-inner"><Icon name="Omega" size={22} stroke={1.6} /><span>Symbol</span></span>}>
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
        <Group label="Page setup">
          <Drop label="Margins" className="big-drop" width={250} trigger={<span className="big-inner"><Icon name="Frame" size={22} stroke={1.6} /><span>Margins</span></span>}>
            {(close) => (
              <>
                {Object.entries(MARGIN_PRESETS).map(([k, p]) => (
                  <MenuItem key={k} hint={p.note} active={s.marginPreset === k} onClick={() => { close(); ed.setSettings({ marginPreset: k, margins: { t: p.t, b: p.b, l: p.l, r: p.r } }); }}>{p.label}</MenuItem>
                ))}
                <div className="mi-sep" />
                <MenuItem icon="SlidersHorizontal" active={s.marginPreset === 'custom'} onClick={() => { close(); ed.openDialog('margins'); }}>Custom margins…</MenuItem>
              </>
            )}
          </Drop>
          <Drop label="Orientation" className="big-drop" width={190} trigger={<span className="big-inner"><Icon name={s.orientation === 'landscape' ? 'RectangleHorizontal' : 'RectangleVertical'} size={22} stroke={1.6} /><span>Orientation</span></span>}>
            {(close) => (
              <>
                <MenuItem icon="RectangleVertical" active={s.orientation === 'portrait'} onClick={() => { close(); ed.setSettings({ orientation: 'portrait' }); }}>Portrait</MenuItem>
                <MenuItem icon="RectangleHorizontal" active={s.orientation === 'landscape'} onClick={() => { close(); ed.setSettings({ orientation: 'landscape' }); }}>Landscape</MenuItem>
              </>
            )}
          </Drop>
          <Drop label="Page size" className="big-drop" width={220} trigger={<span className="big-inner"><Icon name="File" size={22} stroke={1.6} /><span>Size</span></span>}>
            {(close) => Object.entries(PAGE_SIZES).map(([k, p]) => (
              <MenuItem key={k} hint={p.note} active={s.size === k} onClick={() => { close(); ed.setSettings({ size: k }); }}>{p.label}</MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label="Paragraph">
          <Big icon="Pilcrow" label="Paragraph…" title="Indents, shading and borders" onClick={() => ed.openPanel('paragraph')} />
          <div className="rg-rows">
            <div className="rg-row">
              <span className="rg-cap">Indent</span>
              <TB icon={dirOf === 'rtl' ? 'IndentIncrease' : 'IndentDecrease'} label="Decrease indent" onClick={() => ed.fmt('indent', '-1')} disabled={!f.indent} />
              <span className="rg-val tnum">{f.indent || 0}</span>
              <TB icon={dirOf === 'rtl' ? 'IndentDecrease' : 'IndentIncrease'} label="Increase indent" onClick={() => ed.fmt('indent', '+1')} />
            </div>
            <div className="rg-row">
              <span className="rg-cap">Before</span>
              <Stepper value={parseFloat(f.spacebefore) || 0} onChange={(v) => ed.fmt('spacebefore', v ? v + 'px' : false)} label="Space before paragraph" />
              <span className="rg-cap">After</span>
              <Stepper value={parseFloat(f.spaceafter) || 0} onChange={(v) => ed.fmt('spaceafter', v ? v + 'px' : false)} label="Space after paragraph" />
            </div>
          </div>
        </Group>
        <Group label="Document defaults">
          <div className="rg-rows">
            <div className="rg-row">
              <span className="rg-cap">Direction</span>
              <Seg label="Document direction" value={s.dir} onChange={(v) => ed.setSettings({ dir: v })}
                options={[{ value: 'ltr', label: 'LTR', icon: 'PilcrowRight', title: 'Left to right' }, { value: 'rtl', label: 'RTL', icon: 'PilcrowLeft', title: 'Right to left (Arabic)' }]} />
            </div>
            <div className="rg-row">
              <FontPicker label="Default font" value={s.font} onPick={(v) => ed.setSettings({ font: v })} />
              <SizePicker label="Default size" value={s.fontSize} onPick={(v) => ed.setSettings({ fontSize: v })} />
              <Drop label="Default line spacing" width={150} trigger={<><Icon name="ListCollapse" size={18} /><span className="combo-val tnum">{s.lineHeight}</span><Icon name="ChevronDown" size={12} /></>}>
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
        <Group label="Proofing">
          <Big icon="SpellCheck" label="Spelling" active={s.spellcheck} title="Underline spelling mistakes" onClick={() => ed.setSettings({ spellcheck: !s.spellcheck })} />
          <Drop label="Proofing language" className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="Languages" size={22} stroke={1.6} /><span>{{ auto: 'Auto', en: 'English', ar: 'العربية' }[s.lang] || 'Auto'}</span></span>}>
            {(close) => [['auto', 'Detect per paragraph'], ['en', 'English'], ['ar', 'العربية']].map(([k, l]) => (
              <MenuItem key={k} active={s.lang === k} onClick={() => { close(); ed.setSettings({ lang: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
          <Big icon="Sigma" label="Word count" onClick={() => ed.openDialog('count')} />
        </Group>
        <Group label="Statistics">
          <div className="mini-stats">
            <div><b className="tnum">{ed.stats.words.toLocaleString()}</b><span>words</span></div>
            <div><b className="tnum">{ed.stats.chars.toLocaleString()}</b><span>characters</span></div>
            <div><b className="tnum">{ed.pages}</b><span>{ed.pages === 1 ? 'page' : 'pages'}</span></div>
          </div>
        </Group>
        <Group label="Find">
          <Big icon="Search" label="Find" onClick={() => ed.openFind('find')} />
          <Big icon="Replace" label="Replace" onClick={() => ed.openFind('replace')} />
        </Group>
        <Group label="Assistant">
          <Big icon="Sparkles" label="AI assistant" onClick={() => ed.openPanel('ai')} />
          <Big icon="MessagesSquare" label="Ask document" title="Chat with this document in Think" onClick={ed.askDocument} />
        </Group>
        <Group label="Protect">
          <Big icon="History" label="Versions" onClick={() => ed.openPanel('versions')} />
          <Big icon={ed.readOnly ? 'LockOpen' : 'Lock'} label={ed.readOnly ? 'Unlock editing' : 'Lock editing'} active={ed.readOnly} onClick={ed.toggleReadOnly} />
          <Big icon="KeyRound" label={ed.locked ? 'Remove password' : 'Password'} active={ed.locked} onClick={ed.openPassword} />
        </Group>
        <Group label="Direction">
          <Big icon="WandSparkles" label="Auto direction" title="Let every paragraph choose its direction from its first letters" onClick={() => {
            const q = ed.quill(); if (!q) return;
            q.formatLine(0, q.getLength(), 'dir', 'auto', 'user');
          }} />
        </Group>
      </>
    ),
    view: (
      <>
        <Group label="Views">
          <Big icon="Files" label="Print layout" active={ed.viewMode === 'print'} onClick={() => ed.setViewMode('print')} />
          <Big icon="ScrollText" label="Continuous" active={ed.viewMode === 'web'} onClick={() => ed.setViewMode('web')} />
          <Big icon="Maximize2" label="Focus" title="Hide everything but the page" onClick={() => ed.setFocusMode(true)} />
          <Big icon="BookOpenText" label="Read" title="Reading mode with read aloud" onClick={ed.openReader} />
        </Group>
        <Group label="Zoom">
          <TB icon="ZoomOut" label="Zoom out" wide onClick={() => ed.setZoom(Math.round((ed.zoom - 0.1) * 10) / 10)} />
          <Big icon="Search" label={Math.round(ed.zoom * 100) + '%'} title="Zoom to 100%" active={!ed.fit && Math.abs(ed.zoom - 1) < 0.001} onClick={() => ed.setZoom(1)} />
          <TB icon="ZoomIn" label="Zoom in" wide onClick={() => ed.setZoom(Math.round((ed.zoom + 0.1) * 10) / 10)} />
          <Big icon="MoveHorizontal" label="Page width" active={ed.fit} onClick={() => ed.setFit(true)} />
        </Group>
        <Group label="Appearance">
          <Big icon={ed.theme === 'dark' ? 'Sun' : 'Moon'} label={ed.theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={ed.toggleTheme} />
          <Big icon="FileText" label="Dark paper" active={ed.darkPaper} title="Show pages in a dark colour (exports stay white)" onClick={() => ed.setDarkPaper(!ed.darkPaper)} />
        </Group>
      </>
    ),
    table: (
      <>
        <Group label="Rows">
          <Big icon="ArrowUpToLine" label="Insert above" onClick={() => ed.tableOp('insertRowAbove')} />
          <Big icon="ArrowDownToLine" label="Insert below" onClick={() => ed.tableOp('insertRowBelow')} />
          <Big icon="Rows2" label="Delete row" onClick={() => ed.tableOp('deleteRow')} />
        </Group>
        <Group label="Columns">
          <Big icon="ArrowLeftToLine" label="Insert left" onClick={() => ed.tableOp('insertColumnLeft')} />
          <Big icon="ArrowRightToLine" label="Insert right" onClick={() => ed.tableOp('insertColumnRight')} />
          <Big icon="Columns2" label="Delete column" onClick={() => ed.tableOp('deleteColumn')} />
        </Group>
        <Group label="Cells">
          <Drop label="Cell shading" className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="PaintBucket" size={22} stroke={1.6} /><span>Shading</span></span>}>
            {(close) => [['', 'None'], ['gray', 'Gray'], ['blue', 'Blue'], ['green', 'Green'], ['yellow', 'Yellow'], ['red', 'Red'], ['purple', 'Purple']].map(([k, l]) => (
              <MenuItem key={l} active={(f.shade || '') === k} onClick={() => { close(); ed.fmt('shade', k || false); }}><span className={'shade-swatch ql-shade-' + (k || 'none')} />{l}</MenuItem>
            ))}
          </Drop>
        </Group>
        <Group label="Table style">
          <Drop label="Table style" className="big-drop" width={200} trigger={<span className="big-inner"><Icon name="Grid3x3" size={22} stroke={1.6} /><span>Style</span></span>}>
            {(close) => [['grid', 'Grid'], ['striped', 'Striped rows'], ['minimal', 'Minimal lines']].map(([k, l]) => (
              <MenuItem key={k} active={(s.tableStyle || 'grid') === k} onClick={() => { close(); ed.setSettings({ tableStyle: k }); }}>{l}</MenuItem>
            ))}
          </Drop>
          <Big icon="Heading" label="Header row" active={s.tableHeader !== false} title="Emphasise the first row of every table" onClick={() => ed.setSettings({ tableHeader: s.tableHeader === false })} />
          <Big icon="Trash2" label="Delete table" onClick={() => ed.tableOp('deleteTable')} />
        </Group>
      </>
    ),
    picture: ed.imgSel ? (
      <>
        <Group label="Size">
          {['25%', '50%', '75%', '100%'].map((w) => (
            <TB key={w} label={'Width ' + w} wide className="txt" active={ed.imgSel.width === w} onClick={() => ed.imageWidth(w)}><span>{w}</span></TB>
          ))}
          <Big icon="RotateCcw" label="Original" active={!ed.imgSel.width} onClick={() => ed.imageWidth(false)} />
        </Group>
        <Group label="Position">
          <TB icon="AlignLeft" label="Align left" wide active={alignIs('left')} onClick={() => setAlign('left')} />
          <TB icon="AlignCenter" label="Center" wide active={alignIs('center')} onClick={() => setAlign('center')} />
          <TB icon="AlignRight" label="Align right" wide active={alignIs('right')} onClick={() => setAlign('right')} />
        </Group>
        <Group label="Picture">
          {ed.imgKind === 'equation' && <Big icon="Sigma" label="Edit equation" onClick={ed.editImageSpecial} />}
          {ed.imgKind === 'drawing' && <Big icon="PenTool" label="Edit drawing" onClick={ed.editImageSpecial} />}
          {ed.imgKind === 'image' && <Big icon="Captions" label="Alt text" onClick={() => ed.openDialog('alt')} />}
          <Big icon="ImageUp" label="Replace" onClick={() => replaceInput.current && replaceInput.current.click()} />
          <input ref={replaceInput} id="replace-image" type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files[0]; e.target.value = ''; ed.insertImageFile(fl, ed.imgSel.index); }} />
          <Big icon="Trash2" label="Delete" onClick={ed.deleteImage} />
        </Group>
      </>
    ) : null,
  };

  return (
    <div className="ribbon">
      <div className="rb-tabs" role="tablist" aria-label="Ribbon">
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
      <button type="button" aria-label={'Less ' + label} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(Math.max(0, value - 4))}><Icon name="Minus" size={12} /></button>
      <span className="tnum">{value}<small>px</small></span>
      <button type="button" aria-label={'More ' + label} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(Math.min(96, value + 4))}><Icon name="Plus" size={12} /></button>
    </span>
  );
}
