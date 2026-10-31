import React, { useState, useEffect, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import * as src from '../sources.js';
import { fmtDate } from '../util.js';
import { tr } from '../i18n.js';

const nd = (e) => e.preventDefault();

// Lists every document (Write) and file (Read) that has text to work with.
export function SourcePicker({ value, onPick }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { src.listSources().then(setList).catch(() => setList([])); }, []);
  const shown = useMemo(() => (list || []).filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())), [list, q]);
  if (list === null) return <p className="mnote"><span className="spin" />{' '}{tr('Loading…')}</p>;
  if (!list.length) return <p className="mnote">{tr('No documents yet. Write one, or add files in Read.')}</p>;
  return (
    <div className="spick">
      {list.length > 6 && (
        <label className="search sm"><Icon name="Search" size={16} /><input id="spick-q" type="search" dir="auto" placeholder="Find a document" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      )}
      <div className="mlist">
        {shown.map((s) => {
          const on = value && value.kind === s.kind && value.id === s.id;
          return (
            <button type="button" key={src.sourceKey(s)} className={'mrow' + (on ? ' on' : '')} disabled={s.locked} onMouseDown={nd} onClick={() => onPick({ kind: s.kind, id: s.id, title: s.title })}>
              <span className="mrow-ico"><Icon name={s.locked ? 'Lock' : s.kind === 'doc' ? 'PenLine' : src.FILE_TYPES[s.ftype].icon} size={18} /></span>
              <span className="mrow-label"><span dir="auto">{s.title}</span><small>{s.locked ? tr('Password protected · unlock in Write') : (s.kind === 'doc' ? tr('Document') : src.FILE_TYPES[s.ftype].label) + ' · ' + fmtDate(s.at)}</small></span>
              {on && <Icon name="Check" size={18} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
