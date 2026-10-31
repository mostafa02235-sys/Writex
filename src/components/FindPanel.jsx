import React, { useState, useEffect, useRef } from '../react.js';
import { Icon } from '../icons.jsx';
import { replaceAll, replaceOne } from '../find.js';
import { storage } from '../util.js';
import { tr } from '../i18n.js';

export function FindPanel({ mode, hits, runFind, gotoHit, quill, lastRange, onClose, toast }) {
  const [showReplace, setShowReplace] = useState(mode === 'replace');
  const [query, setQuery] = useState(() => {
    const q = quill();
    const r = lastRange.current;
    if (q && r && r.length && r.length < 80) return q.getText(r.index, r.length).replace(/\n/g, ' ');
    return storage.get('writex.lastFind', '');
  });
  const [repl, setRepl] = useState('');
  const [opts, setOpts] = useState(() => storage.get('writex.findOpts', { matchCase: false, wholeWord: false, arabicLoose: true }));
  const input = useRef(null);

  useEffect(() => { const t = setTimeout(() => { if (input.current) { input.current.focus(); input.current.select(); } }, 20); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const list = runFind(query, opts);
      if (list.length) gotoHit(list.cur, list);
    }, 160);
    storage.set('writex.lastFind', query);
    return () => clearTimeout(t);
  }, [query, opts]);
  useEffect(() => { storage.set('writex.findOpts', opts); }, [opts]);
  // refresh matches after edits
  useEffect(() => {
    if (!hits.stale) return undefined;
    const t = setTimeout(() => { runFind(query, opts, hits.list[hits.cur] ? hits.list[hits.cur].index : undefined); }, 250);
    return () => clearTimeout(t);
  }, [hits.stale]);

  const n = hits.list.length;
  const next = () => n && gotoHit(hits.cur + 1);
  const prev = () => n && gotoHit(hits.cur - 1);

  const doReplace = () => {
    const q = quill(); if (!q || !n) return;
    const m = hits.list[Math.max(0, hits.cur)];
    replaceOne(q, m, repl);
    const list = runFind(query, opts, m.index + repl.length);
    if (list.length) gotoHit(list.cur, list);
  };
  const doReplaceAll = () => {
    const q = quill(); if (!q || !n) return;
    const count = replaceAll(q, hits.list, repl);
    runFind(query, opts);
    toast(tr('Replaced {0} {1}', count, count === 1 ? 'match' : 'matches'));
  };

  const opt = (k, label, hint) => (
    <button type="button" className={'fopt' + (opts[k] ? ' on' : '')} aria-pressed={!!opts[k]} title={hint} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>{label}</button>
  );

  return (
    <div className="find-panel" role="search" aria-label="Find and replace" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="fp-row">
        <button type="button" className="tb sm" aria-label={showReplace ? tr('Hide replace') : tr('Show replace')} aria-expanded={showReplace} onClick={() => setShowReplace((v) => !v)}>
          <Icon name={showReplace ? 'ChevronDown' : 'ChevronRight'} size={16} />
        </button>
        <label className="fp-input">
          <Icon name="Search" size={14} />
          <input id="find-input" ref={input} dir="auto" value={query} placeholder="Find in document" aria-label={tr('Find')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next(); } }} />
          <span className="fp-count tnum">{query ? (n ? `${hits.cur + 1} of ${n}` : tr('No results')) : ''}</span>
        </label>
        <button type="button" className="tb sm" aria-label={tr('Previous match')} disabled={!n} onClick={prev}><Icon name="ChevronUp" size={16} /></button>
        <button type="button" className="tb sm" aria-label={tr('Next match')} disabled={!n} onClick={next}><Icon name="ChevronDown" size={16} /></button>
        <button type="button" data-close className="tb sm" aria-label={tr('Close find')} onClick={onClose}><Icon name="X" size={16} /></button>
      </div>
      {showReplace && (
        <div className="fp-row">
          <span className="fp-spacer" />
          <label className="fp-input">
            <Icon name="Replace" size={14} />
            <input id="replace-input" dir="auto" value={repl} placeholder={tr('Replace with')} aria-label={tr('Replace with')} onChange={(e) => setRepl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doReplace(); } }} />
          </label>
          <button type="button" className="btn sm" disabled={!n} onClick={doReplace}>{tr('Replace')}</button>
          <button type="button" className="btn sm" disabled={!n} onClick={doReplaceAll}>{tr('All')}</button>
        </div>
      )}
      <div className="fp-opts">
        {opt('matchCase', tr('Aa'), tr('Match case'))}
        {opt('wholeWord', tr('Whole words'), tr('Match whole words only'))}
        {opt('arabicLoose', 'تشكيل', tr('Ignore Arabic diacritics and alef/yaa/taa marbuta variants'))}
      </div>
    </div>
  );
}
