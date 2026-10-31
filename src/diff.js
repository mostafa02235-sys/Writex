// Small LCS diff used for AI review and version comparison.
// Returns [{type: 'same'|'add'|'del', text}]

function lcsDiff(a, b) {
  const n = a.length; const m = b.length;
  // trim common prefix/suffix to keep the table small
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n; let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA); const B = b.slice(start, endB);
  const out = [];
  if (start) out.push({ type: 'same', items: a.slice(0, start) });
  if (A.length * B.length > 4e6) {
    // too large for an exact diff: show as one replacement
    if (A.length) out.push({ type: 'del', items: A });
    if (B.length) out.push({ type: 'add', items: B });
  } else {
    const w = B.length + 1;
    const t = new Uint32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--) {
      for (let j = B.length - 1; j >= 0; j--) {
        t[i * w + j] = A[i] === B[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    let i = 0; let j = 0;
    const push = (type, item) => { const last = out[out.length - 1]; if (last && last.type === type) last.items.push(item); else out.push({ type, items: [item] }); };
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { push('same', A[i]); i++; j++; } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) { push('del', A[i]); i++; } else { push('add', B[j]); j++; }
    }
    while (i < A.length) push('del', A[i++]);
    while (j < B.length) push('add', B[j++]);
  }
  if (endA < n) {
    const last = out[out.length - 1];
    if (last && last.type === 'same') last.items.push(...a.slice(endA)); else out.push({ type: 'same', items: a.slice(endA) });
  }
  return out;
}

export function diffWords(a, b) {
  const tok = (s) => String(s || '').match(/\s+|[^\s]+/g) || [];
  return lcsDiff(tok(a), tok(b)).map((p) => ({ type: p.type, text: p.items.join('') }));
}

export function diffLines(a, b) {
  const split = (s) => String(s || '').split('\n');
  return lcsDiff(split(a), split(b)).map((p) => ({ type: p.type, lines: p.items }));
}
