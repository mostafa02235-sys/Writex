// Find & replace over a Quill document. Embeds count as one character.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;

export function docText(quill) {
  let s = '';
  for (const op of quill.getContents().ops) s += typeof op.insert === 'string' ? op.insert : '￼';
  return s;
}

// Normalise Arabic for matching: drop harakat & tatweel, unify alef/yaa/taa forms.
function normalize(text, arabicLoose) {
  if (!arabicLoose) return { s: text, map: null };
  let s = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (DIACRITICS.test(c)) continue;
    if (/[أإآٱ]/.test(c)) c = 'ا';
    else if (c === 'ى') c = 'ي';
    else if (c === 'ة') c = 'ه';
    s += c;
    map.push(i);
  }
  map.push(text.length);
  return { s, map };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findAll(text, query, { matchCase, wholeWord, arabicLoose }) {
  if (!query) return [];
  const { s, map } = normalize(text, arabicLoose);
  const q = normalize(query, arabicLoose).s;
  if (!q) return [];
  let src = esc(q);
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  let re;
  try { re = new RegExp(src, 'gu' + (matchCase ? '' : 'i')); } catch (e) { return []; }
  const out = [];
  let m;
  while ((m = re.exec(s)) && out.length < 5000) {
    if (!m[0].length) { re.lastIndex++; continue; }
    const a = map ? map[m.index] : m.index;
    const b = map ? map[m.index + m[0].length - 1] + 1 : m.index + m[0].length;
    out.push({ index: a, length: b - a });
  }
  return out;
}

export function replaceAll(quill, matches, replacement) {
  const Delta = window.Quill.import('delta');
  let d = new Delta();
  let pos = 0;
  for (const m of matches) {
    const cur = quill.getContents(m.index, 1).ops[0];
    const attrs = cur && typeof cur.insert === 'string' ? cur.attributes : undefined;
    d = d.retain(m.index - pos).delete(m.length);
    if (replacement) d = d.insert(replacement, attrs);
    pos = m.index + m.length;
  }
  quill.updateContents(d, 'user');
  return matches.length;
}

export function replaceOne(quill, m, replacement) {
  const cur = quill.getContents(m.index, 1).ops[0];
  const attrs = cur && typeof cur.insert === 'string' ? cur.attributes : undefined;
  const Delta = window.Quill.import('delta');
  let d = new Delta().retain(m.index).delete(m.length);
  if (replacement) d = d.insert(replacement, attrs);
  quill.updateContents(d, 'user');
}
