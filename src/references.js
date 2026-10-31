// Table of contents, footnotes and citations — all computed from the live document.
import { uid } from './util.js';

const Delta = () => window.Quill.import('delta');

/* ---------- headings & TOC ---------- */
// Headings with their delta index and (in Page view) page number
export function collectHeadings(quill, geo, viewMode, maxLevel = 3) {
  const out = [];
  const lines = quill.getLines(0, quill.getLength());
  const rootTop = quill.root.getBoundingClientRect().top;
  const scale = quill.root.getBoundingClientRect().height / (quill.root.offsetHeight || 1) || 1;
  for (const ln of lines) {
    if (ln.statics.blotName !== 'header') continue;
    const level = ln.formats().header;
    if (!level || level > maxLevel) continue;
    const text = (ln.domNode.textContent || '').replace(/﻿/g, '').trim();
    if (!text) continue;
    let page = null;
    if (viewMode === 'print' && geo) {
      const y = (ln.domNode.getBoundingClientRect().top - rootTop) / scale;
      page = Math.floor(y / geo.stride) + 1;
    }
    out.push({ text, level, index: quill.getIndex(ln), page });
  }
  return out;
}

function findEmbeds(quill, name) {
  const found = [];
  let i = 0;
  for (const op of quill.getContents().ops) {
    if (typeof op.insert === 'string') { i += op.insert.length; continue; }
    if (op.insert && op.insert[name] !== undefined) found.push({ index: i, value: op.insert[name], attributes: op.attributes });
    i += 1;
  }
  return found;
}

function replaceEmbed(quill, index, name, value) {
  quill.updateContents(new (Delta())().retain(index).delete(1).insert({ [name]: value }), 'user');
}

// Insert a TOC at the cursor, or refresh the existing one(s)
export function insertOrUpdateTOC(quill, at, { geo, viewMode, title }) {
  const existing = findEmbeds(quill, 'toc');
  const value = () => ({ title: title || (existing[0] && existing[0].value.title) || 'Contents', items: collectHeadings(quill, geo, viewMode).map(({ text, level, page }) => ({ text, level, page })) });
  if (existing.length) {
    for (const e of existing.reverse()) replaceEmbed(quill, e.index, 'toc', value());
    return 'updated';
  }
  const [line, offset] = quill.getLine(at);
  let pos = at;
  if (line && offset > 0) { quill.insertText(at, '\n', 'user'); pos = at + 1; }
  quill.insertEmbed(pos, 'toc', value(), 'user');
  quill.setSelection(pos + 1, 0, 'silent');
  return 'inserted';
}

// Page numbers move as you write; refresh them without touching anything else.
export function refreshTOCPages(quill, geo, viewMode) {
  const existing = findEmbeds(quill, 'toc');
  if (!existing.length || viewMode !== 'print') return false;
  const items = collectHeadings(quill, geo, viewMode).map(({ text, level, page }) => ({ text, level, page }));
  let changed = false;
  for (const e of existing.reverse()) {
    if (JSON.stringify(e.value.items || []) !== JSON.stringify(items)) {
      quill.updateContents(new (Delta())().retain(e.index).delete(1).insert({ toc: { ...e.value, items } }), 'api');
      changed = true;
    }
  }
  return changed;
}

/* ---------- footnotes ---------- */
export function insertFootnote(quill, at, text) {
  const id = uid('fn');
  quill.insertEmbed(at, 'footnote', { id, text }, 'user');
  quill.setSelection(at + 1, 0, 'silent');
  syncNotes(quill, 'user');
  return id;
}

export function footnotes(quill) { return findEmbeds(quill, 'footnote'); }

export function editFootnote(quill, id, text) {
  const f = footnotes(quill).find((x) => x.value.id === id);
  if (!f) return;
  replaceEmbed(quill, f.index, 'footnote', { id, text });
  syncNotes(quill, 'user');
}

export function deleteFootnote(quill, id) {
  const f = footnotes(quill).find((x) => x.value.id === id);
  if (!f) return;
  quill.deleteText(f.index, 1, 'user');
  syncNotes(quill, 'user');
}

// Keep the "Notes" block at the end of the document in step with the footnotes.
export function syncNotes(quill, source = 'api') {
  const notes = footnotes(quill).map((f) => ({ id: f.value.id, text: f.value.text }));
  const blocks = findEmbeds(quill, 'notes');
  if (!notes.length) {
    for (const b of blocks.reverse()) quill.updateContents(new (Delta())().retain(b.index).delete(1), source);
    return;
  }
  const value = { title: (blocks[0] && blocks[0].value.title) || 'Notes', items: notes };
  if (blocks.length) {
    const b = blocks[blocks.length - 1];
    if (JSON.stringify(b.value.items) !== JSON.stringify(notes)) quill.updateContents(new (Delta())().retain(b.index).delete(1).insert({ notes: value }), source);
    for (const extra of blocks.slice(0, -1).reverse()) quill.updateContents(new (Delta())().retain(extra.index).delete(1), source);
  } else {
    const end = quill.getLength() - 1;
    quill.updateContents(new (Delta())().retain(end).insert('\n', { dir: 'auto' }).insert({ notes: value }), source);
  }
}

/* ---------- citations ---------- */
export const CITE_STYLES = { apa: 'APA 7', mla: 'MLA 9', ieee: 'IEEE' };

const authorsList = (s) => String(s || '').split(/;|\n/).map((a) => a.trim()).filter(Boolean);
function lastName(a) {
  if (a.includes(',')) return a.split(',')[0].trim();
  const parts = a.split(/\s+/);
  return parts[parts.length - 1];
}
function initials(a) {
  const [last, first] = a.includes(',') ? [a.split(',')[0], a.split(',')[1] || ''] : [a.split(/\s+/).slice(-1)[0], a.split(/\s+/).slice(0, -1).join(' ')];
  const ini = first.trim().split(/\s+/).filter(Boolean).map((n) => n[0].toUpperCase() + '.').join(' ');
  return { last: last.trim(), ini };
}

export function citeLabel(src, style, number) {
  if (!src) return '[?]';
  if (style === 'ieee') return `[${number}]`;
  const au = authorsList(src.authors);
  const name = !au.length ? (src.title || 'Untitled').split(' ').slice(0, 3).join(' ') : au.length === 1 ? lastName(au[0]) : au.length === 2 ? `${lastName(au[0])} & ${lastName(au[1])}` : `${lastName(au[0])} et al.`;
  if (style === 'mla') return `(${name}${src.pages ? ' ' + src.pages : ''})`;
  return `(${name}, ${src.year || 'n.d.'})`;
}

export function formatReference(src, style, number) {
  const au = authorsList(src.authors);
  const year = src.year || 'n.d.';
  const title = src.title || 'Untitled';
  const where = [src.container, src.publisher].filter(Boolean).join(', ');
  const url = src.url ? ' ' + src.url : '';
  if (style === 'ieee') {
    const names = au.map((a) => { const { last, ini } = initials(a); return `${ini} ${last}`.trim(); }).join(', ');
    return `[${number}] ${names ? names + ', ' : ''}“${title},” ${where ? where + ', ' : ''}${year}${src.pages ? ', pp. ' + src.pages : ''}.${url}`;
  }
  if (style === 'mla') {
    const names = !au.length ? '' : au.length === 1 ? au[0] : au.length === 2 ? `${au[0]}, and ${au[1]}` : `${au[0]}, et al`;
    return `${names ? names + '. ' : ''}“${title}.” ${where ? where + ', ' : ''}${year}${src.pages ? ', pp. ' + src.pages : ''}.${url}`;
  }
  const names = au.map((a) => { const { last, ini } = initials(a); return `${last}, ${ini}`.trim().replace(/,$/, ''); });
  const nameStr = names.length > 1 ? names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1] : names[0] || '';
  return `${nameStr ? nameStr + ' ' : ''}(${year}). ${title}.${where ? ' ' + where + '.' : ''}${url}`;
}

// Cited sources in order of first appearance
export function citedOrder(quill) {
  const ids = [];
  for (const c of findEmbeds(quill, 'cite')) if (!ids.includes(c.value.id)) ids.push(c.value.id);
  return ids;
}

export function insertCitation(quill, at, src, refs) {
  quill.insertEmbed(at, 'cite', { id: src.id, label: '…' }, 'user');
  quill.setSelection(at + 1, 0, 'silent');
  refreshCitations(quill, refs, 'user');
}

// Re-label all citations and refresh the bibliography after any change
export function refreshCitations(quill, refs, source = 'api') {
  const style = refs.style || 'apa';
  const order = citedOrder(quill);
  const byId = Object.fromEntries((refs.items || []).map((r) => [r.id, r]));
  const cites = findEmbeds(quill, 'cite');
  for (const c of cites.reverse()) {
    const label = citeLabel(byId[c.value.id], style, order.indexOf(c.value.id) + 1);
    if (label !== c.value.label) quill.updateContents(new (Delta())().retain(c.index).delete(1).insert({ cite: { id: c.value.id, label } }, c.attributes), source);
  }
  const bibs = findEmbeds(quill, 'biblio');
  if (bibs.length) {
    const items = bibliographyItems(refs, order);
    for (const b of bibs.reverse()) {
      if (JSON.stringify(b.value.items) !== JSON.stringify(items)) quill.updateContents(new (Delta())().retain(b.index).delete(1).insert({ biblio: { ...b.value, items } }), source);
    }
  }
}

export function bibliographyItems(refs, order) {
  const style = refs.style || 'apa';
  const items = (refs.items || []).filter((r) => order.includes(r.id));
  if (style === 'ieee') return order.map((id, i) => { const r = items.find((x) => x.id === id); return r ? formatReference(r, style, i + 1) : null; }).filter(Boolean);
  return items.map((r) => formatReference(r, style)).sort((a, b) => a.localeCompare(b));
}

export function insertBibliography(quill, at, refs) {
  const order = citedOrder(quill);
  const existing = findEmbeds(quill, 'biblio');
  const title = refs.style === 'mla' ? 'Works Cited' : 'References';
  if (existing.length) { refreshCitations(quill, refs, 'user'); return 'updated'; }
  const [line, offset] = quill.getLine(at);
  let pos = at;
  if (line && offset > 0) { quill.insertText(at, '\n', 'user'); pos = at + 1; }
  quill.insertEmbed(pos, 'biblio', { title, items: bibliographyItems(refs, order) }, 'user');
  quill.setSelection(pos + 1, 0, 'silent');
  return 'inserted';
}
