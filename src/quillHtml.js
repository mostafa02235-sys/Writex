// Render a delta to HTML with a throwaway Quill instance.
import { setupQuill } from './quillSetup.js';

let host = null;
let q = null;
export function deltaToHTML(delta) {
  const Quill = setupQuill();
  if (!Quill) return '';
  if (!q) {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;visibility:hidden;pointer-events:none';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    const el = document.createElement('div');
    host.appendChild(el);
    q = new Quill(el, { modules: { toolbar: false, table: true, history: { maxStack: 1 } }, readOnly: true });
  }
  try {
    q.setContents(delta, 'silent');
    return q.root.innerHTML;
  } catch (e) {
    return '';
  }
}

export function previewFromHTML(html) {
  return String(html || '')
    .replace(/<img[^>]*>/g, '<span class="pv-img"></span>')
    .slice(0, 4000);
}

// Preview from the first blocks of a live editor root (cheap for long documents)
export function previewFromRoot(root) {
  let out = '';
  for (const el of root.children) {
    const h = el.outerHTML.replace(/<img[^>]*>/g, '<span class="pv-img"></span>');
    out += h;
    if (out.length > 4000) break;
  }
  return out;
}
