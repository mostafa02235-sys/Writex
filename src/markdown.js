// Small, safe Markdown support for AI answers: headings, lists, bold/italic,
// tables and paragraphs. Used to show answers and to insert them into documents
// as real formatting (headings, lists, bold) instead of raw # and * characters.
import { firstStrongDir } from './util.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let html = ''; let list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isTableRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      close();
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      i--;
      html += '<div class="md-table"><table><thead><tr>' + head.map((c) => `<th dir="auto">${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td dir="auto">${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (h) { close(); html += `<h${h[1].length + 2} dir="auto">${inline(h[2])}</h${h[1].length + 2}>`; } else if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
      html += `<li dir="auto">${inline((ul || ol)[1])}</li>`;
    } else if (!l.trim()) { close(); } else { close(); html += `<p dir="auto">${inline(l)}</p>`; }
  }
  close();
  return html;
}

// Quill delta with headings, lists and bold/italic; every line gets its own direction.
export function mdToDelta(md) {
  const ops = [];
  const pushInline = (text) => {
    const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`/g;
    let at = 0; let m;
    while ((m = re.exec(text))) {
      if (m.index > at) ops.push({ insert: text.slice(at, m.index) });
      if (m[1]) ops.push({ insert: m[1], attributes: { bold: true } });
      else if (m[2]) ops.push({ insert: m[2], attributes: { italic: true } });
      else ops.push({ insert: m[3] });
      at = re.lastIndex;
    }
    if (at < text.length) ops.push({ insert: text.slice(at) });
  };
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  for (const l of lines) {
    if (/^\s*\|?\s*:?-{2,}[-|:\s]*$/.test(l)) continue; // table divider
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    const text = h ? h[2] : ul ? ul[1] : ol ? ol[1] : isTableRow(l) ? cells(l).join('  ·  ') : l;
    pushInline(text);
    const dir = firstStrongDir(text) === 'rtl' ? 'rtl' : 'auto';
    const attrs = { dir };
    if (h) attrs.header = Math.min(3, h[1].length);
    if (ul) attrs.list = 'bullet';
    if (ol) attrs.list = 'ordered';
    ops.push({ insert: '\n', attributes: attrs });
  }
  return { ops };
}

export const mdToPlain = (md) => String(md || '').replace(/^#{1,4}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
