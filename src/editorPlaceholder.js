// "Start writing…" hint for an empty document.
//
// Quill's built-in placeholder is driven by a `ql-blank` class that Quill only
// updates after its own text-change. On Android keyboards every word is typed as an
// IME *composition*, and Quill postpones text-change until the composition ends, so
// the built-in hint stayed on screen on top of the first words being typed.
//
// This controller decides emptiness from the editor's live DOM instead, so it reacts
// to composition, input, paste, undo/redo and programmatic changes immediately. The
// hint is a separate element next to the editable root: it is never part of the
// document, never saved and never exported.

const HINT = { ltr: 'Start writing…', rtl: 'ابدأ الكتابة…' };
const EMBED_SEL = 'img, .ql-fn, .ql-cite, .ql-toc, .ql-notes, .ql-biblio, .ql-pagebreak, hr, table, li, iframe, video';

// True when the editor holds nothing a person typed or inserted.
export function isEditorEmpty(root) {
  if (!root) return true;
  if ((root.textContent || '').replace(/[​﻿]/g, '').length > 0) return false;
  if (root.querySelector(EMBED_SEL)) return false;
  return root.children.length <= 1;
}

export function attachPlaceholder(quill, { getDir } = {}) {
  const root = quill.root;
  const host = root.parentElement; // .ql-container
  const el = document.createElement('div');
  el.className = 'ed-placeholder';
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-html2canvas-ignore', 'true');
  el.contentEditable = 'false';
  host.appendChild(el);

  let composing = false;
  let shown = null;
  let raf = 0;

  const place = () => {
    const first = root.firstElementChild;
    const cs = first ? getComputedStyle(first) : getComputedStyle(root);
    const docDir = (getDir && getDir()) || cs.direction || 'ltr';
    const lineDir = first && first.getAttribute('dir') !== 'auto' && first.getAttribute('dir') ? first.getAttribute('dir') : docDir;
    const d = lineDir === 'rtl' ? 'rtl' : 'ltr';
    el.textContent = HINT[d];
    el.dir = d;
    el.style.top = (first ? first.offsetTop + parseFloat(cs.paddingTop || 0) : 0) + 'px';
    el.style.fontFamily = cs.fontFamily;
    el.style.fontSize = cs.fontSize;
    el.style.lineHeight = cs.lineHeight;
    el.style.textAlign = cs.textAlign === 'start' || cs.textAlign === 'end' ? cs.textAlign : cs.textAlign;
  };

  const update = () => {
    raf = 0;
    const show = !composing && isEditorEmpty(root);
    if (show) place();
    if (show !== shown) {
      shown = show;
      el.hidden = !show;
      root.classList.toggle('is-empty', show);
    }
  };
  const soon = () => { if (!raf) raf = requestAnimationFrame(update); };
  const now = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } update(); };

  // Hide the moment typing starts, before the browser has even changed the DOM.
  const onBeforeInput = (e) => {
    if (e.inputType && e.inputType.startsWith('insert') && (e.data || e.inputType !== 'insertText')) { el.hidden = true; shown = false; }
    soon();
  };
  const onCompStart = () => { composing = true; now(); };
  const onCompEnd = () => { composing = false; soon(); };

  root.addEventListener('beforeinput', onBeforeInput);
  root.addEventListener('input', soon);
  root.addEventListener('compositionstart', onCompStart);
  root.addEventListener('compositionupdate', onCompStart);
  root.addEventListener('compositionend', onCompEnd);
  root.addEventListener('blur', onCompEnd);
  const mo = new MutationObserver(soon);
  mo.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['dir', 'class', 'style'] });
  quill.on('text-change', now);

  now();
  return {
    refresh: now,
    isShown: () => !!shown,
    destroy() {
      mo.disconnect();
      quill.off('text-change', now);
      root.removeEventListener('beforeinput', onBeforeInput);
      root.removeEventListener('input', soon);
      root.removeEventListener('compositionstart', onCompStart);
      root.removeEventListener('compositionupdate', onCompStart);
      root.removeEventListener('compositionend', onCompEnd);
      root.removeEventListener('blur', onCompEnd);
      if (raf) cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
