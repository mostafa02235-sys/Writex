import React from './react.js';

// Lucide icons (loaded as a UMD global) rendered as React SVG.
const cache = {};
// Older/newer Lucide names, tried in order
const ALT = {
  IndentIncrease: ['Indent'], IndentDecrease: ['Outdent'], CloudCheck: ['Check'], AArrowUp: ['ArrowBigUp'], AArrowDown: ['ArrowBigDown'],
  Ellipsis: ['MoreHorizontal'], TriangleAlert: ['AlertTriangle'], CircleAlert: ['AlertCircle'], WandSparkles: ['Wand2', 'Wand'],
  Captions: ['Subtitles', 'Type'], ImageUp: ['ImagePlus'], Rows2: ['Rows'], Columns2: ['Columns'], ListCollapse: ['ChevronsDownUp'],
  PilcrowLeft: ['ArrowLeft'], PilcrowRight: ['ArrowRight'], LibraryBig: ['Library'], FilePlus2: ['FilePlus'], FileX2: ['FileX'],
  SearchX: ['Search'], Omega: ['Sigma'], Frame: ['Square'], RemoveFormatting: ['Eraser'], SeparatorHorizontal: ['Minus'],
  MoveHorizontal: ['ArrowLeftRight'], LayoutTemplate: ['Layout'], RectangleHorizontal: ['RectangleHorizontal', 'Square'], RectangleVertical: ['Square'],
  FileType: ['FileText'], CalendarDays: ['Calendar'], Replace: ['Repeat'], Highlighter: ['PenLine'], Baseline: ['Type'], Files: ['Copy'],
  ScrollText: ['FileText'], Sparkles: ['Star'], FolderInput: ['Folder'], Languages: ['Globe'], SpellCheck: ['Check'], Sigma: ['Hash'],
};
function lookup(L, name) {
  let n = L && ((L.icons && L.icons[name]) || L[name]);
  if (n && n[0] === 'svg') n = n[2];
  return Array.isArray(n) ? n : null;
}
function nodeFor(name) {
  if (cache[name] !== undefined) return cache[name];
  const L = window.lucide;
  let n = lookup(L, name);
  if (!n && ALT[name]) for (const a of ALT[name]) { n = lookup(L, a); if (n) break; }
  cache[name] = n;
  return n;
}

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function Icon({ name, size = 18, stroke = 1.75, className, style }) {
  const node = nodeFor(name);
  const kids = node
    ? node.map(([tag, attrs], i) => {
      const a = {};
      for (const k in attrs) if (k !== 'key') a[camel(k)] = attrs[k];
      return React.createElement(tag, { key: i, ...a });
    })
    : [React.createElement('circle', { key: 0, cx: 12, cy: 12, r: 4 })];
  return (
    <svg className={'ico ' + (className || '')} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kids}</svg>
  );
}
