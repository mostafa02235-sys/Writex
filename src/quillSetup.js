// Registers Qalam's formats on top of Quill 2's built-ins.
let done = false;

export function setupQuill() {
  const Quill = window.Quill;
  if (done || !Quill) return Quill;
  done = true;
  const P = Quill.import('parchment');
  const { Scope, StyleAttributor, Attributor } = P;

  const Font = new StyleAttributor('font', 'font-family', { scope: Scope.INLINE });
  const Size = new StyleAttributor('size', 'font-size', { scope: Scope.INLINE });
  const Align = new StyleAttributor('align', 'text-align', { scope: Scope.BLOCK, whitelist: ['left', 'center', 'right', 'justify'] });
  const LineHeight = new StyleAttributor('lineheight', 'line-height', { scope: Scope.BLOCK });
  const SpaceBefore = new StyleAttributor('spacebefore', 'padding-top', { scope: Scope.BLOCK });
  const SpaceAfter = new StyleAttributor('spaceafter', 'padding-bottom', { scope: Scope.BLOCK });
  const Dir = new Attributor('dir', 'dir', { scope: Scope.BLOCK, whitelist: ['rtl', 'ltr', 'auto'] });

  Quill.register({
    'formats/font': Font,
    'formats/size': Size,
    'formats/align': Align,
    'attributors/style/align': Align,
    'formats/lineheight': LineHeight,
    'formats/spacebefore': SpaceBefore,
    'formats/spaceafter': SpaceAfter,
    'formats/dir': Dir,
  }, true);

  const BlockEmbed = Quill.import('blots/block/embed');
  class PageBreak extends BlockEmbed {
    static create() {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-label', 'Page break');
      return node;
    }
  }
  PageBreak.blotName = 'pagebreak';
  PageBreak.tagName = 'DIV';
  PageBreak.className = 'ql-pagebreak';

  class Divider extends BlockEmbed {}
  Divider.blotName = 'divider';
  Divider.tagName = 'HR';

  Quill.register(PageBreak, true);
  Quill.register(Divider, true);

  /* ----- advanced paragraph formats ----- */
  const ClassA = P.ClassAttributor;
  const TextIndent = new StyleAttributor('textindent', 'text-indent', { scope: Scope.BLOCK });
  const Hanging = new ClassA('hanging', 'ql-hanging', { scope: Scope.BLOCK, whitelist: ['1'] });
  const Shade = new ClassA('shade', 'ql-shade', { scope: Scope.BLOCK, whitelist: ['gray', 'blue', 'green', 'yellow', 'red', 'purple'] });
  const PBorder = new ClassA('pborder', 'ql-pborder', { scope: Scope.BLOCK, whitelist: ['box', 'left', 'bottom'] });
  Quill.register({ 'formats/textindent': TextIndent, 'formats/hanging': Hanging, 'formats/shade': Shade, 'formats/pborder': PBorder }, true);

  /* ----- references: footnotes, citations, TOC, bibliography ----- */
  const Embed = Quill.import('blots/embed');
  const readJSON = (n) => { try { return JSON.parse(n.getAttribute('data-value') || '{}'); } catch (e) { return {}; } };

  class Footnote extends Embed {
    static create(value) {
      const node = super.create(value);
      node.setAttribute('data-id', value.id);
      node.setAttribute('data-text', value.text || '');
      node.setAttribute('title', value.text || '');
      return node;
    }
    static value(node) { return { id: node.getAttribute('data-id'), text: node.getAttribute('data-text') || '' }; }
  }
  Footnote.blotName = 'footnote';
  Footnote.tagName = 'SUP';
  Footnote.className = 'ql-fn';

  class Cite extends Embed {
    static create(value) {
      const node = super.create(value);
      node.setAttribute('data-id', value.id);
      node.setAttribute('data-label', value.label || '');
      node.textContent = value.label || '[?]';
      return node;
    }
    static value(node) { return { id: node.getAttribute('data-id'), label: node.getAttribute('data-label') || '' }; }
  }
  Cite.blotName = 'cite';
  Cite.tagName = 'SPAN';
  Cite.className = 'ql-cite';

  const blockDom = (node, value, fill) => {
    node.setAttribute('contenteditable', 'false');
    node.setAttribute('data-value', JSON.stringify(value));
    node.setAttribute('dir', 'auto');
    fill(node, value);
    return node;
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  class Toc extends BlockEmbed {
    static create(value) {
      return blockDom(super.create(value), value, (node, v) => {
        node.appendChild(el('div', 'toc-title', v.title || 'Contents'));
        (v.items || []).forEach((it) => {
          const row = el('div', 'toc-row lvl-' + Math.min(4, it.level || 1));
          row.setAttribute('dir', 'auto');
          row.appendChild(el('span', 'toc-text', it.text));
          row.appendChild(el('span', 'toc-dots'));
          row.appendChild(el('span', 'toc-page', it.page == null ? '' : String(it.page)));
          node.appendChild(row);
        });
        if (!(v.items || []).length) node.appendChild(el('div', 'toc-empty', 'Add headings (Heading 1–3) and update the table of contents.'));
      });
    }
    static value(node) { return readJSON(node); }
  }
  Toc.blotName = 'toc';
  Toc.tagName = 'DIV';
  Toc.className = 'ql-toc';

  class Notes extends BlockEmbed {
    static create(value) {
      return blockDom(super.create(value), value, (node, v) => {
        node.appendChild(el('div', 'notes-title', v.title || 'Notes'));
        const ol = el('ol', 'notes-list');
        (v.items || []).forEach((it, i) => { const li = el('li', null); li.setAttribute('dir', 'auto'); li.appendChild(el('span', 'notes-n', (i + 1) + '.')); li.appendChild(el('span', 'notes-t', it.text || '')); ol.appendChild(li); });
        node.appendChild(ol);
      });
    }
    static value(node) { return readJSON(node); }
  }
  Notes.blotName = 'notes';
  Notes.tagName = 'DIV';
  Notes.className = 'ql-notes';

  class Biblio extends BlockEmbed {
    static create(value) {
      return blockDom(super.create(value), value, (node, v) => {
        node.appendChild(el('div', 'bib-title', v.title || 'References'));
        (v.items || []).forEach((t) => { const d = el('div', 'bib-item', t); d.setAttribute('dir', 'auto'); node.appendChild(d); });
        if (!(v.items || []).length) node.appendChild(el('div', 'toc-empty', 'Cite a source to list it here.'));
      });
    }
    static value(node) { return readJSON(node); }
  }
  Biblio.blotName = 'biblio';
  Biblio.tagName = 'DIV';
  Biblio.className = 'ql-biblio';

  Quill.register(Footnote, true);
  Quill.register(Cite, true);
  Quill.register(Toc, true);
  Quill.register(Notes, true);
  Quill.register(Biblio, true);
  return Quill;
}

export const BLOCK_EMBEDS = ['pagebreak', 'divider', 'toc', 'notes', 'biblio'];

// Every line gets dir="auto" unless the writer chose a direction, so Arabic and
// English paragraphs each take their natural direction.
export function normalizeDelta(delta) {
  const ops = (delta && delta.ops) || [];
  return {
    ops: ops.map((op) => {
      if (typeof op.insert === 'string' && op.insert.includes('\n')) {
        // Only newline-only ops carry line attributes in canonical Quill deltas.
        if (/^\n+$/.test(op.insert)) {
          const a = op.attributes || {};
          if (!a.dir && !a.table) return { ...op, attributes: { ...a, dir: 'auto' } };
        }
      }
      return op;
    }),
  };
}

// Split a mixed op stream so each newline is its own op (helps the step above).
export function splitNewlines(delta) {
  const out = [];
  for (const op of (delta && delta.ops) || []) {
    if (typeof op.insert !== 'string' || op.insert === '\n' || !op.insert.includes('\n')) { out.push(op); continue; }
    const parts = op.insert.split(/(\n)/);
    for (const p of parts) {
      if (!p) continue;
      if (p === '\n') {
        // Text ops' attributes are inline; a newline inside a text op inherits none of the line formats.
        const inl = {};
        if (op.attributes) {
          for (const k of Object.keys(op.attributes)) {
            if (!['header', 'list', 'align', 'dir', 'indent', 'blockquote', 'lineheight', 'spacebefore', 'spaceafter', 'code-block', 'table'].includes(k)) continue;
            inl[k] = op.attributes[k];
          }
        }
        out.push(Object.keys(inl).length ? { insert: '\n', attributes: inl } : { insert: '\n' });
      } else out.push(op.attributes ? { insert: p, attributes: op.attributes } : { insert: p });
    }
  }
  return { ops: out };
}
