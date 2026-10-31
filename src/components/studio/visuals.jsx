import React, { useMemo } from '../../react.js';
import { loadLib } from '../../exporters.js';
import { AR_RE } from '../../util.js';
const fillIn = (s, ...a) => s.replace(/\{(\d+)\}/g, (m, i) => a[i]);
import { tr } from '../../i18n.js';

export const PALETTE = ['#5B7CFA', '#22A06B', '#E5484D', '#F5A524', '#9B5DE5', '#12A4B5', '#E8638C', '#7A869A'];
const FONT = "'IBM Plex Sans Arabic', 'Geist', system-ui, sans-serif";
const isAr = (s) => AR_RE.test(String(s || ''));

// Wrap text into lines of at most `max` characters (works for Arabic and English).
export function wrap(text, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

/* ---------- export helpers ---------- */
export function svgToPng(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const vb = svgEl.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svgEl.clientWidth; const h = vb && vb.height ? vb.height : svgEl.clientHeight;
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    const text = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve({ blob: b, url: c.toDataURL('image/png'), w, h }) : reject(new Error(tr('Could not create the image.')))), 'image/png');
    };
    img.onerror = () => reject(new Error(tr('Could not create the image.')));
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
  });
}
export async function nodeToPng(node, scale = 2) {
  await loadLib.html2canvas();
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }
  const canvas = await window.html2canvas(node, { scale, backgroundColor: null, useCORS: true, logging: false });
  const url = canvas.toDataURL('image/png');
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return { blob, url, w: node.offsetWidth, h: node.offsetHeight };
}

const T = ({ x, y, lines, size = 14, weight = 500, fill = '#111827', anchor = 'middle', lh = 1.25 }) => (
  <text x={x} y={y - ((lines.length - 1) * size * lh) / 2} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} dominantBaseline="middle" fontFamily={FONT}
    direction={isAr(lines.join(' ')) ? 'rtl' : 'ltr'}>
    {lines.map((l, i) => <tspan key={i} x={x} dy={i ? size * lh : 0}>{l}</tspan>)}
  </text>
);

/* ---------- mind map (radial) ---------- */
export function MindMapView({ data, svgRef }) {
  const branches = (data.branches || []).slice(0, 8);
  const W = 1000; const H = 760; const cx = W / 2; const cy = H / 2;
  const layout = useMemo(() => {
    const n = branches.length || 1;
    return branches.map((b, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const bx = cx + Math.cos(ang) * 230; const by = cy + Math.sin(ang) * 190;
      const kids = (b.children || []).slice(0, 6);
      const spread = Math.min(1.1, 0.32 * kids.length);
      const kidPos = kids.map((k, j) => {
        const a = ang + (kids.length > 1 ? (j / (kids.length - 1) - 0.5) * spread : 0);
        return { ...k, x: cx + Math.cos(a) * 390, y: cy + Math.sin(a) * 300 };
      });
      return { ...b, x: bx, y: by, color: PALETTE[i % PALETTE.length], kids: kidPos };
    });
  }, [data]);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={tr('Mind map: {0}', data.center || '')}>
      <rect width={W} height={H} fill="#FFFFFF" />
      {layout.map((b, i) => (
        <g key={i}>
          <path d={`M${cx},${cy} Q${(cx + b.x) / 2},${(cy + b.y) / 2 - 20} ${b.x},${b.y}`} stroke={b.color} strokeWidth="4" fill="none" strokeLinecap="round" />
          {b.kids.map((k, j) => <path key={j} d={`M${b.x},${b.y} L${k.x},${k.y}`} stroke={b.color} strokeOpacity=".5" strokeWidth="2" fill="none" />)}
        </g>
      ))}
      {layout.map((b, i) => (
        <g key={'n' + i}>
          {b.kids.map((k, j) => {
            const lines = wrap(k.label, 18);
            return (
              <g key={j}>
                <rect x={k.x - 74} y={k.y - 10 - lines.length * 9} width="148" height={20 + lines.length * 18} rx="10" fill="#FFFFFF" stroke={b.color} strokeOpacity=".55" />
                <T x={k.x} y={k.y} lines={lines} size={13} weight={500} fill="#374151" />
              </g>
            );
          })}
          <rect x={b.x - 86} y={b.y - 26} width="172" height="52" rx="14" fill={b.color} />
          <T x={b.x} y={b.y} lines={wrap(b.label, 20)} size={14.5} weight={650} fill="#FFFFFF" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r="78" fill="#111827" />
      <T x={cx} y={cy} lines={wrap(data.center, 14)} size={17} weight={700} fill="#FFFFFF" />
    </svg>
  );
}

/* ---------- diagram (layered flow) ---------- */
export function DiagramView({ data, svgRef }) {
  const nodes = (data.nodes || []).slice(0, 16);
  const edges = (data.edges || []).filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to));
  const lay = useMemo(() => {
    const level = {}; nodes.forEach((n) => { level[n.id] = 0; });
    for (let k = 0; k < nodes.length; k++) for (const e of edges) if (level[e.to] <= level[e.from] && e.from !== e.to) level[e.to] = Math.min(nodes.length, level[e.from] + 1);
    const rows = {};
    nodes.forEach((n) => { (rows[level[n.id]] = rows[level[n.id]] || []).push(n); });
    const maxRow = Math.max(1, ...Object.values(rows).map((r) => r.length));
    const W = Math.max(720, maxRow * 220 + 80); const rowsN = Object.keys(rows).length;
    const H = rowsN * 130 + 60;
    const pos = {};
    Object.entries(rows).forEach(([lv, list]) => list.forEach((n, i) => { pos[n.id] = { x: (W / (list.length + 1)) * (i + 1), y: 70 + +lv * 130 }; }));
    return { W, H, pos };
  }, [data]);
  const { W, H, pos } = lay;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={tr('Diagram: ') + (data.title || '')}>
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7A869A" /></marker></defs>
      <rect width={W} height={H} fill="#FFFFFF" />
      {edges.map((e, i) => {
        const a = pos[e.from]; const b = pos[e.to];
        const down = b.y > a.y;
        const y1 = a.y + (down ? 30 : -30); const y2 = b.y + (down ? -32 : 32);
        return (
          <g key={i}>
            <path d={`M${a.x},${y1} C${a.x},${(y1 + y2) / 2} ${b.x},${(y1 + y2) / 2} ${b.x},${y2}`} stroke="#7A869A" strokeWidth="2" fill="none" markerEnd="url(#arr)" />
            {e.label && <T x={(a.x + b.x) / 2} y={(y1 + y2) / 2} lines={wrap(e.label, 18)} size={12} weight={500} fill="#5B6577" />}
          </g>
        );
      })}
      {nodes.map((n, i) => {
        const p = pos[n.id]; const lines = wrap(n.label, 22);
        return (
          <g key={n.id}>
            <rect x={p.x - 95} y={p.y - 30} width="190" height="60" rx="12" fill={i === 0 ? '#111827' : '#F3F5F9'} stroke={i === 0 ? '#111827' : '#C9CED8'} />
            <T x={p.x} y={p.y} lines={lines} size={13.5} weight={600} fill={i === 0 ? '#FFFFFF' : '#1F2937'} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- charts ---------- */
const num = (v) => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
export function ChartView({ data, svgRef }) {
  const labels = data.labels || [];
  const series = (data.series || []).map((s) => ({ ...s, values: (s.values || []).map(num) }));
  const W = 900; const H = 520; const pad = { l: 70, r: 30, t: 70, b: 80 };
  const type = data.type || 'bar';
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all); const min = Math.min(0, ...all);
  const nice = (() => { const step = Math.pow(10, Math.floor(Math.log10(max - min || 1))); return Math.ceil(max / step) * step; })();
  const plotW = W - pad.l - pad.r; const plotH = H - pad.t - pad.b;
  const y = (v) => pad.t + plotH - ((v - min) / (nice - min || 1)) * plotH;
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((nice - min) * i) / 4);
  const fmt = (v) => (Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10).toLocaleString() + 'k' : Math.round(v * 100) / 100).toLocaleString();
  if (type === 'pie') {
    const vals = (series[0] || { values: [] }).values; const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2; const cx = 300; const cy = 290; const r = 180;
    return (
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={data.title}>
        <rect width={W} height={H} fill="#FFFFFF" />
        <T x={W / 2} y={36} lines={[data.title || '']} size={20} weight={700} />
        {vals.map((v, i) => {
          const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const p = fillIn('M{0},{1} L{2},{3} A{4},{5} 0 {6} 1 {7},{8} Z', cx, cy, cx + r * Math.cos(a0), cy + r * Math.sin(a0), r, r, large, cx + r * Math.cos(a1), cy + r * Math.sin(a1));
          a0 = a1;
          return <path key={i} d={p} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth="2" />;
        })}
        {vals.map((v, i) => (
          <g key={'l' + i}>
            <rect x={540} y={120 + i * 34} width="16" height="16" rx="4" fill={PALETTE[i % PALETTE.length]} />
            <T x={566} y={128 + i * 34} lines={[`${labels[i] || ''} · ${fmt(v)} (${Math.round((Math.max(0, v) / total) * 100)}%)`]} size={14} anchor="start" />
          </g>
        ))}
      </svg>
    );
  }
  const groups = labels.length || 1; const gw = plotW / groups; const bw = Math.min(56, (gw * 0.72) / Math.max(1, series.length));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img" aria-label={data.title}>
      <rect width={W} height={H} fill="#FFFFFF" />
      <T x={W / 2} y={34} lines={[data.title || '']} size={20} weight={700} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#E5E7EB" />
          <text x={pad.l - 10} y={y(t)} fontSize="12" fill="#6B7280" textAnchor="end" dominantBaseline="middle" fontFamily={FONT}>{fmt(t)}</text>
        </g>
      ))}
      {type === 'line' ? series.map((s, si) => (
        <g key={si}>
          <polyline fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="3" points={s.values.map((v, i) => `${pad.l + gw * (i + 0.5)},${y(v)}`).join(' ')} />
          {s.values.map((v, i) => <circle key={i} cx={pad.l + gw * (i + 0.5)} cy={y(v)} r="5" fill={PALETTE[si % PALETTE.length]} />)}
        </g>
      )) : series.map((s, si) => s.values.map((v, i) => {
        const x = pad.l + gw * i + (gw - bw * series.length) / 2 + si * bw;
        return (
          <g key={si + '-' + i}>
            <rect x={x} y={Math.min(y(v), y(0))} width={bw - 4} height={Math.abs(y(0) - y(v))} rx="4" fill={PALETTE[si % PALETTE.length]} />
            <text x={x + (bw - 4) / 2} y={y(v) - 8} fontSize="12" fill="#374151" textAnchor="middle" fontFamily={FONT}>{fmt(v)}</text>
          </g>
        );
      }))}
      {labels.map((l, i) => <T key={i} x={pad.l + gw * (i + 0.5)} y={H - pad.b + 24} lines={wrap(l, 14)} size={12.5} fill="#374151" />)}
      {series.length > 1 && series.map((s, si) => (
        <g key={'lg' + si}><rect x={pad.l + si * 170} y={H - 28} width="14" height="14" rx="3" fill={PALETTE[si % PALETTE.length]} /><T x={pad.l + si * 170 + 22} y={H - 21} lines={[s.name || tr('Series {0}{1}', si, 1)]} size={13} anchor="start" /></g>
      ))}
    </svg>
  );
}

/* ---------- infographic (HTML, exported with html2canvas) ---------- */
export function InfographicView({ data, nodeRef }) {
  const accent = data.color || '#5B7CFA';
  const rtl = isAr(data.title + ' ' + (data.points || []).join(' '));
  return (
    <div ref={nodeRef} className="ig" dir={rtl ? 'rtl' : 'ltr'} style={{ '--ig': accent }}>
      <div className="ig-head"><span className="ig-kicker">{rtl ? 'إنفوجرافيك' : tr('Infographic')}</span><h2>{data.title}</h2>{data.subtitle && <p>{data.subtitle}</p>}</div>
      <div className="ig-stats">{(data.stats || []).slice(0, 6).map((s, i) => <div key={i} className="ig-stat"><b>{s.value}</b><span>{s.label}</span></div>)}</div>
      <ol className="ig-points">{(data.points || []).slice(0, 6).map((p, i) => <li key={i}><i>{i + 1}</i><span>{p}</span></li>)}</ol>
      {data.source && <div className="ig-foot">{data.source}</div>}
    </div>
  );
}

/* ---------- book cover ---------- */
export const COVER_STYLES = [
  { id: 'classic', label: tr('Classic') }, { id: 'modern', label: tr('Modern') }, { id: 'minimal', label: tr('Minimal') }, { id: 'bold', label: tr('Bold') }, { id: 'photo', label: tr('Photo') },
];
export function CoverView({ data, nodeRef }) {
  const rtl = isAr(data.title + ' ' + data.author);
  return (
    <div ref={nodeRef} className={'bcover bc-' + (data.style || 'classic')} dir={rtl ? 'rtl' : 'ltr'} style={{ '--bc': data.color || '#1F3A5F', backgroundImage: data.style === 'photo' && data.image ? `url(${data.image})` : undefined }}>
      <div className="bc-shade" />
      <div className="bc-inner">
        {data.kicker && <span className="bc-kicker">{data.kicker}</span>}
        <h1 className="bc-title">{data.title || (rtl ? 'العنوان' : tr('Title'))}</h1>
        {data.subtitle && <p className="bc-sub">{data.subtitle}</p>}
        <span className="bc-rule" />
        <span className="bc-author">{data.author}</span>
      </div>
    </div>
  );
}
