// Shared helpers: ids, script loading, text analysis, downloads.
import { isNative, nativeSave, nativeShare } from './platform.js';
import { tr, locale } from './i18n.js';

// Where the last native save landed (shown in the confirmation toast)
export let lastSavedWhere = null;
// Confirmation text after saveFile(): where the app put the file, or the given web text.
export const savedLabel = (fallback) => (lastSavedWhere ? tr('Saved to {0}', lastSavedWhere) : fallback);

export const uid = (p = 'd') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const STRONG_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-ࣿיִ-﷿ﹰ-﻿]/;

// Direction of the first strong character in a string ('rtl' | 'ltr' | null)
export function firstStrongDir(text) {
  const m = STRONG_RE.exec(text || '');
  if (!m) return null;
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]) ? 'rtl' : 'ltr';
}

const loaded = {};
// Load a UMD script from a list of candidate URLs; resolves when `test()` is truthy.
export function loadScript(urls, test) {
  const key = urls[0];
  if (test()) return Promise.resolve();
  if (loaded[key]) return loaded[key];
  loaded[key] = new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= urls.length) { delete loaded[key]; reject(new Error(tr('Could not load a required library. Check your connection and try again.'))); return; }
      const s = document.createElement('script');
      s.src = urls[i++];
      s.async = true;
      s.onload = () => (test() ? resolve() : next());
      s.onerror = () => { s.remove(); next(); };
      document.head.appendChild(s);
    };
    next();
  });
  return loaded[key];
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function countText(text) {
  const t = (text || '').replace(/￼/g, ' ');
  const words = t.match(/[^\s​-‏]+/g) || [];
  const real = words.filter((w) => /[\p{L}\p{N}]/u.test(w));
  const arabic = real.filter((w) => AR_RE.test(w)).length;
  const chars = t.replace(/\n/g, '').length;
  const charsNoSpace = t.replace(/\s/g, '').length;
  const paragraphs = t.split('\n').filter((l) => l.trim()).length;
  return { words: real.length, arabic, latin: real.length - arabic, chars, charsNoSpace, paragraphs };
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return tr('Just now');
  if (diff < 3600) return tr('{0} min ago', Math.floor(diff / 60));
  if (d.toDateString() === now.toDateString()) return tr('Today, {0}', d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr('Yesterday');
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function safeFilename(name, ext) {
  const base = (name || tr('Untitled')).replace(/[\\/:*?"<>|\u0000-\u001F]/g, '').trim().slice(0, 120) || tr('Untitled');
  return base + '.' + ext;
}

let downloadsNs;
async function getDownloads() {
  if (downloadsNs !== undefined) return downloadsNs;
  try {
    downloadsNs = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  } catch (e) { downloadsNs = null; }
  return downloadsNs;
}
// Pre-warm so the first export is quick
setTimeout(() => { getDownloads(); }, 1500);

// Offer a file to the person. Returns 'saved' | 'declined' | throws.
// In the Android app the file is written to Documents/Writex and a toast says where.
export async function saveFile(filename, blob) {
  if (isNative) {
    const r = await nativeSave(filename, blob);
    if (r.where) { lastSavedWhere = r.where + '/' + filename; return 'saved'; }
    lastSavedWhere = null;
    const s = await nativeShare({ title: filename, filename, blob });
    return s === 'shared' ? 'saved' : 'declined';
  }
  const dl = await getDownloads();
  if (dl) {
    try {
      await dl.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code === 'rate_limited') throw new Error(tr('A save prompt is already open. Finish it, then try again.'));
      if (e && (e.code === 'unavailable' || e.code === 'not_granted' || e.code === 'capability_disabled' || e.code === 'capability_removed')) {
        // fall through to the browser fallback
      } else {
        throw new Error((e && e.message) || tr('The file could not be saved.'));
      }
    }
  }
  // Fallback for views outside the Claude viewer
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

export function readFileAs(file, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error(tr('The file could not be read.')));
    if (how === 'buffer') r.readAsArrayBuffer(file); else if (how === 'text') r.readAsText(file); else r.readAsDataURL(file);
  });
}

// Shrink very large images before embedding them in a document
export function downscaleImage(dataUrl, max = 1600) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= max && h <= max && dataUrl.length < 1.5e6) { resolve(dataUrl); return; }
      const k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const png = /^data:image\/(png|gif|webp)/.test(dataUrl);
      try { resolve(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86)); } catch (e) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const storage = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Settings saved before the rename to Writex used a "qalam." prefix; carry them over once.
(function migrateLegacyKeys() {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('qalam.') === 0) old.push(k); }
    for (const k of old) {
      const nk = 'writex.' + k.slice(6);
      if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  } catch (e) { /* storage unavailable */ }
})();
