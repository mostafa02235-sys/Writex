import React, { useState, useEffect, useRef } from '../../react.js';
import { Icon } from '../../icons.jsx';
import { Seg } from '../ui.jsx';
import { loadScript, uid, AR_RE, readFileAs, downscaleImage, saveFile, savedLabel, safeFilename } from '../../util.js';
import { libUrls } from '../../vendor.js';
import { tr } from '../../i18n.js';

export const THEMES = {
  midnight: { label: tr('Midnight'), bg: '#0B0F19', ink: '#FFFFFF', sub: '#A9B4CC', accent: '#8EA5FF' },
  paper: { label: tr('Paper'), bg: '#FFFFFF', ink: '#111827', sub: '#4B5563', accent: '#2545C4' },
  ink: { label: tr('Ink'), bg: '#17306B', ink: '#FFFFFF', sub: '#C9D4F5', accent: '#FFD166' },
  sand: { label: tr('Sand'), bg: '#F3EDE2', ink: '#3B2F22', sub: '#6E5D49', accent: '#B5651D' },
  mint: { label: tr('Mint'), bg: '#E8F5EF', ink: '#0F3D2E', sub: '#3E6B5A', accent: '#13895F' },
};
export const LAYOUTS = [
  { id: 'title', label: tr('Title') }, { id: 'bullets', label: tr('Bullets') }, { id: 'two', label: tr('Two columns') }, { id: 'image', label: tr('Image + text') }, { id: 'quote', label: tr('Quote') },
];
const isAr = (s) => AR_RE.test(String(s || ''));
export const newSlide = (layout = 'bullets') => ({ id: uid('sl'), layout, title: '', bullets: [], notes: '', image: null });

export function SlideView({ slide, theme, scale }) {
  const t = THEMES[theme] || THEMES.midnight;
  const rtl = isAr(slide.title + ' ' + (slide.bullets || []).join(' '));
  const half = Math.ceil((slide.bullets || []).length / 2);
  return (
    <div className="slide-box" style={{ '--sc': scale }}>
      <div className={'slide sl-' + slide.layout} dir={rtl ? 'rtl' : 'ltr'} style={{ background: t.bg, color: t.ink, '--acc': t.accent, '--sub': t.sub }}>
        {slide.layout === 'title' && (<><span className="sl-rule" /><h1>{slide.title || tr('Title')}</h1>{slide.bullets[0] && <p className="sl-sub">{slide.bullets[0]}</p>}</>)}
        {slide.layout === 'quote' && (<><span className="sl-mark">“</span><blockquote>{slide.bullets[0] || slide.title}</blockquote>{slide.bullets[0] && slide.title && <cite>— {slide.title}</cite>}</>)}
        {['bullets', 'two', 'image'].includes(slide.layout) && (
          <>
            <h2>{slide.title || tr('Slide title')}</h2>
            <div className="sl-body">
              {slide.layout === 'two' ? (
                <><ul>{slide.bullets.slice(0, half).map((b, i) => <li key={i}>{b}</li>)}</ul><ul>{slide.bullets.slice(half).map((b, i) => <li key={i}>{b}</li>)}</ul></>
              ) : <ul>{slide.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              {slide.layout === 'image' && (slide.image ? <img src={slide.image} alt="" /> : <div className="sl-img-ph">{tr('Image')}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function useBoxScale() {
  const ref = useRef(null);
  const [k, setK] = useState(0.4);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const set = () => setK(el.clientWidth / 960);
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, k];
}

function Thumb({ slide, theme, active, n, onClick }) {
  const [ref, k] = useBoxScale();
  return <button type="button" ref={ref} className={'sl-thumb' + (active ? ' on' : '')} onClick={onClick} aria-label={tr('Slide {0}', n)}><SlideView slide={slide} theme={theme} scale={k} /><span>{n}</span></button>;
}

export async function exportPptx(deck) {
  await loadScript(libUrls('pptxgen.js', ['https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js', 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js']), () => !!window.PptxGenJS);
  const t = THEMES[deck.theme] || THEMES.midnight;
  const hex = (c) => c.replace('#', '');
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title || tr('Presentation');
  for (const s of deck.slides) {
    const sl = pptx.addSlide();
    sl.background = { color: hex(t.bg) };
    const rtl = isAr(s.title + ' ' + s.bullets.join(' '));
    const base = { color: hex(t.ink), fontFace: rtl ? 'Arial' : 'Calibri', rtlMode: rtl || undefined, lang: rtl ? 'ar-SA' : 'en-US', align: rtl ? 'right' : 'left' };
    if (s.layout === 'title') {
      sl.addShape(pptx.ShapeType.rect, { x: rtl ? 11.6 : 0.9, y: 2.4, w: 0.9, h: 0.08, fill: { color: hex(t.accent) }, line: { color: hex(t.accent) } });
      sl.addText(s.title || '', { ...base, x: 0.9, y: 2.6, w: 11.5, h: 1.6, fontSize: 44, bold: true });
      if (s.bullets[0]) sl.addText(s.bullets[0], { ...base, x: 0.9, y: 4.2, w: 11.5, h: 0.9, fontSize: 22, color: hex(t.sub) });
    } else if (s.layout === 'quote') {
      sl.addText(s.bullets[0] || s.title || '', { ...base, x: 1.2, y: 1.8, w: 10.9, h: 3, fontSize: 32, italic: true, align: 'center' });
      if (s.bullets[0] && s.title) sl.addText('— ' + s.title, { ...base, x: 1.2, y: 5, w: 10.9, h: 0.6, fontSize: 18, color: hex(t.sub), align: 'center' });
    } else {
      sl.addText(s.title || '', { ...base, x: 0.7, y: 0.45, w: 11.9, h: 1, fontSize: 32, bold: true });
      const bullets = (list) => list.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } }));
      const body = { ...base, fontSize: 20, valign: 'top', paraSpaceAfter: 8, color: hex(t.ink) };
      if (s.layout === 'two') {
        const half = Math.ceil(s.bullets.length / 2);
        sl.addText(bullets(s.bullets.slice(0, half)), { ...body, x: rtl ? 6.8 : 0.7, y: 1.6, w: 5.8, h: 5.2 });
        sl.addText(bullets(s.bullets.slice(half)), { ...body, x: rtl ? 0.7 : 6.8, y: 1.6, w: 5.8, h: 5.2 });
      } else if (s.layout === 'image') {
        sl.addText(bullets(s.bullets), { ...body, x: rtl ? 6.6 : 0.7, y: 1.6, w: 6, h: 5.2 });
        if (s.image) sl.addImage({ data: s.image, x: rtl ? 0.7 : 7, y: 1.6, w: 5.6, h: 4.6, sizing: { type: 'contain', w: 5.6, h: 4.6 } });
      } else sl.addText(bullets(s.bullets), { ...body, x: 0.7, y: 1.6, w: 11.9, h: 5.2 });
    }
    if (s.notes) sl.addNotes(s.notes);
  }
  return pptx.write({ outputType: 'blob' });
}

export function SlidesEditor({ deck, onChange, toast }) {
  const [cur, setCur] = useState(0);
  const [present, setPresent] = useState(null);
  const [mainRef, k] = useBoxScale();
  const img = useRef(null);
  const slides = deck.slides;
  const s = slides[Math.min(cur, slides.length - 1)] || null;
  const set = (patch) => onChange({ ...deck, slides: slides.map((x, i) => (i === cur ? { ...x, ...patch } : x)) });
  const move = (d) => {
    const j = cur + d; if (j < 0 || j >= slides.length) return;
    const n = [...slides]; [n[cur], n[j]] = [n[j], n[cur]];
    onChange({ ...deck, slides: n }); setCur(j);
  };
  const add = () => { const n = [...slides]; n.splice(cur + 1, 0, newSlide()); onChange({ ...deck, slides: n }); setCur(cur + 1); };
  const dup = () => { const n = [...slides]; n.splice(cur + 1, 0, { ...s, id: uid('sl') }); onChange({ ...deck, slides: n }); setCur(cur + 1); };
  const del = () => { if (slides.length <= 1) return; const n = slides.filter((_, i) => i !== cur); onChange({ ...deck, slides: n }); setCur(Math.max(0, cur - 1)); };
  const pickImage = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const url = await downscaleImage(await readFileAs(f, 'dataurl'), 1400); set({ image: url, layout: 'image' }); };
  const doExport = async () => {
    const busy = toast(tr('Building PowerPoint file…'), 'busy');
    try { const blob = await exportPptx(deck); busy.close(); const r = await saveFile(safeFilename(deck.title || tr('Presentation'), 'pptx'), blob); if (r === 'saved') toast(savedLabel(tr('PowerPoint file ready'))); } catch (e) { busy.close(); toast(tr('Export failed: {0}', e.message || e), 'error'); }
  };
  useEffect(() => {
    if (present == null) return undefined;
    const k2 = (e) => { if (e.key === 'ArrowRight' || e.key === ' ') setPresent((p) => Math.min(slides.length - 1, p + 1)); if (e.key === 'ArrowLeft') setPresent((p) => Math.max(0, p - 1)); if (e.key === 'Escape') setPresent(null); };
    window.addEventListener('keydown', k2); return () => window.removeEventListener('keydown', k2);
  }, [present, slides.length]);
  const touch = useRef(null);

  return (
    <div className="slides-ed">
      <div className="sl-tools">
        <input className="sl-deck-title" id="deck-title" dir="auto" value={deck.title || ''} placeholder={tr('Presentation title')} onChange={(e) => onChange({ ...deck, title: e.target.value })} aria-label={tr('Presentation title')} />
        <div className="mchips">
          {Object.entries(THEMES).map(([id, t]) => <button type="button" key={id} className={'mchip theme-chip' + (deck.theme === id ? ' on' : '')} onClick={() => onChange({ ...deck, theme: id })}><i style={{ background: t.bg, borderColor: t.accent }} />{t.label}</button>)}
        </div>
      </div>
      <div className="sl-main" ref={mainRef}>{s && <SlideView slide={s} theme={deck.theme} scale={k} />}</div>
      <div className="sl-actions">
        <button type="button" className="tb lg" aria-label={tr('Move slide earlier')} disabled={cur === 0} onClick={() => move(-1)}><Icon name="ArrowUp" size={18} /></button>
        <button type="button" className="tb lg" aria-label={tr('Move slide later')} disabled={cur >= slides.length - 1} onClick={() => move(1)}><Icon name="ArrowDown" size={18} /></button>
        <button type="button" className="tb lg" aria-label={tr('Duplicate slide')} onClick={dup}><Icon name="Copy" size={18} /></button>
        <button type="button" className="tb lg" aria-label={tr('Delete slide')} disabled={slides.length <= 1} onClick={del}><Icon name="Trash2" size={18} /></button>
        <span className="grow" />
        <button type="button" className="btn sm" onClick={() => setPresent(cur)}><Icon name="Play" size={15} />{tr('Present')}</button>
        <button type="button" className="btn sm primary" onClick={doExport}><Icon name="Download" size={15} />{tr('PPTX')}</button>
      </div>
      <div className="sl-strip">
        {slides.map((x, i) => <Thumb key={x.id} slide={x} theme={deck.theme} n={i + 1} active={i === cur} onClick={() => setCur(i)} />)}
        <button type="button" className="sl-add" onClick={add} aria-label={tr('Add slide')}><Icon name="Plus" size={22} /></button>
      </div>
      {s && (
        <div className="form-stack sl-form">
          <Seg label={tr('Layout')} value={s.layout} onChange={(v) => set({ layout: v })} options={LAYOUTS.map((l) => ({ value: l.id, label: l.label }))} />
          <label className="field"><span>{s.layout === 'quote' ? tr('Attribution') : tr('Title')}</span><input id="sl-title" dir="auto" value={s.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="field"><span>{s.layout === 'title' ? tr('Subtitle') : s.layout === 'quote' ? tr('Quote') : tr('Points (one per line)')}</span>
            <textarea id="sl-bullets" dir="auto" rows={s.layout === 'title' || s.layout === 'quote' ? 2 : 5} value={(s.bullets || []).join('\n')} onChange={(e) => set({ bullets: e.target.value.split('\n') })} /></label>
          {s.layout === 'image' && <div className="ai-actions"><button type="button" className="btn" onClick={() => img.current && img.current.click()}><Icon name="ImagePlus" size={16} />{s.image ? tr('Replace image') : tr('Add image')}</button>{s.image && <button type="button" className="btn ghost" onClick={() => set({ image: null })}>{tr('Remove image')}</button>}</div>}
          <input ref={img} id="sl-img" type="file" accept="image/*" hidden onChange={pickImage} />
          <label className="field"><span>{tr('Speaker notes')}</span><textarea id="sl-notes" dir="auto" rows={2} value={s.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></label>
        </div>
      )}
      {present != null && window.ReactDOM.createPortal(
        <div className="present" onClick={() => setPresent((p) => Math.min(slides.length - 1, p + 1))}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current || 0); if (Math.abs(dx) > 50) { e.preventDefault(); setPresent((p) => Math.max(0, Math.min(slides.length - 1, p + (dx < 0 ? 1 : -1)))); } }}>
          <PresentSlide slide={slides[present]} theme={deck.theme} />
          <div className="present-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tb lg" aria-label={tr('Previous slide')} onClick={() => setPresent((p) => Math.max(0, p - 1))}><Icon name="ChevronLeft" size={22} /></button>
            <span className="tnum">{present + 1} / {slides.length}</span>
            <button type="button" className="tb lg" aria-label={tr('Next slide')} onClick={() => setPresent((p) => Math.min(slides.length - 1, p + 1))}><Icon name="ChevronRight" size={22} /></button>
            <button type="button" className="tb lg" aria-label={tr('End presentation')} onClick={() => setPresent(null)}><Icon name="X" size={22} /></button>
          </div>
        </div>, document.body)}
    </div>
  );
}

function PresentSlide({ slide, theme }) {
  const [ref, k] = useBoxScale();
  return <div className="present-stage" ref={ref}><SlideView slide={slide} theme={theme} scale={k} /></div>;
}
