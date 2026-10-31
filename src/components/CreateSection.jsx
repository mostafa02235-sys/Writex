import React, { useState, useEffect, useRef } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, Seg, ConfirmDialog } from './ui.jsx';
import { SourcePicker } from './SourcePicker.jsx';
import { SlidesEditor, newSlide, THEMES } from './studio/SlidesEditor.jsx';
import { MindMapView, DiagramView, ChartView, InfographicView, CoverView, COVER_STYLES, svgToPng, nodeToPng, PALETTE } from './studio/visuals.jsx';
import { LearnTab } from './LearnTab.jsx';
import * as src from '../sources.js';
import * as db from '../db.js';
import * as store from '../store.js';
import * as learn from '../learn.js';
import { complete, clip, providerStatus, getAIConfig, aiErrorText } from '../ai.js';
import { fmtDate, uid, storage, saveFile, savedLabel, safeFilename, readFileAs, downscaleImage } from '../util.js';
import { textToDelta } from '../exporters.js';

const nd = (e) => e.preventDefault();

export const STUDIO = [
  { id: 'slides', label: 'Presentation', icon: 'Presentation', desc: 'Slides with layouts, themes and PPTX export' },
  { id: 'mindmap', label: 'Mind map', icon: 'Network', desc: 'Main ideas and branches at a glance' },
  { id: 'flashcards', label: 'Flashcards', icon: 'Layers', desc: 'A deck for spaced-repetition review', learn: true },
  { id: 'quiz', label: 'Quiz', icon: 'ListChecks', desc: 'Multiple choice, true/false and short answers', learn: true },
  { id: 'summary', label: 'Study summary', icon: 'NotebookText', desc: 'Short, medium or detailed' },
  { id: 'diagram', label: 'Diagram', icon: 'Workflow', desc: 'A process or structure as a flow' },
  { id: 'chart', label: 'Chart', icon: 'ChartColumn', desc: 'Numbers from the document as a chart' },
  { id: 'infographic', label: 'Infographic', icon: 'LayoutDashboard', desc: 'Key figures and points on one card' },
  { id: 'cover', label: 'Book cover', icon: 'BookImage', desc: 'Design a cover — no AI needed', noAI: true },
];

const SRC_RULES = (title, text) => `Use ONLY the document below. Do not add outside facts. Use the document's language (Arabic or English).\nDocument title: ${title}\nDocument:\n"""\n${text}\n"""\n\n`;
const PROMPTS = {
  slides: (o) => `Create a presentation of ${o.count} slides from the document. Slide 1 is a title slide. Each other slide has a short title and 3–5 concise bullet points, plus one sentence of speaker notes. Reply with only JSON: {"title":"","slides":[{"title":"","bullets":[""],"notes":""}]}`,
  mindmap: () => 'Build a mind map of the document: one central topic, 4–7 main branches, each with 2–5 short sub-points (max 6 words each). Reply with only JSON: {"center":"","branches":[{"label":"","children":[{"label":""}]}]}',
  diagram: () => 'Describe the main process, sequence or structure in the document as a diagram with at most 12 nodes (short labels) and the connections between them. Reply with only JSON: {"title":"","nodes":[{"id":"n1","label":""}],"edges":[{"from":"n1","to":"n2","label":""}]}',
  chart: () => 'Find numeric data in the document that suits a chart. Use only numbers that appear in the document. Reply with only JSON: {"found":true,"title":"","type":"bar","labels":[""],"series":[{"name":"","values":[0]}],"source":"exact short quote containing the numbers"}. type is bar, line or pie. If the document has no suitable numbers, reply {"found":false}.',
  infographic: () => 'Make an infographic from the document: a title, a one-line subtitle, 2–4 key figures that appear in the document (value + short label), and 3–5 key points. Reply with only JSON: {"title":"","subtitle":"","stats":[{"value":"","label":""}],"points":[""]}. If the document has no figures, use an empty stats list.',
  summary: (o) => ({ short: 'Write a short study summary: 3–4 sentences, then 3 key terms with one-line definitions.', medium: 'Write a study summary: one overview paragraph, 5–7 key points as a list, and a short list of key terms with definitions.', detailed: 'Write a detailed study summary that follows the document section by section, with key points and definitions under each part, and finish with 3 review questions.' }[o.length || 'medium']),
};

function blankFor(type, title) {
  if (type === 'slides') return { title: title || 'Presentation', theme: 'midnight', slides: [{ ...newSlide('title'), title: title || 'Presentation' }, newSlide()] };
  if (type === 'cover') return { title: title || '', subtitle: '', author: '', kicker: '', style: 'classic', color: '#1F3A5F', image: null };
  if (type === 'mindmap') return { center: title || 'Topic', branches: [] };
  if (type === 'diagram') return { title: title || '', nodes: [], edges: [] };
  if (type === 'chart') return { title: title || 'Chart', type: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'Series 1', values: [1, 2, 3] }] };
  if (type === 'infographic') return { title: title || '', subtitle: '', stats: [], points: [], color: PALETTE[0] };
  return { text: '' };
}

/* ---------- small editors ---------- */
function OutlineEditor({ data, onChange }) {
  const set = (branches) => onChange({ ...data, branches });
  const br = data.branches || [];
  return (
    <div className="form-stack">
      <label className="field"><span>Central topic</span><input id="mm-center" dir="auto" value={data.center || ''} onChange={(e) => onChange({ ...data, center: e.target.value })} /></label>
      {br.map((b, i) => (
        <div key={i} className="outline-branch" style={{ '--bc': PALETTE[i % PALETTE.length] }}>
          <div className="ob-row">
            <input dir="auto" value={b.label} aria-label={'Branch ' + (i + 1)} onChange={(e) => set(br.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <button type="button" className="tb" aria-label="Remove branch" onClick={() => set(br.filter((_, j) => j !== i))}><Icon name="X" size={16} /></button>
          </div>
          <textarea dir="auto" rows={Math.max(2, (b.children || []).length)} aria-label={'Points under ' + b.label} value={(b.children || []).map((c) => c.label).join('\n')}
            onChange={(e) => set(br.map((x, j) => (j === i ? { ...x, children: e.target.value.split('\n').map((l) => ({ label: l })) } : x)))} placeholder="One point per line" />
        </div>
      ))}
      <button type="button" className="btn" disabled={br.length >= 8} onClick={() => set([...br, { label: 'New branch', children: [] }])}><Icon name="Plus" size={16} />Add branch</button>
    </div>
  );
}

function DiagramEditor({ data, onChange }) {
  const nodes = data.nodes || [];
  const text = (data.edges || []).map((e) => { const a = nodes.find((n) => n.id === e.from); const b = nodes.find((n) => n.id === e.to); return a && b ? `${a.label} -> ${b.label}${e.label ? ' : ' + e.label : ''}` : ''; }).filter(Boolean).join('\n');
  const [val, setVal] = useState(text || nodes.map((n) => n.label).join('\n'));
  const apply = (v) => {
    setVal(v);
    const ns = []; const es = [];
    const idFor = (label) => { const l = label.trim(); if (!l) return null; let n = ns.find((x) => x.label === l); if (!n) { n = { id: 'n' + (ns.length + 1), label: l }; ns.push(n); } return n.id; };
    for (const line of v.split('\n')) {
      const m = line.split('->');
      if (m.length >= 2) {
        const [toPart, lbl] = m[1].split(':');
        const a = idFor(m[0]); const b = idFor(toPart);
        if (a && b) es.push({ from: a, to: b, label: (lbl || '').trim() });
      } else idFor(line);
    }
    onChange({ ...data, nodes: ns, edges: es });
  };
  return (
    <div className="form-stack">
      <label className="field"><span>Title</span><input id="dg-title" dir="auto" value={data.title || ''} onChange={(e) => onChange({ ...data, title: e.target.value })} /></label>
      <label className="field"><span>Steps and links</span><textarea id="dg-text" dir="auto" rows={7} value={val} onChange={(e) => apply(e.target.value)} placeholder={'Start -> Step two\nStep two -> Finish : when ready'} /></label>
      <p className="hint">Write one link per line as <code>A -&gt; B</code>, optionally <code>: label</code>. A line without an arrow adds a box.</p>
    </div>
  );
}

function ChartEditor({ data, onChange }) {
  const labels = data.labels || [];
  const series = data.series || [];
  const setCell = (si, i, v) => onChange({ ...data, series: series.map((s, j) => (j === si ? { ...s, values: labels.map((_, k) => (k === i ? v : (s.values || [])[k])) } : s)) });
  return (
    <div className="form-stack">
      <label className="field"><span>Title</span><input id="ch-title" dir="auto" value={data.title || ''} onChange={(e) => onChange({ ...data, title: e.target.value })} /></label>
      <Seg label="Chart type" value={data.type || 'bar'} onChange={(v) => onChange({ ...data, type: v })} options={[{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }, { value: 'pie', label: 'Pie' }]} />
      <div className="tbl-wrap">
        <table className="data-tbl">
          <thead><tr><th>Label</th>{series.map((s, si) => <th key={si}><input dir="auto" value={s.name || ''} aria-label="Series name" onChange={(e) => onChange({ ...data, series: series.map((x, j) => (j === si ? { ...x, name: e.target.value } : x)) })} /></th>)}</tr></thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={i}>
                <td><input dir="auto" value={l} aria-label={'Label ' + (i + 1)} onChange={(e) => onChange({ ...data, labels: labels.map((x, k) => (k === i ? e.target.value : x)) })} /></td>
                {series.map((s, si) => <td key={si}><input inputMode="decimal" value={(s.values || [])[i] ?? ''} aria-label={'Value ' + (i + 1)} onChange={(e) => setCell(si, i, e.target.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ai-actions">
        <button type="button" className="btn sm" onClick={() => onChange({ ...data, labels: [...labels, ''], series: series.map((s) => ({ ...s, values: [...(s.values || []), 0] })) })}><Icon name="Plus" size={14} />Row</button>
        <button type="button" className="btn sm" disabled={labels.length <= 1} onClick={() => onChange({ ...data, labels: labels.slice(0, -1), series: series.map((s) => ({ ...s, values: (s.values || []).slice(0, -1) })) })}>Remove row</button>
        <button type="button" className="btn sm" disabled={series.length >= 4} onClick={() => onChange({ ...data, series: [...series, { name: 'Series ' + (series.length + 1), values: labels.map(() => 0) }] })}><Icon name="Plus" size={14} />Series</button>
      </div>
      {data.source && <p className="hint">Numbers from: “{data.source}”</p>}
    </div>
  );
}

function InfographicEditor({ data, onChange }) {
  const stats = data.stats || [];
  return (
    <div className="form-stack">
      <label className="field"><span>Title</span><input id="ig-title" dir="auto" value={data.title || ''} onChange={(e) => onChange({ ...data, title: e.target.value })} /></label>
      <label className="field"><span>Subtitle</span><input id="ig-sub" dir="auto" value={data.subtitle || ''} onChange={(e) => onChange({ ...data, subtitle: e.target.value })} /></label>
      {stats.map((s, i) => (
        <div key={i} className="grid-2">
          <label className="field"><span>Figure {i + 1}</span><input dir="auto" value={s.value} onChange={(e) => onChange({ ...data, stats: stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} /></label>
          <label className="field"><span>Label</span><input dir="auto" value={s.label} onChange={(e) => onChange({ ...data, stats: stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></label>
        </div>
      ))}
      <div className="ai-actions">
        <button type="button" className="btn sm" disabled={stats.length >= 6} onClick={() => onChange({ ...data, stats: [...stats, { value: '0', label: 'Label' }] })}><Icon name="Plus" size={14} />Figure</button>
        {stats.length > 0 && <button type="button" className="btn sm" onClick={() => onChange({ ...data, stats: stats.slice(0, -1) })}>Remove figure</button>}
      </div>
      <label className="field"><span>Key points (one per line)</span><textarea id="ig-points" dir="auto" rows={5} value={(data.points || []).join('\n')} onChange={(e) => onChange({ ...data, points: e.target.value.split('\n') })} /></label>
      <div className="mswatches">{PALETTE.map((c) => <button type="button" key={c} className={'msw' + (data.color === c ? ' on' : '')} style={{ background: c }} aria-label={'Colour ' + c} onClick={() => onChange({ ...data, color: c })} />)}</div>
    </div>
  );
}

function CoverEditor({ data, onChange }) {
  const img = useRef(null);
  return (
    <div className="form-stack">
      <Seg label="Style" value={data.style} onChange={(v) => onChange({ ...data, style: v })} options={COVER_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
      <label className="field"><span>Title</span><input id="bc-title" dir="auto" value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} /></label>
      <label className="field"><span>Subtitle</span><input id="bc-sub" dir="auto" value={data.subtitle} onChange={(e) => onChange({ ...data, subtitle: e.target.value })} /></label>
      <div className="grid-2">
        <label className="field"><span>Author</span><input id="bc-author" dir="auto" value={data.author} onChange={(e) => onChange({ ...data, author: e.target.value })} /></label>
        <label className="field"><span>Top line</span><input id="bc-kicker" dir="auto" value={data.kicker} placeholder="e.g. A novel" onChange={(e) => onChange({ ...data, kicker: e.target.value })} /></label>
      </div>
      <div className="mswatches">{['#1F3A5F', '#0B0F19', '#7A1F2B', '#1E5B4A', '#5B3A8E', '#B5651D', '#E8E1D3', '#2545C4'].map((c) => <button type="button" key={c} className={'msw' + (data.color === c ? ' on' : '')} style={{ background: c }} aria-label={'Colour ' + c} onClick={() => onChange({ ...data, color: c })} />)}</div>
      <div className="ai-actions">
        <button type="button" className="btn" onClick={() => img.current && img.current.click()}><Icon name="ImagePlus" size={16} />{data.image ? 'Replace photo' : 'Background photo'}</button>
        {data.image && <button type="button" className="btn ghost" onClick={() => onChange({ ...data, image: null, style: data.style === 'photo' ? 'classic' : data.style })}>Remove photo</button>}
      </div>
      <input ref={img} id="bc-img" type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const url = await downscaleImage(await readFileAs(f, 'dataurl'), 1600); onChange({ ...data, image: url, style: 'photo' }); }} />
    </div>
  );
}

/* ---------- full-screen editor for one creation ---------- */
function StudioPage({ creation, onClose, onSaved, toast, openDoc }) {
  const [c, setC] = useState(creation);
  const [dirty, setDirty] = useState(!creation.savedAt);
  const svgRef = useRef(null);
  const nodeRef = useRef(null);
  const meta = STUDIO.find((s) => s.id === c.type);
  const setData = (data) => { setC((x) => ({ ...x, data })); setDirty(true); };
  const save = async () => {
    const v = { ...c, title: c.type === 'slides' ? c.data.title || c.title : c.title, savedAt: Date.now(), updatedAt: Date.now() };
    await db.put('creations', v); setC(v); setDirty(false); onSaved(); toast('Saved to My creations');
  };
  const png = async () => {
    try {
      const r = c.type === 'infographic' || c.type === 'cover' ? await nodeToPng(nodeRef.current, 2) : await svgToPng(svgRef.current, 2);
      const res = await saveFile(safeFilename(c.title || meta.label, 'png'), r.blob);
      if (res === 'saved') toast(savedLabel('Image ready'));
      return r;
    } catch (e) { toast('Export failed: ' + e.message, 'error'); return null; }
  };
  const toDoc = async () => {
    try {
      let delta;
      if (c.type === 'summary') delta = textToDelta(c.data.text);
      else {
        const r = c.type === 'infographic' || c.type === 'cover' ? await nodeToPng(nodeRef.current, 2) : await svgToPng(svgRef.current, 2);
        delta = {};
        delta.ops = [{ insert: c.title }, { insert: '\n', attributes: { header: 1, dir: 'auto' } }, { insert: { image: r.url }, attributes: { width: Math.min(r.w, 620) + 'px' } }, { insert: '\n', attributes: { dir: 'auto', align: 'center' } }];
      }
      const d = await store.createDoc({ title: c.title || meta.label, delta });
      toast('Saved to Write'); openDoc(d.id);
    } catch (e) { toast('Could not create the document: ' + e.message, 'error'); }
  };

  let preview = null; let editor = null;
  if (c.type === 'slides') editor = <SlidesEditor deck={c.data} onChange={setData} toast={toast} />;
  if (c.type === 'mindmap') { preview = <MindMapView data={c.data} svgRef={svgRef} />; editor = <OutlineEditor data={c.data} onChange={setData} />; }
  if (c.type === 'diagram') { preview = <DiagramView data={c.data} svgRef={svgRef} />; editor = <DiagramEditor data={c.data} onChange={setData} />; }
  if (c.type === 'chart') { preview = <ChartView data={c.data} svgRef={svgRef} />; editor = <ChartEditor data={c.data} onChange={setData} />; }
  if (c.type === 'infographic') { preview = <InfographicView data={c.data} nodeRef={nodeRef} />; editor = <InfographicEditor data={c.data} onChange={setData} />; }
  if (c.type === 'cover') { preview = <CoverView data={c.data} nodeRef={nodeRef} />; editor = <CoverEditor data={c.data} onChange={setData} />; }
  if (c.type === 'summary') editor = <textarea className="sum-text" id="sum-text" dir="auto" value={c.data.text} onChange={(e) => setData({ ...c.data, text: e.target.value })} aria-label="Summary text" />;

  return window.ReactDOM.createPortal(
    <div className="studio-page" role="dialog" aria-label={meta.label}>
      <header className="think-bar">
        <button type="button" data-close className="tb lg" aria-label="Close" onClick={onClose}><Icon name="X" size={22} /></button>
        <div className="m-title">
          <input className="studio-title" id="studio-title" dir="auto" value={c.title} aria-label="Name" onChange={(e) => { setC({ ...c, title: e.target.value }); setDirty(true); }} />
          <span className="m-sub">{meta.label}{c.sourceTitle ? ' · from ' + c.sourceTitle : ''}{dirty ? ' · not saved' : ''}</span>
        </div>
        <button type="button" className="btn sm primary" disabled={!dirty} onClick={save}><Icon name="Save" size={15} />Save</button>
      </header>
      <div className="studio-body">
        {preview && <div className="studio-preview">{preview}</div>}
        <div className="studio-edit">
          {c.note && <div className="ai-status warn"><Icon name="Info" size={16} /><span>{c.note}</span></div>}
          {editor}
          {c.type !== 'slides' && (
            <div className="ai-actions">
              {c.type !== 'summary' && <button type="button" className="btn" onClick={png}><Icon name="Download" size={16} />PNG image</button>}
              <button type="button" className="btn" onClick={toDoc}><Icon name="FilePlus2" size={16} />Save as document</button>
            </div>
          )}
        </div>
      </div>
    </div>, document.body);
}

/* ---------- section ---------- */
export function CreateSection({ toast, openDoc, openSettings }) {
  const [tab, setTabState] = useState(() => storage.get('writex.createTab', 'studio'));
  const setTab = (t) => { setTabState(t); storage.set('writex.createTab', t); };
  const [creations, setCreations] = useState([]);
  const [flow, setFlow] = useState(null); // {type, source, opts}
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(null);
  const [status, setStatus] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [learnOpen, setLearnOpen] = useState(null);
  const ctl = useRef(null);

  const refresh = async () => { try { setCreations((await db.getAll('creations')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))); } catch (e) { setCreations([]); } };
  useEffect(() => { refresh(); providerStatus(getAIConfig()).then(setStatus); }, []);

  const start = (type) => {
    const t = STUDIO.find((s) => s.id === type);
    setFlow({ type, source: null, opts: { count: 8, length: 'medium', cards: 15, questions: 10, difficulty: 'medium', types: ['mcq', 'tf', 'short'] }, meta: t });
  };
  const generate = async (blank) => {
    const { type, source, opts } = flow;
    if (blank) {
      setFlow(null);
      setPage({ id: uid('cr'), type, title: type === 'slides' ? 'New presentation' : type === 'cover' ? 'Book cover' : STUDIO.find((s) => s.id === type).label, data: blankFor(type, source && source.title), sourceTitle: source && source.title, createdAt: Date.now() });
      return;
    }
    if (!source) return;
    if (type === 'flashcards' || type === 'quiz') { setFlow(null); setTab('learn'); setLearnOpen({ create: type, source, opts, t: Date.now() }); return; }
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const r = await src.sourceText(source);
      const cl = clip(r.text, 100000);
      if (!cl.text.trim()) throw new Error('This document has no text yet.');
      const prompt = SRC_RULES(r.title, cl.text) + 'Task: ' + PROMPTS[type](opts);
      let data; let note = cl.clipped ? `Made from the first ${cl.text.length.toLocaleString()} of ${cl.total.toLocaleString()} characters.` : '';
      if (type === 'summary') { const out = await complete({ prompt, signal: ctl.current.signal }); data = { text: out.text, length: opts.length }; }
      else {
        data = await complete({ prompt, json: true, signal: ctl.current.signal });
        if (type === 'slides') data = { title: data.title || r.title, theme: 'midnight', slides: (data.slides || []).map((s, i) => ({ ...newSlide(i === 0 ? 'title' : 'bullets'), title: s.title || '', bullets: (s.bullets || []).filter(Boolean), notes: s.notes || '' })) };
        if (type === 'chart') {
          if (!data || data.found === false || !(data.labels || []).length) { toast('No numbers suitable for a chart were found in this document. You can still build one by hand.', 'error'); data = blankFor('chart', r.title); note = 'This document had no chart-ready numbers, so this is a blank chart to fill in.'; }
          else if (data.source && !learn.grounded({ source: data.source }, r.text)) note = (note + ' Check these numbers: their quoted source was not found word-for-word in the document.').trim();
        }
        if (type === 'infographic') data = { ...blankFor('infographic'), ...data };
        if (type === 'mindmap') data = { center: data.center || r.title, branches: (data.branches || []).map((b) => ({ label: b.label, children: (b.children || []).map((c) => ({ label: typeof c === 'string' ? c : c.label })) })) };
        if (type === 'diagram') data = { title: data.title || '', nodes: (data.nodes || []).map((n) => ({ id: String(n.id), label: n.label })), edges: (data.edges || []).map((e) => ({ from: String(e.from), to: String(e.to), label: e.label || '' })) };
      }
      setFlow(null);
      setPage({ id: uid('cr'), type, title: (type === 'slides' ? data.title : STUDIO.find((s) => s.id === type).label + ' · ' + r.title), data, note, sourceTitle: r.title, source, createdAt: Date.now() });
    } catch (e) { if (!e || e.code !== 'cancelled') toast(aiErrorText(e), 'error'); }
    finally { setBusy(false); }
  };

  const f = flow;
  const aiOk = status && status.ready;
  return (
    <div className="sec-shell">
      <main className="lib-main">
        <div className="lib-inner">
          <header className="sec-top">
            <h1>Create</h1>
            <div className="sec-top-actions"><button type="button" className="tb lg" aria-label="Settings" onClick={openSettings}><Icon name="Settings" size={20} /></button></div>
          </header>
          <div className="subtabs" role="tablist" aria-label="Create">
            <button type="button" role="tab" aria-selected={tab === 'studio'} className={'subtab' + (tab === 'studio' ? ' on' : '')} onClick={() => setTab('studio')}><Icon name="Shapes" size={16} />Studio</button>
            <button type="button" role="tab" aria-selected={tab === 'learn'} className={'subtab' + (tab === 'learn' ? ' on' : '')} onClick={() => setTab('learn')}><Icon name="GraduationCap" size={16} />Learn</button>
          </div>
          {tab === 'learn' ? <LearnTab toast={toast} request={learnOpen} aiOk={aiOk} aiMessage={status && status.message} /> : (
            <>
              <p className="sec-lead">Turn any document into slides, visuals or study material. You can edit everything before saving or exporting.</p>
              {status && !status.ready && <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{status.message} Book covers and blank presentations still work.</span></div>}
              <div className="studio-grid">
                {STUDIO.map((t) => (
                  <button type="button" key={t.id} className="studio-tile" onClick={() => start(t.id)}>
                    <span className="st-ico"><Icon name={t.icon} size={22} /></span>
                    <b>{t.label}</b><span>{t.desc}</span>
                  </button>
                ))}
              </div>
              <section className="sec">
                <div className="sec-head"><h2>My creations</h2></div>
                {!creations.length ? <p className="mnote">Saved presentations, mind maps, charts and designs appear here.</p> : (
                  <div className="drows">
                    {creations.map((c) => {
                      const m = STUDIO.find((s) => s.id === c.type) || STUDIO[0];
                      return (
                        <article key={c.id} className="drow">
                          <button type="button" className="drow-main" onClick={() => setPage(c)}>
                            <span className="ftype t-doc"><Icon name={m.icon} size={20} /><b>{m.label}</b></span>
                            <span className="drow-text"><span className="drow-title" dir="auto">{c.title}</span><span className="drow-meta">{fmtDate(c.updatedAt || c.createdAt)}{c.sourceTitle ? ' · from ' + c.sourceTitle : ''}</span></span>
                          </button>
                          <button type="button" className="tb lg" aria-label={'Delete ' + c.title} onClick={() => setConfirm(c)}><Icon name="Trash2" size={18} /></button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <Sheet open={!!f} onClose={() => { if (ctl.current) ctl.current.abort(); setFlow(null); }} title={f ? f.meta.label : ''} className="sheet-tall">
        {f && (
          <>
            {!f.meta.noAI && (
              <section className="msec">
                <h3>From document</h3>
                <SourcePicker value={f.source} onPick={(s) => setFlow({ ...f, source: s })} />
              </section>
            )}
            {f.type === 'slides' && <section className="msec"><h3>Slides</h3><div className="mchips">{[5, 8, 12, 16].map((n) => <button type="button" key={n} className={'mchip' + (f.opts.count === n ? ' on' : '')} onMouseDown={nd} onClick={() => setFlow({ ...f, opts: { ...f.opts, count: n } })}>{n}</button>)}</div></section>}
            {f.type === 'summary' && <section className="msec"><h3>Length</h3><Seg label="Summary length" value={f.opts.length} onChange={(v) => setFlow({ ...f, opts: { ...f.opts, length: v } })} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'detailed', label: 'Detailed' }]} /></section>}
            {(f.type === 'flashcards' || f.type === 'quiz') && (
              <section className="msec"><h3>Difficulty</h3><Seg label="Difficulty" value={f.opts.difficulty} onChange={(v) => setFlow({ ...f, opts: { ...f.opts, difficulty: v } })} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
                <h3>{f.type === 'quiz' ? 'Questions' : 'Cards'}</h3>
                <div className="mchips">{[5, 10, 15, 25].map((n) => <button type="button" key={n} className={'mchip' + ((f.type === 'quiz' ? f.opts.questions : f.opts.cards) === n ? ' on' : '')} onMouseDown={nd} onClick={() => setFlow({ ...f, opts: { ...f.opts, [f.type === 'quiz' ? 'questions' : 'cards']: n } })}>{n}</button>)}</div>
                {f.type === 'quiz' && (<><h3>Question types</h3><div className="mchips">{[['mcq', 'Multiple choice'], ['tf', 'True / false'], ['short', 'Short answer']].map(([k, l]) => { const on = f.opts.types.includes(k); return <button type="button" key={k} className={'mchip' + (on ? ' on' : '')} onMouseDown={nd} onClick={() => setFlow({ ...f, opts: { ...f.opts, types: on ? f.opts.types.filter((x) => x !== k) || [] : [...f.opts.types, k] } })}>{l}</button>; })}</div></>)}
              </section>
            )}
            <div className="ai-actions" style={{ marginTop: 18 }}>
              {!f.meta.noAI && <button type="button" className="btn primary" disabled={!f.source || busy || !aiOk || (f.type === 'quiz' && !f.opts.types.length)} onClick={() => generate(false)}>{busy ? <><span className="spin" />Working…</> : <><Icon name="Sparkles" size={16} />Generate</>}</button>}
              {busy && <button type="button" className="btn" onClick={() => ctl.current && ctl.current.abort()}>Stop</button>}
              {['slides', 'cover', 'mindmap', 'diagram', 'chart', 'infographic'].includes(f.type) && <button type="button" className={'btn' + (f.meta.noAI ? ' primary' : '')} onClick={() => generate(true)}>{f.meta.noAI ? 'Start designing' : 'Start blank'}</button>}
            </div>
            {!aiOk && !f.meta.noAI && status && <p className="mnote">{status.message}</p>}
          </>
        )}
      </Sheet>
      {page && <StudioPage creation={page} toast={toast} openDoc={openDoc} onSaved={refresh} onClose={() => { setPage(null); refresh(); }} />}
      {confirm && <ConfirmDialog title="Delete creation?" message={`“${confirm.title}” will be removed.`} onClose={() => setConfirm(null)} onConfirm={async () => { await db.del('creations', confirm.id); refresh(); }} />}
    </div>
  );
}
