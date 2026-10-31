import React, { useState, useEffect, useRef } from '../react.js';
import { Modal } from './ui.jsx';
import { loadScript } from '../util.js';
import { libUrls } from '../vendor.js';
import { tr } from '../i18n.js';

// LaTeX equations rendered with MathJax (SVG output, no web fonts needed) and
// stored in the document as an image that keeps its LaTeX source for editing.
const SNIPPETS = [
  ['a/b', '\\frac{a}{b}'], ['√', '\\sqrt{x}'], ['xⁿ', 'x^{n}'], ['xᵢ', 'x_{i}'], ['Σ', '\\sum_{i=1}^{n}'], ['∫', '\\int_{a}^{b} f(x)\\,dx'],
  ['lim', '\\lim_{x \\to 0}'], ['±', '\\pm'], ['×', '\\times'], ['≤', '\\le'], ['≠', '\\neq'], ['∞', '\\infty'],
  ['π', '\\pi'], ['θ', '\\theta'], ['α', '\\alpha'], ['Δ', '\\Delta'], ['( )', '\\left( x \\right)'], ['[ ]', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
];
const EXAMPLES = ['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'E = mc^2', 'a^2 + b^2 = c^2', '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}'];

let ready = null;
function loadMathJax() {
  if (ready) return ready;
  if (!window.MathJax || !window.MathJax.tex2svgPromise) {
    window.MathJax = { tex: { inlineMath: [] }, svg: { fontCache: 'none' }, startup: { typeset: false }, options: { enableMenu: false } };
  }
  ready = loadScript(libUrls('mathjax.js', [
    'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg-full.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg-full.js',
  ]), () => !!(window.MathJax && window.MathJax.tex2svgPromise))
    .then(() => (window.MathJax.startup && window.MathJax.startup.promise) || null)
    .catch((e) => { ready = null; throw e; });
  return ready;
}

async function renderSVG(tex, px = 18) {
  await loadMathJax();
  const node = await window.MathJax.tex2svgPromise(tex, { display: true });
  const svg = node.querySelector('svg');
  if (!svg) throw new Error(tr('Could not draw that equation.'));
  const err = svg.querySelector('[data-mml-node="merror"]');
  const ex = px / 2;
  const w = parseFloat(svg.getAttribute('width')) * ex;
  const h = parseFloat(svg.getAttribute('height')) * ex;
  svg.setAttribute('width', w + 'px');
  svg.setAttribute('height', h + 'px');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.color = '#111827';
  return { svg: new XMLSerializer().serializeToString(svg).replace(/currentColor/g, '#111827'), w, h, error: err ? (err.textContent || tr('Check the LaTeX')) : null };
}

function svgToPng(svgText, w, h, k = 3) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(tr('The equation could not be converted to an image.')));
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
  });
}

export function EquationDialog({ initial, onInsert, onClose }) {
  const [tex, setTex] = useState(initial || EXAMPLES[0]);
  const [size, setSize] = useState(18);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const ta = useRef(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      if (!tex.trim()) { setPreview(null); return; }
      try {
        const r = await renderSVG(tex, size);
        if (!live) return;
        setPreview(r); setErr(r.error || ''); setLoading(false);
      } catch (e) { if (live) { setErr(e.message || tr('The equation engine could not load. Check your connection.')); setLoading(false); } }
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [tex, size]);

  const add = (s) => {
    const el = ta.current;
    const a = el ? el.selectionStart : tex.length; const b = el ? el.selectionEnd : tex.length;
    const next = tex.slice(0, a) + s + tex.slice(b);
    setTex(next);
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = a + s.length; } }, 0);
  };
  const insert = async () => {
    if (!preview || preview.error) return;
    try {
      const url = await svgToPng(preview.svg, preview.w, preview.h);
      onInsert({ url, width: Math.round(preview.w), alt: 'latex:' + tex });
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={initial ? tr('Edit equation') : tr('Insert equation')} onClose={onClose} width={520} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>{tr('Cancel')}</button>
        <button type="button" className="btn primary" disabled={!preview || !!(preview && preview.error)} onClick={insert}>{initial ? tr('Update') : tr('Insert')}</button>
      </>
    }>
      <div className="form-stack">
        <div className="eq-preview" aria-live="polite">
          {loading ? <span className="muted-p"><span className="spin" />{' '}{tr('Loading the equation engine…')}</span>
            : preview && !preview.error ? <img alt={tr('Equation preview')} src={'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(preview.svg)))} />
              : <span className="error-text">{err || tr('Type an equation below.')}</span>}
        </div>
        <label className="field">
          <span>{tr('LaTeX')}</span>
          <textarea id="eq-tex" ref={ta} dir="ltr" rows={3} value={tex} spellCheck={false} onChange={(e) => setTex(e.target.value)} />
        </label>
        <div className="eq-snips">
          {SNIPPETS.map(([l, s]) => <button type="button" key={l} className="mchip" onClick={() => add(s)}>{l}</button>)}
        </div>
        <div className="mline"><span className="mline-label">{tr('Size')}</span>
          <div className="mchips">{[14, 18, 24, 32].map((v) => <button type="button" key={v} className={'mchip' + (size === v ? ' on' : '')} onClick={() => setSize(v)}>{tr('{0}px', v)}</button>)}</div>
        </div>
        <div className="eq-examples">
          <span className="hint">{tr('Examples:')}</span>
          {EXAMPLES.map((e) => <button type="button" key={e} className="link-btn" dir="ltr" onClick={() => setTex(e)}>{e.length > 26 ? e.slice(0, 24) + '…' : e}</button>)}
        </div>
      </div>
    </Modal>
  );
}
