import React, { useState, useEffect, useRef } from '../react.js';
import { Icon } from '../icons.jsx';

// Shapes & freehand drawing. Works with finger, mouse, or a stylus such as the
// Samsung S Pen: pen input uses pressure (Pointer Events), and "Pen only"
// ignores touches from your palm while you draw.
const COLORS = ['#111827', '#1D4ED8', '#B42318', '#027A48', '#B54708', '#7C3AED', '#0E7490', '#FFFFFF'];
const WIDTHS = [2, 4, 8];
const TOOLS = [
  { id: 'pen', icon: 'PenLine', label: 'Pen' },
  { id: 'marker', icon: 'Highlighter', label: 'Highlighter' },
  { id: 'line', icon: 'Minus', label: 'Line' },
  { id: 'arrow', icon: 'MoveUpRight', label: 'Arrow' },
  { id: 'rect', icon: 'Square', label: 'Rectangle' },
  { id: 'ellipse', icon: 'Circle', label: 'Ellipse' },
  { id: 'eraser', icon: 'Eraser', label: 'Eraser' },
];

function drawItem(ctx, it) {
  ctx.save();
  ctx.strokeStyle = it.color; ctx.fillStyle = it.color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = it.tool === 'marker' ? 0.35 : 1;
  const w = it.width;
  if (it.tool === 'pen' || it.tool === 'marker') {
    const pts = it.points;
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], (w * (pts[0][2] || 1)) / 2, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0, p0] = pts[i - 1]; const [x1, y1, p1] = pts[i];
      ctx.lineWidth = it.tool === 'marker' ? w * 3 : Math.max(0.6, w * (((p0 || 1) + (p1 || 1)) / 2));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  } else {
    ctx.lineWidth = w;
    const [x0, y0] = it.a; const [x1, y1] = it.b;
    ctx.beginPath();
    if (it.tool === 'rect') ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    else if (it.tool === 'ellipse') ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    ctx.stroke();
    if (it.tool === 'arrow') {
      const ang = Math.atan2(y1 - y0, x1 - x0); const L = 10 + w * 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang - 0.45), y1 - L * Math.sin(ang - 0.45));
      ctx.moveTo(x1, y1); ctx.lineTo(x1 - L * Math.cos(ang + 0.45), y1 - L * Math.sin(ang + 0.45));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function bounds(items) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const it of items) {
    const pts = it.points || [it.a, it.b];
    const pad = it.width * (it.tool === 'marker' ? 2 : 1) + (it.tool === 'arrow' ? 14 + it.width * 2.5 : 0);
    for (const [x, y] of pts) { x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad); }
  }
  return { x0, y0, x1, y1 };
}

function hit(it, x, y, r) {
  const pts = it.points || (it.tool === 'rect' ? [[it.a[0], it.a[1]], [it.b[0], it.a[1]], [it.b[0], it.b[1]], [it.a[0], it.b[1]], [it.a[0], it.a[1]]] : [it.a, it.b]);
  if (it.tool === 'ellipse') {
    const cx = (it.a[0] + it.b[0]) / 2; const cy = (it.a[1] + it.b[1]) / 2; const rx = Math.abs(it.b[0] - it.a[0]) / 2 || 1; const ry = Math.abs(it.b[1] - it.a[1]) / 2 || 1;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return Math.abs(d - 1) * Math.min(rx, ry) < r;
  }
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]; const [bx, by] = pts[Math.min(i + 1, pts.length - 1)];
    const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < r + it.width) return true;
  }
  return false;
}

export function DrawingEditor({ initial, onInsert, onClose, maxWidth }) {
  const [items, setItems] = useState(() => (initial && initial.items) || []);
  const [redo, setRedo] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [penOnly, setPenOnly] = useState(false);
  const [penSeen, setPenSeen] = useState(false);
  const canvas = useRef(null);
  const wrap = useRef(null);
  const live = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const paint = () => {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const it of itemsRef.current) drawItem(ctx, it);
    if (live.current) drawItem(ctx, live.current);
  };
  useEffect(() => {
    const fit = () => {
      const c = canvas.current; const w = wrap.current; if (!c || !w) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w.clientWidth * dpr); c.height = Math.round(w.clientHeight * dpr);
      c.style.width = w.clientWidth + 'px'; c.style.height = w.clientHeight + 'px';
      paint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { paint(); }, [items]);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pointerType === 'pen' ? Math.max(0.2, e.pressure || 0.5) * 1.6 : 1]; };
  const down = (e) => {
    if (e.pointerType === 'pen' && !penSeen) setPenSeen(true);
    if (penOnly && e.pointerType === 'touch') return; // palm rejection
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (tool === 'eraser') { erase(p); live.current = { tool: 'eraser' }; return; }
    live.current = tool === 'pen' || tool === 'marker' ? { tool, color, width, points: [p] } : { tool, color, width, a: [p[0], p[1]], b: [p[0], p[1]] };
    paint();
  };
  const move = (e) => {
    if (!live.current) return;
    if (penOnly && e.pointerType === 'touch') return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = pos(ev);
      if (live.current.tool === 'eraser') erase(p);
      else if (live.current.points) live.current.points.push(p);
      else live.current.b = [p[0], p[1]];
    }
    paint();
  };
  const up = () => {
    const it = live.current; live.current = null;
    if (!it || it.tool === 'eraser') { paint(); return; }
    setItems((list) => [...list, it]); setRedo([]);
  };
  const erase = ([x, y]) => {
    const list = itemsRef.current;
    const keep = list.filter((it) => !hit(it, x, y, 10));
    if (keep.length !== list.length) { setItems(keep); setRedo([]); }
  };
  const undo = () => setItems((list) => { if (!list.length) return list; setRedo((r) => [...r, list[list.length - 1]]); return list.slice(0, -1); });
  const redoIt = () => setRedo((r) => { if (!r.length) return r; setItems((list) => [...list, r[r.length - 1]]); return r.slice(0, -1); });

  const insert = () => {
    if (!items.length) { onClose(); return; }
    const b = bounds(items);
    const w = Math.ceil(b.x1 - b.x0); const h = Math.ceil(b.y1 - b.y0);
    const k = 2;
    const c = document.createElement('canvas');
    c.width = w * k; c.height = h * k;
    const ctx = c.getContext('2d');
    ctx.scale(k, k); ctx.translate(-b.x0, -b.y0);
    for (const it of items) drawItem(ctx, it);
    const url = c.toDataURL('image/png');
    // keep the vector data so the drawing can be edited again later
    const data = JSON.stringify({ v: 1, items: items.map((it) => ({ ...it, points: it.points && it.points.map(([x, y, p]) => [Math.round(x - b.x0), Math.round(y - b.y0), Math.round((p || 1) * 100) / 100]), a: it.a && [Math.round(it.a[0] - b.x0), Math.round(it.a[1] - b.y0)], b: it.b && [Math.round(it.b[0] - b.x0), Math.round(it.b[1] - b.y0)] })) });
    onInsert({ url, width: Math.min(w, maxWidth || w), alt: 'drawing:' + data });
  };

  return window.ReactDOM.createPortal(
    <div className="draw" role="dialog" aria-label="Drawing">
      <header className="draw-bar">
        <button type="button" data-close className="tb lg" aria-label="Cancel drawing" onClick={onClose}><Icon name="X" size={22} /></button>
        <span className="draw-title">Drawing</span>
        <button type="button" className="tb lg" aria-label="Undo" disabled={!items.length} onClick={undo}><Icon name="Undo2" size={20} /></button>
        <button type="button" className="tb lg" aria-label="Redo" disabled={!redo.length} onClick={redoIt}><Icon name="Redo2" size={20} /></button>
        <button type="button" className="tb lg" aria-label="Clear drawing" disabled={!items.length} onClick={() => { setRedo([]); setItems([]); }}><Icon name="Trash2" size={20} /></button>
        <button type="button" className="btn primary" onClick={insert}><Icon name="Check" size={18} />{initial ? 'Update' : 'Insert'}</button>
      </header>
      <div className="draw-canvas" ref={wrap}>
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Drawing canvas" />
        {!items.length && <p className="draw-hint">Draw with your finger, mouse or stylus. Pick a shape below to draw lines, arrows, boxes and circles.</p>}
      </div>
      <footer className="draw-tools">
        <div className="draw-row">
          {TOOLS.map((t) => <button type="button" key={t.id} className={'mk' + (tool === t.id ? ' on' : '')} aria-label={t.label} title={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}><Icon name={t.icon} size={20} /></button>)}
        </div>
        <div className="draw-row">
          {COLORS.map((c) => <button type="button" key={c} className={'msw' + (color === c ? ' on' : '')} style={{ background: c }} aria-label={'Colour ' + c} onClick={() => setColor(c)} />)}
          <span className="rg-sep" />
          {WIDTHS.map((w) => <button type="button" key={w} className={'mk wdot' + (width === w ? ' on' : '')} aria-label={'Thickness ' + w} onClick={() => setWidth(w)}><span style={{ width: w + 4, height: w + 4 }} /></button>)}
        </div>
        <label className="draw-pen">
          <input type="checkbox" className="switch" checked={penOnly} onChange={(e) => setPenOnly(e.target.checked)} />
          <span>Pen only{penSeen ? ' · stylus detected' : ''}<small>Ignore finger and palm touches while drawing with a stylus such as the S Pen.</small></span>
        </label>
      </footer>
    </div>,
    document.body,
  );
}
