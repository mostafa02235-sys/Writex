// One place to list and read every document the app knows about:
// editor documents (Write) and imported files (Read).
import * as db from './db.js';
import { uid, loadScript } from './util.js';
import { libUrls, vendorUrl } from './vendor.js';
import { loadLib } from './exporters.js';
import { sessionKeys } from './crypto.js';

export const FILE_TYPES = {
  pdf: { label: 'PDF', icon: 'FileText', accept: 'application/pdf,.pdf' },
  docx: { label: 'Word', icon: 'FileType', accept: '.docx' },
  txt: { label: 'Text', icon: 'AlignLeft', accept: 'text/plain,.txt,.md' },
  image: { label: 'Image', icon: 'Image', accept: 'image/png,image/jpeg,image/webp,image/gif' },
};
export const ACCEPT_ALL = '.pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain';
const MAX_BYTES = 60 * 1024 * 1024;

export function typeOf(file) {
  const n = (file.name || '').toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.txt') || n.endsWith('.md') || file.type === 'text/plain') return 'txt';
  if (/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return 'image';
  return null;
}

/* ---------- files (Read) ---------- */
export async function listFiles() { return (await db.getAll('files')).sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt)); }
export const getFile = (id) => db.get('files', id);
export async function getFileData(id) { const r = await db.get('fileData', id); return r ? r.data : null; }
export async function addFile(file) {
  const type = typeOf(file);
  if (!type) throw new Error('This file type is not supported. Use PDF, Word (.docx), text or an image.');
  if (file.size > MAX_BYTES) throw new Error('This file is larger than 60 MB.');
  const data = await file.arrayBuffer();
  const rec = { id: uid('file'), name: file.name, type, size: file.size, addedAt: Date.now(), openedAt: Date.now(), pos: 0, bookmarks: [], highlights: [] };
  await db.put('fileData', { id: rec.id, data });
  await db.put('files', rec);
  return rec;
}
export async function updateFile(id, patch) {
  const cur = await db.get('files', id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await db.put('files', next);
  return next;
}
export async function deleteFile(id) { await db.del('files', id); await db.del('fileData', id); await db.del('chats', 'file:' + id).catch(() => {}); }

/* ---------- PDF (pdf.js) ---------- */
const PDF_VER = '3.11.174';
export async function loadPdfJs() {
  await loadScript(libUrls('pdf.js', [
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VER}/pdf.min.js`,
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDF_VER}/build/pdf.min.js`,
  ]), () => !!window.pdfjsLib);
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.js') || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VER}/pdf.worker.min.js`;
  return lib;
}
export async function openPdf(data) {
  const lib = await loadPdfJs();
  // copy, because pdf.js transfers the buffer to its worker
  const bytes = new Uint8Array(data.slice(0));
  try {
    return await lib.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('This PDF is password protected.');
    // Worker blocked: run pdf.js on the main thread instead
    await loadScript(libUrls('pdf.worker.js', [`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VER}/pdf.worker.min.js`]), () => !!window.pdfjsWorker);
    return lib.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false, useSystemFonts: true }).promise;
  }
}
export async function pdfPageTexts(pdf, onProgress) {
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let line = ''; const lines = [];
    let lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += it.str + (it.hasEOL ? '\n' : '');
      lastY = y;
    }
    if (line) lines.push(line);
    out.push(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
    onProgress && onProgress(i, pdf.numPages);
  }
  return out;
}

/* ---------- text of any source ---------- */
export const deltaPlain = (d) => ((d && d.ops) || []).map((op) => (typeof op.insert === 'string' ? op.insert : op.insert && op.insert.footnote ? '' : '')).join('');

// ref: { kind: 'doc' | 'file', id }
export async function sourceText(ref, onProgress) {
  if (ref.kind === 'doc') {
    const d = await db.get('docs', ref.id);
    if (!d) throw new Error('This document no longer exists.');
    let delta = d.delta;
    if (d.locked) {
      const sk = sessionKeys.get(d.id);
      if (!sk || !sk.plain) throw new Error('This document is password protected. Open it in Write first to unlock it.');
      delta = sk.plain.delta;
    }
    return { title: d.title, text: deltaPlain(delta).trim(), kind: 'doc' };
  }
  const f = await db.get('files', ref.id);
  if (!f) throw new Error('This file no longer exists.');
  if (f.text) return { title: f.name, text: f.text, kind: f.type, pages: f.pages };
  const data = await getFileData(f.id);
  if (!data) throw new Error('The file data is missing.');
  let text = ''; let pages;
  if (f.type === 'txt') text = new TextDecoder().decode(data);
  else if (f.type === 'docx') { await loadLib.mammoth(); text = (await window.mammoth.extractRawText({ arrayBuffer: data.slice(0) })).value; }
  else if (f.type === 'pdf') {
    const pdf = await openPdf(data);
    pages = await pdfPageTexts(pdf, onProgress);
    text = pages.map((t, i) => `[Page ${i + 1}]\n${t}`).join('\n\n');
    if (!pages.join('').trim()) throw new Error('This PDF has no selectable text (it may be scanned images), so it cannot be read as text.');
  } else throw new Error('Images have no text to read. Quick Capture can turn images into text in a later update.');
  text = text.trim();
  // cache extracted text for next time (not for plain txt, which is cheap)
  if (f.type !== 'txt') await db.put('files', { ...f, text, pages });
  return { title: f.name, text, kind: f.type, pages };
}

export async function listSources() {
  const [docs, files] = await Promise.all([db.getAll('docs'), db.getAll('files')]);
  const a = docs.map((d) => ({ kind: 'doc', id: d.id, title: d.title, at: d.updatedAt, locked: !!d.locked && !sessionKeys.get(d.id), words: d.words, sub: d.subjectId }));
  const b = files.filter((f) => f.type !== 'image').map((f) => ({ kind: 'file', id: f.id, title: f.name, at: f.openedAt || f.addedAt, ftype: f.type }));
  return [...a, ...b].sort((x, y) => y.at - x.at);
}
export const sourceKey = (ref) => ref.kind + ':' + ref.id;
