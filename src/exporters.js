// Export (PDF, DOCX, HTML, TXT) and import (DOCX) for Qalam documents.
import { loadScript, firstStrongDir, AR_RE } from './util.js';
import { pageGeometry, fontByStack } from './constants.js';

const LIBS = {
  html2canvas: [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  ],
  jspdf: [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  ],
  mammoth: [
    'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  ],
  docx: [
    'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.iife.js',
    'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    'https://unpkg.com/docx@8.5.0/build/index.umd.js',
    'https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js',
    'https://unpkg.com/docx@7.8.2/build/index.js',
    'https://cdn.jsdelivr.net/npm/docx@9.0.2/dist/index.iife.js',
  ],
};

export const loadLib = {
  html2canvas: () => loadScript(LIBS.html2canvas, () => !!window.html2canvas),
  jspdf: () => loadScript(LIBS.jspdf, () => !!(window.jspdf && window.jspdf.jsPDF)),
  mammoth: () => loadScript(LIBS.mammoth, () => !!window.mammoth),
  docx: () => loadScript(LIBS.docx, () => !!(window.docx && window.docx.Packer)),
};

/* ---------------- PDF ---------------- */

export async function exportPDF({ stackEl, settings, pages, onProgress }) {
  await Promise.all([loadLib.html2canvas(), loadLib.jspdf()]);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }
  const geo = pageGeometry(settings);
  const layer = document.createElement('div');
  layer.className = 'export-layer';
  layer.setAttribute('aria-hidden', 'true');
  const clip = document.createElement('div');
  clip.className = 'export-clip';
  clip.style.width = geo.W + 'px';
  clip.style.height = geo.H + 'px';
  const copy = stackEl.cloneNode(true);
  copy.style.transform = 'none';
  copy.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
  copy.querySelectorAll('.overlay, .find-hit, .img-frame').forEach((n) => n.remove());
  clip.appendChild(copy);
  layer.appendChild(clip);
  document.body.appendChild(layer);
  try {
    const { jsPDF } = window.jspdf;
    const land = geo.W > geo.H;
    const pdf = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'px', format: [geo.W, geo.H], hotfixes: ['px_scaling'], compress: true });
    const scale = pages > 30 ? 1.5 : 2;
    for (let k = 0; k < pages; k++) {
      onProgress && onProgress(k + 1, pages);
      copy.style.transform = `translateY(${-k * geo.stride}px)`;
      // let layout settle
      await new Promise((r) => requestAnimationFrame(() => r()));
      const canvas = await window.html2canvas(clip, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (k > 0) pdf.addPage([geo.W, geo.H], land ? 'landscape' : 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, geo.W, geo.H, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally {
    layer.remove();
  }
}

/* ---------------- Delta model ---------------- */

export function deltaToBlocks(delta) {
  const blocks = [];
  let runs = [];
  for (const op of (delta && delta.ops) || []) {
    const ins = op.insert;
    if (typeof ins === 'string') {
      const parts = ins.split('\n');
      parts.forEach((part, i) => {
        if (part) runs.push({ text: part, attrs: op.attributes || {} });
        if (i < parts.length - 1) {
          blocks.push({ type: 'line', runs, attrs: op.attributes || {} });
          runs = [];
        }
      });
    } else if (ins && (ins.footnote || ins.cite)) {
      runs.push(ins.footnote ? { footnote: ins.footnote, attrs: op.attributes || {} } : { cite: ins.cite, attrs: op.attributes || {} });
    } else if (ins && (ins.toc || ins.notes || ins.biblio)) {
      if (runs.length) { blocks.push({ type: 'line', runs, attrs: {} }); runs = []; }
      const kind = ins.toc ? 'toc' : ins.notes ? 'notes' : 'biblio';
      blocks.push({ type: kind, value: ins[kind] });
    } else if (ins && ins.image) {
      runs.push({ image: ins.image, attrs: op.attributes || {} });
    } else if (ins && (ins.pagebreak || ins.divider)) {
      if (runs.length) { blocks.push({ type: 'line', runs, attrs: {} }); runs = []; }
      blocks.push({ type: ins.pagebreak ? 'pagebreak' : 'divider' });
    }
  }
  if (runs.length) blocks.push({ type: 'line', runs, attrs: {} });
  // group table cells
  const out = [];
  for (const b of blocks) {
    if (b.type === 'line' && b.attrs.table) {
      let t = out[out.length - 1];
      if (!t || t.type !== 'table') { t = { type: 'table', rows: [] }; out.push(t); }
      let row = t.rows[t.rows.length - 1];
      if (!row || row.id !== b.attrs.table) { row = { id: b.attrs.table, cells: [] }; t.rows.push(row); }
      row.cells.push(b);
    } else out.push(b);
  }
  return out;
}

export const lineText = (b) => b.runs.map((r) => r.text || '').join('');

function toHex(c) {
  if (!c || typeof c !== 'string') return undefined;
  c = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return c.slice(1).split('').map((x) => x + x).join('').toUpperCase();
  const m = c.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
  if (m) return [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}
function sizePt(s) {
  if (!s) return undefined;
  const n = parseFloat(s);
  if (!n) return undefined;
  return /px$/.test(s) ? n * 0.75 : n;
}
const pxToTw = (px) => Math.round(px * 15);

function dataUrlToBytes(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(url || '');
  if (!m) return null;
  if (!m[2]) return new TextEncoder().encode(decodeURIComponent(m[3]));
  const bin = atob(m[3]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function imageSize(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth || 300, h: i.naturalHeight || 200 });
    i.onerror = () => res({ w: 300, h: 200 });
    i.src = src;
  });
}

/* ---------------- DOCX ---------------- */

export async function exportDOCX({ delta, settings, title }) {
  await loadLib.docx();
  const D = window.docx;
  const geo = pageGeometry(settings);
  const docDir = settings.dir === 'rtl' ? 'rtl' : 'ltr';
  const baseFont = fontByStack(settings.font).name;
  const blocks = deltaToBlocks(delta);

  // preload image sizes
  const imgSizes = new Map();
  for (const b of blocks) {
    const lines = b.type === 'table' ? b.rows.flatMap((r) => r.cells) : b.type === 'line' ? [b] : [];
    for (const l of lines) for (const r of l.runs) if (r.image && !imgSizes.has(r.image)) imgSizes.set(r.image, await imageSize(r.image));
  }

  const align = (a, rtl) => {
    if (a === 'center') return D.AlignmentType.CENTER;
    if (a === 'justify') return D.AlignmentType.JUSTIFIED || D.AlignmentType.BOTH;
    if (a === 'left') return rtl ? (D.AlignmentType.END || D.AlignmentType.RIGHT) : (D.AlignmentType.START || D.AlignmentType.LEFT);
    if (a === 'right') return rtl ? (D.AlignmentType.START || D.AlignmentType.LEFT) : (D.AlignmentType.END || D.AlignmentType.RIGHT);
    return undefined;
  };

  const footnoteMap = {};
  let fnCount = 0;
  const runOf = (r, rtlPara, maxW) => {
    if (r.footnote) {
      fnCount += 1;
      footnoteMap[fnCount] = { children: [new D.Paragraph({ children: [new D.TextRun({ text: r.footnote.text || '', rightToLeft: AR_RE.test(r.footnote.text || '') || undefined })], bidirectional: AR_RE.test(r.footnote.text || '') || undefined })] };
      return D.FootnoteReferenceRun ? new D.FootnoteReferenceRun(fnCount) : new D.TextRun({ text: String(fnCount), superScript: true });
    }
    if (r.cite) return new D.TextRun({ text: r.cite.label || '', rightToLeft: rtlPara || undefined });
    if (r.image) {
      const bytes = dataUrlToBytes(r.image);
      if (!bytes) return null;
      const nat = imgSizes.get(r.image) || { w: 300, h: 200 };
      let w = nat.w;
      const wa = r.attrs.width;
      if (wa && /%$/.test(wa)) w = maxW * parseFloat(wa) / 100;
      else if (wa) w = parseFloat(wa) || w;
      w = Math.min(w, maxW);
      const h = Math.round(w * nat.h / nat.w);
      const opts = { data: bytes, transformation: { width: Math.round(w), height: h } };
      const mt = /^data:image\/(png|jpe?g|gif|bmp)/i.exec(r.image);
      if (mt) opts.type = mt[1].toLowerCase().replace('jpeg', 'jpg');
      return new D.ImageRun(opts);
    }
    const a = r.attrs;
    const fontName = a.font ? fontByStack(a.font).name : undefined;
    const pt = sizePt(a.size);
    const rtl = AR_RE.test(r.text);
    const o = {
      text: r.text,
      bold: !!a.bold || undefined,
      boldComplexScript: !!a.bold || undefined,
      italics: !!a.italic || undefined,
      italicsComplexScript: !!a.italic || undefined,
      strike: !!a.strike || undefined,
      underline: a.underline || a.link ? {} : undefined,
      color: toHex(a.color) || (a.link ? '1D4ED8' : undefined),
      superScript: a.script === 'super' || undefined,
      subScript: a.script === 'sub' || undefined,
      rightToLeft: (rtl || rtlPara) || undefined,
    };
    if (fontName) o.font = { ascii: fontName, hAnsi: fontName, cs: fontName, eastAsia: fontName };
    if (pt) { o.size = Math.round(pt * 2); o.sizeComplexScript = Math.round(pt * 2); }
    const bg = toHex(a.background);
    if (bg) o.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: bg };
    const run = new D.TextRun(o);
    if (a.link && D.ExternalHyperlink) return new D.ExternalHyperlink({ link: a.link, children: [run] });
    return run;
  };

  let listInstance = 0;
  let prevList = null;
  const paraOf = (b, maxW, inTable) => {
    const a = b.attrs || {};
    const text = lineText(b);
    const dir = a.dir === 'rtl' || a.dir === 'ltr' ? a.dir : (firstStrongDir(text) || docDir);
    const rtl = dir === 'rtl';
    const o = {
      children: b.runs.map((r) => runOf(r, rtl, maxW)).filter(Boolean),
      bidirectional: rtl || undefined,
      alignment: align(a.align, rtl),
    };
    if (a.header) o.heading = D.HeadingLevel['HEADING_' + Math.min(6, a.header)];
    const sp = {};
    if (a.lineheight) sp.line = Math.round(parseFloat(a.lineheight) * 240);
    if (a.spacebefore) sp.before = pxToTw(parseFloat(a.spacebefore));
    if (a.spaceafter) sp.after = pxToTw(parseFloat(a.spaceafter));
    if (Object.keys(sp).length) o.spacing = sp;
    const ind = parseInt(a.indent || 0, 10);
    if (a.list && !inTable) {
      const kind = a.list === 'ordered' ? 'numbers' : 'bullets';
      if (kind === 'numbers' && prevList !== 'numbers') listInstance++;
      o.numbering = { reference: kind, level: Math.min(8, ind), instance: kind === 'numbers' ? listInstance : 0 };
      prevList = kind;
    } else {
      prevList = null;
      if (ind) o.indent = { start: ind * 720 };
    }
    if (a.textindent) {
      const px = parseFloat(a.textindent) || 0;
      o.indent = { ...(o.indent || {}), ...(px >= 0 ? { firstLine: pxToTw(px) } : { hanging: pxToTw(-px) }) };
    }
    if (a.hanging) o.indent = { ...(o.indent || {}), start: ((o.indent && o.indent.start) || 0) + 720, hanging: 720 };
    const SHADES = { gray: 'EEF0F3', blue: 'E3ECFD', green: 'E2F5EA', yellow: 'FFF5CC', red: 'FDE6E4', purple: 'EFE6FB' };
    if (a.shade && SHADES[a.shade]) o.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: SHADES[a.shade] };
    if (a.pborder) {
      const line = { style: D.BorderStyle.SINGLE, size: 6, color: '9AA3B2', space: 4 };
      const side = rtl ? 'right' : 'left';
      o.border = a.pborder === 'box' ? { top: line, bottom: line, left: line, right: line } : a.pborder === 'bottom' ? { bottom: line } : { [side]: { ...line, size: 18 } };
    }
    if (a.blockquote) {
      o.indent = { start: 567 };
      const side = rtl ? 'right' : 'left';
      o.border = { [side]: { style: D.BorderStyle.SINGLE, size: 18, color: 'C3C8D4', space: 10 } };
    }
    if (!o.children.length) o.children = [new D.TextRun('')];
    return new D.Paragraph(o);
  };

  const children = [];
  for (const b of blocks) {
    if (b.type === 'toc') {
      prevList = null;
      const v = b.value || {};
      children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun(v.title || 'Contents')], bidirectional: docDir === 'rtl' || undefined }));
      for (const it of v.items || []) {
        const rtl = AR_RE.test(it.text);
        children.push(new D.Paragraph({
          bidirectional: rtl || undefined,
          indent: { start: ((it.level || 1) - 1) * 360 },
          tabStops: [{ type: D.TabStopType.RIGHT, position: pxToTw(geo.contentW), leader: (D.LeaderType && D.LeaderType.DOT) || 'dot' }],
          children: [new D.TextRun({ text: it.text, rightToLeft: rtl || undefined }), new D.TextRun({ children: [new D.Tab(), it.page == null ? '' : String(it.page)] })],
        }));
      }
      continue;
    }
    if (b.type === 'notes') continue; // exported as real Word footnotes
    if (b.type === 'biblio') {
      prevList = null;
      const v = b.value || {};
      children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun(v.title || 'References')] }));
      for (const t of v.items || []) children.push(new D.Paragraph({ indent: { start: 720, hanging: 720 }, children: [new D.TextRun({ text: t, rightToLeft: AR_RE.test(t) || undefined })], bidirectional: AR_RE.test(t) || undefined }));
      continue;
    }
    if (b.type === 'pagebreak') { prevList = null; children.push(new D.Paragraph({ children: [new D.PageBreak()] })); continue; }
    if (b.type === 'divider') {
      prevList = null;
      children.push(new D.Paragraph({ children: [], border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'B8BECB', space: 4 } } }));
      continue;
    }
    if (b.type === 'table') {
      prevList = null;
      const cols = Math.max(...b.rows.map((r) => r.cells.length));
      const cellW = geo.contentW / cols;
      children.push(new D.Table({
        width: { size: 100, type: D.WidthType.PERCENTAGE },
        visuallyRightToLeft: docDir === 'rtl' || undefined,
        rows: b.rows.map((r) => new D.TableRow({
          children: r.cells.map((c) => new D.TableCell({
            children: [paraOf(c, cellW - 16, true)],
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
          })),
        })),
      }));
      continue;
    }
    children.push(paraOf(b, geo.contentW, false));
  }

  const pn = settings.pageNumbers || {};
  const fillTokens = (text, alignA, rtlHint) => {
    const parts = String(text || '').split(/(\{page\}|\{pages\}|\{title\}|\{date\})/);
    const kids = [];
    for (const p of parts) {
      if (!p) continue;
      if (p === '{page}') kids.push(new D.TextRun({ children: [D.PageNumber.CURRENT] }));
      else if (p === '{pages}') kids.push(new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES] }));
      else if (p === '{title}') kids.push(new D.TextRun({ text: title || '' }));
      else if (p === '{date}') kids.push(new D.TextRun({ text: new Date().toLocaleDateString() }));
      else kids.push(new D.TextRun({ text: p, rightToLeft: AR_RE.test(p) || undefined }));
    }
    const rtl = rtlHint || AR_RE.test(String(text || ''));
    return new D.Paragraph({ children: kids, alignment: align(alignA, rtl) || (rtl ? D.AlignmentType.START : undefined), bidirectional: rtl || undefined });
  };
  const pnText = { n: '{page}', pageof: 'Page {page} of {pages}', slash: '{page} / {pages}', dash: '— {page} —', ar: 'صفحة {page} من {pages}' }[pn.format || 'n'] || '{page}';
  const mk = (where) => {
    const cfg = settings[where] || {};
    const paras = [];
    if (cfg.text) paras.push(fillTokens(cfg.text, cfg.align, docDir === 'rtl'));
    if (pn.on && pn.where === where) paras.push(fillTokens(pnText, pn.align, docDir === 'rtl'));
    if (!paras.length) return null;
    return where === 'header' ? new D.Header({ children: paras }) : new D.Footer({ children: paras });
  };
  const header = mk('header');
  const footer = mk('footer');

  const bulletChars = ['•', '◦', '▪'];
  const numFormats = [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN];
  const levels = (bullet) => Array.from({ length: 9 }, (_, l) => ({
    level: l,
    format: bullet ? D.LevelFormat.BULLET : numFormats[l % 3],
    text: bullet ? bulletChars[l % 3] : `%${l + 1}.`,
    alignment: D.AlignmentType.START || D.AlignmentType.LEFT,
    style: { paragraph: { indent: { start: 720 * (l + 1), hanging: 360 } } },
  }));

  const portrait = { width: pxToTw(Math.min(geo.W, geo.H)), height: pxToTw(Math.max(geo.W, geo.H)) };
  const section = {
    properties: {
      titlePage: settings.firstPageDifferent || undefined,
      page: {
        size: { ...portrait, orientation: settings.orientation === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
        margin: { top: pxToTw(geo.m.t), bottom: pxToTw(geo.m.b), left: pxToTw(geo.m.l), right: pxToTw(geo.m.r), header: 708, footer: 708 },
      },
    },
    children,
  };
  if (header) section.headers = settings.firstPageDifferent ? { default: header, first: new D.Header({ children: [] }) } : { default: header };
  if (footer) section.footers = settings.firstPageDifferent ? { default: footer, first: new D.Footer({ children: [] }) } : { default: footer };

  const hd = (id, name, pt) => ({ id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: pt * 2, sizeComplexScript: pt * 2, bold: true, boldComplexScript: true, color: '111827' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } });
  const doc = new D.Document({
    creator: 'Qalam',
    title: title || 'Document',
    styles: {
      default: {
        document: {
          run: { font: { ascii: baseFont, hAnsi: baseFont, cs: baseFont, eastAsia: baseFont }, size: Math.round(settings.fontSize * 2), sizeComplexScript: Math.round(settings.fontSize * 2) },
          paragraph: { spacing: { line: Math.round((settings.lineHeight || 1.15) * 240), after: 120 } },
        },
      },
      paragraphStyles: [hd('Heading1', 'Heading 1', 20), hd('Heading2', 'Heading 2', 16), hd('Heading3', 'Heading 3', 13), hd('Heading4', 'Heading 4', 12), hd('Heading5', 'Heading 5', 11), hd('Heading6', 'Heading 6', 11)],
    },
    numbering: { config: [{ reference: 'bullets', levels: levels(true) }, { reference: 'numbers', levels: levels(false) }] },
    ...(fnCount ? { footnotes: footnoteMap } : {}),
    sections: [section],
  });
  return D.Packer.toBlob(doc);
}

/* ---------------- DOCX import ---------------- */

export async function importDOCX(arrayBuffer) {
  await loadLib.mammoth();
  const result = await window.mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: ['p[style-name=\'Title\'] => h1:fresh', 'p[style-name=\'Subtitle\'] => h2:fresh', 'p[style-name=\'Quote\'] => blockquote:fresh'],
  });
  return { html: result.value, warnings: (result.messages || []).filter((m) => m.type === 'warning').length };
}

/* ---------------- HTML / TXT ---------------- */

export function exportHTML({ html, settings, title }) {
  const geo = pageGeometry(settings);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const doc = `<!doctype html>
<html lang="${settings.dir === 'rtl' ? 'ar' : 'en'}" dir="${settings.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || 'Document')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Carlito:ital,wght@0,400;0,700;1,400&family=Noto+Naskh+Arabic:wght@400;700&family=Source+Serif+4:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=Open+Sans:wght@400;700&family=Lato:wght@400;700&family=Cairo:wght@400;700&family=Tajawal:wght@400;700&display=swap">
<style>
body{margin:0;background:#f1f2f5;color:#111}
main{max-width:${geo.contentW}px;margin:40px auto;background:#fff;padding:${geo.m.t}px ${geo.m.r}px ${geo.m.b}px ${geo.m.l}px;font-family:${settings.font};font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};box-shadow:0 1px 3px rgba(0,0,0,.12)}
p,h1,h2,h3,h4,h5,h6,ol,blockquote{margin:0}
h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}h1,h2,h3,h4{padding-bottom:.25em}
ol{padding:0}li{list-style:none;position:relative;padding-inline-start:1.75em}
li .ql-ui{position:absolute;inset-inline-start:0}
li[data-list=bullet]>.ql-ui::before{content:'\\2022'}
ol{counter-reset:l0}li[data-list=ordered]{counter-increment:l0}li[data-list=ordered]>.ql-ui::before{content:counter(l0) '.'}
blockquote{border-inline-start:3px solid #c3c8d4;padding-inline-start:14px;color:#444}
table{border-collapse:collapse;width:100%}td{border:1px solid #c8cdd6;padding:6px 8px}
hr{border:0;border-top:1px solid #c8cdd6;margin:.6em 0}
img{max-width:100%}
.ql-pagebreak{break-after:page;height:0}
${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `.ql-indent-${n}{padding-inline-start:${n * 2.5}em}li.ql-indent-${n}{padding-inline-start:${1.75 + n * 1.75}em}li.ql-indent-${n}>.ql-ui{inset-inline-start:${n * 1.75}em}`).join('')}
</style></head>
<body><main>${html}</main></body></html>`;
  return new Blob([doc], { type: 'text/html' });
}

/* ---------------- TXT import ---------------- */
export function textToDelta(text) {
  const ops = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (const l of lines) {
    if (l) ops.push({ insert: l });
    ops.push({ insert: '\n', attributes: { dir: 'auto' } });
  }
  return { ops };
}
