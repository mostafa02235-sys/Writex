// Print-layout pagination for the Quill editor.
// Each top-level block (and each list item) is measured; a block that would
// cross the bottom margin is pushed to the next page by a generated
// `--pg` margin. Nothing inside the editor DOM is mutated: the offsets live
// in a separate <style> element keyed by :nth-child selectors.

export function computePagination(root, geo, scale, rootSel) {
  const { C, stride } = geo;
  const rootRect = root.getBoundingClientRect();
  const s = scale || 1;
  const rules = [];
  let added = 0; // extra space introduced by this pass
  let applied = 0; // extra space present in the current layout (from the previous pass)
  let force = false;
  let lastBottom = 0;
  let pendingBreak = false;

  const units = [];
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if (el.tagName === 'OL' || el.tagName === 'UL') {
      const items = el.children;
      for (let j = 0; j < items.length; j++) units.push({ el: items[j], sel: `${rootSel}>:nth-child(${i + 1})>:nth-child(${j + 1})` });
    } else {
      units.push({ el, sel: `${rootSel}>:nth-child(${i + 1})`, brk: el.classList.contains('ql-pagebreak') });
    }
  }

  for (const u of units) {
    const cs = getComputedStyle(u.el);
    const own = parseFloat(cs.getPropertyValue('--pg')) || 0;
    const mtTotal = parseFloat(cs.marginTop) || 0;
    const mtNat = Math.max(0, mtTotal - own);
    applied += own;
    const r = u.el.getBoundingClientRect();
    const top = (r.top - rootRect.top) / s;
    const hgt = r.height / s;
    const natStart = top - applied - mtNat;
    const h = hgt + mtNat;
    let y = natStart + added;
    let extra = 0;
    const k = Math.floor((y + 0.5) / stride);
    const pageStart = k * stride;
    if (force) {
      extra = pageStart + stride - y;
      if (y <= pageStart + 0.5) extra = 0; // already at the top of a page
      force = false;
    } else {
      const contentEnd = pageStart + C;
      if (y > contentEnd - 0.5) extra = pageStart + stride - y; // starts inside the gap
      else if (y + h > contentEnd + 0.5 && y > pageStart + 0.5) extra = pageStart + stride - y; // does not fit
    }
    if (extra > 0.5) {
      const e = Math.round(extra);
      rules.push(`${u.sel}{--pg:${e}px}`);
      added += e;
      y += e;
    }
    lastBottom = y + h;
    if (u.brk) { force = true; pendingBreak = true; } else pendingBreak = false;
  }
  let pages = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / stride) + 1);
  if (pendingBreak) pages += 1;
  return { css: rules.join('\n'), pages };
}
