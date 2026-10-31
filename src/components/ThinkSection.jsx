import React, { useState, useEffect, useRef, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { Seg } from './ui.jsx';
import * as src from '../sources.js';
import * as db from '../db.js';
import * as store from '../store.js';
import * as learn from '../learn.js';
import { complete, clip, providerStatus, getAIConfig, aiErrorText } from '../ai.js';
import { fmtDate, uid } from '../util.js';
import { textToDelta } from '../exporters.js';

const nd = (e) => e.preventDefault();

// Rules sent with every request: answers must come from the document.
const RULES = (title, text, clipped) => `You are the document companion inside a writing app. You help the user understand ONE document.
Rules:
- Use only the document below. If the answer is not in it, say clearly that the document does not say.
- Quote short exact phrases from the document when they support an answer.
- Answer in the language the user writes in (Arabic or English).
- Be concise and well structured. No Markdown headings; simple lists are fine.
${clipped ? '- Note: only the first part of a long document is included.\n' : ''}
Document title: ${title}
Document:
"""
${text}
"""`;

export const TOOLS = [
  { id: 'summary', label: 'Summary', icon: 'ListChecks' },
  { id: 'facts', label: 'Key facts', icon: 'ScanSearch' },
  { id: 'qa', label: 'Q&A', icon: 'MessageCircleQuestion' },
  { id: 'important', label: 'Important parts', icon: 'Star' },
  { id: 'repeated', label: 'Repeated points', icon: 'Repeat' },
  { id: 'insights', label: 'Insights', icon: 'Lightbulb' },
  { id: 'explain', label: 'Explain a passage', icon: 'GraduationCap' },
];

const JSON_ASK = {
  facts: 'Extract the key information. Reply with only JSON: {"names":[{"name":"","role":""}],"dates":[{"date":"","what":""}],"numbers":[{"value":"","what":""}],"facts":[""]}. Include only items that appear in the document. Use the document language.',
  qa: 'Write 6 to 10 question-and-answer pairs that test understanding of the document. Reply with only JSON: {"pairs":[{"q":"","a":"","quote":"exact short phrase from the document that supports the answer"}]}. Use the document language.',
  important: 'Find the 3 to 6 most important passages. Reply with only JSON: {"passages":[{"quote":"exact sentence copied from the document","why":"one short reason"}]}. Use the document language for reasons.',
  repeated: 'Find ideas, facts or phrases that the document repeats. Reply with only JSON: {"items":[{"point":"","times":2,"examples":["exact short phrase"]}]}. Return an empty list if nothing repeats.',
  insights: 'Give 3 to 6 useful insights about this document: its purpose, structure, strengths, gaps or open questions. Reply with only JSON: {"insights":[{"title":"","detail":""}]}. Use the document language.',
};
const SUMMARY_ASK = { short: 'Summarize the document in 2–3 sentences.', medium: 'Summarize the document in one paragraph followed by 4–6 bullet points of key ideas.', detailed: 'Write a detailed summary that follows the document section by section, with short bullet points under each part.' };

function ResultCard({ m, onCopy, onSave, onCards, srcText }) {
  const d = m.data || {};
  let body = null;
  if (m.kind === 'facts') {
    body = (
      <div className="facts">
        {[['names', 'People & names', (x) => [x.name, x.role]], ['dates', 'Dates', (x) => [x.date, x.what]], ['numbers', 'Numbers', (x) => [x.value, x.what]]].map(([k, label, f]) => (d[k] && d[k].length ? (
          <div key={k} className="fact-group"><h4>{label}</h4>{d[k].map((x, i) => { const [a, b] = f(x); return <div key={i} className="fact-row"><b dir="auto">{a}</b><span dir="auto">{b}</span></div>; })}</div>
        ) : null))}
        {d.facts && d.facts.length ? <div className="fact-group"><h4>Key facts</h4><ul>{d.facts.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div> : null}
        {!['names', 'dates', 'numbers', 'facts'].some((k) => d[k] && d[k].length) && <p className="mnote">No names, dates or numbers were found in this document.</p>}
      </div>
    );
  } else if (m.kind === 'qa') {
    body = <div className="qa-list">{(d.pairs || []).map((p, i) => <details key={i} className="qa-item"><summary dir="auto">{p.q}</summary><p dir="auto">{p.a}</p>{p.quote && <q dir="auto">{p.quote}</q>}</details>)}</div>;
  } else if (m.kind === 'important') {
    body = <div className="imp-list">{(d.passages || []).map((p, i) => <blockquote key={i} dir="auto"><span>{p.quote}</span><small>{p.why}{p.found === false ? ' · not found word-for-word in the document' : ''}</small></blockquote>)}</div>;
  } else if (m.kind === 'repeated') {
    body = (d.items || []).length ? <div className="facts">{d.items.map((x, i) => <div key={i} className="fact-row"><b dir="auto">{x.point}</b><span>{x.times ? `×${x.times}` : ''}</span></div>)}</div> : <p className="mnote">Nothing notable is repeated.</p>;
  } else if (m.kind === 'insights') {
    body = <div className="ins-list">{(d.insights || []).map((x, i) => <div key={i} className="ins-item"><b dir="auto">{x.title}</b><p dir="auto">{x.detail}</p></div>)}</div>;
  } else body = <div className="bubble-text" dir="auto">{m.text}</div>;
  return (
    <div className="bubble ai">
      {m.title && <div className="bubble-head"><Icon name={(TOOLS.find((t) => t.id === m.kind) || { icon: 'Sparkles' }).icon} size={15} />{m.title}</div>}
      {body}
      {m.note && <p className="mnote">{m.note}</p>}
      <div className="bubble-actions">
        <button type="button" className="link-btn" onClick={() => onCopy(m)}><Icon name="Copy" size={14} />Copy</button>
        <button type="button" className="link-btn" onClick={() => onSave(m)}><Icon name="FilePlus2" size={14} />Save as document</button>
        {m.kind === 'qa' && (d.pairs || []).length > 0 && <button type="button" className="link-btn" onClick={() => onCards(m)}><Icon name="Layers" size={14} />Make flashcards</button>}
      </div>
    </div>
  );
}

const asText = (m) => {
  const d = m.data || {};
  if (m.kind === 'facts') return [...(d.names || []).map((x) => `${x.name} — ${x.role}`), ...(d.dates || []).map((x) => `${x.date} — ${x.what}`), ...(d.numbers || []).map((x) => `${x.value} — ${x.what}`), ...(d.facts || [])].join('\n');
  if (m.kind === 'qa') return (d.pairs || []).map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n\n');
  if (m.kind === 'important') return (d.passages || []).map((p) => `“${p.quote}” — ${p.why}`).join('\n\n');
  if (m.kind === 'repeated') return (d.items || []).map((x) => `${x.point} (×${x.times || '?'})`).join('\n');
  if (m.kind === 'insights') return (d.insights || []).map((x) => `${x.title}: ${x.detail}`).join('\n\n');
  return m.text || '';
};

export function ThinkSection({ toast, openDoc, openSettings, initial }) {
  const [sources, setSources] = useState(null);
  const [ref, setRef] = useState(initial ? initial.ref : null);
  const [doc, setDoc] = useState(null); // {title, text, clipped, total}
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState('');
  const [sumLen, setSumLen] = useState('medium');
  const [explain, setExplain] = useState(false);
  const ctl = useRef(null);
  const listEnd = useRef(null);

  useEffect(() => { src.listSources().then(setSources).catch(() => setSources([])); providerStatus(getAIConfig()).then(setStatus); }, []);
  useEffect(() => { if (initial && initial.ref) setRef(initial.ref); }, [initial && initial.t]);
  useEffect(() => {
    if (!ref) { setDoc(null); setMsgs([]); return; }
    let live = true;
    setLoading(true); setDoc(null);
    (async () => {
      try {
        const r = await src.sourceText(ref);
        const c = clip(r.text);
        if (!live) return;
        setDoc({ title: r.title, text: c.text, clipped: c.clipped, total: c.total, words: (r.text.match(/\S+/g) || []).length });
        const chat = await db.get('chats', src.sourceKey(ref));
        setMsgs((chat && chat.messages) || []);
      } catch (e) { if (live) { toast(e.message, 'error'); setRef(null); } }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; if (ctl.current) ctl.current.abort(); };
  }, [ref && src.sourceKey(ref)]);
  useEffect(() => { if (listEnd.current) listEnd.current.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs.length, stream]);

  const persist = (list) => { setMsgs(list); db.put('chats', { id: src.sourceKey(ref), messages: list.slice(-60), at: Date.now() }).catch(() => {}); };
  const fail = (e) => { if (e && e.code === 'cancelled') return; toast(aiErrorText(e), 'error'); };

  const ask = async (text) => {
    const question = (text || input).trim();
    if (!question || busy || !doc) return;
    setInput('');
    const base = [...msgs, { id: uid('m'), role: 'user', text: question, at: Date.now() }];
    setMsgs(base);
    setBusy(true); setStream('');
    ctl.current = new AbortController();
    const history = base.filter((m) => !m.kind || m.kind === 'chat').slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.role === 'user' ? m.text : asText(m) }));
    const turns = [{ role: 'user', content: RULES(doc.title, doc.text, doc.clipped) + '\n\nReply "Ready." to confirm.' }, { role: 'assistant', content: 'Ready.' }, ...history];
    try {
      const r = await complete({ turns, onText: setStream, signal: ctl.current.signal });
      persist([...base, { id: uid('m'), role: 'ai', kind: 'chat', text: r.text, at: Date.now() }]);
    } catch (e) { setMsgs(base); fail(e); }
    finally { setBusy(false); setStream(''); }
  };

  const tool = async (id, extra) => {
    if (busy || !doc) return;
    const t = TOOLS.find((x) => x.id === id);
    setBusy(true); setStream('');
    ctl.current = new AbortController();
    const base = [...msgs, { id: uid('m'), role: 'user', text: t.label + (id === 'summary' ? ` (${sumLen})` : '') + (extra ? `: “${extra.slice(0, 120)}${extra.length > 120 ? '…' : ''}”` : ''), at: Date.now() }];
    setMsgs(base);
    try {
      let msg;
      if (id === 'summary' || id === 'explain') {
        const ask = id === 'summary' ? SUMMARY_ASK[sumLen] : `Explain this passage from the document in simple words, with the meaning of difficult terms and how it fits the rest of the document:\n"""${extra}"""`;
        const r = await complete({ prompt: RULES(doc.title, doc.text, doc.clipped) + '\n\nTask: ' + ask, onText: setStream, signal: ctl.current.signal });
        msg = { kind: id, title: t.label, text: r.text };
      } else {
        const data = await complete({ prompt: RULES(doc.title, doc.text, doc.clipped) + '\n\nTask: ' + JSON_ASK[id], json: true, signal: ctl.current.signal });
        let note;
        if (id === 'important' && data && Array.isArray(data.passages)) {
          data.passages = data.passages.map((p) => ({ ...p, found: learn.grounded({ source: p.quote }, doc.text) }));
        }
        if (id === 'qa' && data && Array.isArray(data.pairs)) {
          const before = data.pairs.length;
          data.pairs = data.pairs.filter((p) => !p.quote || learn.grounded({ source: p.quote }, doc.text));
          if (data.pairs.length < before) note = `${before - data.pairs.length} question(s) were removed because their supporting quote could not be found in the document.`;
        }
        msg = { kind: id, title: t.label, data: data || {}, note };
      }
      if (doc.clipped) msg.note = (msg.note ? msg.note + ' ' : '') + `Only the first ${doc.text.length.toLocaleString()} of ${doc.total.toLocaleString()} characters were analysed.`;
      persist([...base, { id: uid('m'), role: 'ai', at: Date.now(), ...msg }]);
    } catch (e) { setMsgs(base); fail(e); }
    finally { setBusy(false); setStream(''); }
  };

  const onCopy = async (m) => { try { await navigator.clipboard.writeText(asText(m)); toast('Copied'); } catch (e) { toast('Copy is blocked here.', 'error'); } };
  const onSave = async (m) => {
    const d = await store.createDoc({ title: `${m.title || 'Notes'} · ${doc.title}`, delta: textToDelta(asText(m)) });
    toast('Saved to Write'); openDoc(d.id);
  };
  const onCards = async (m) => {
    const deck = await learn.saveDeck({ name: 'Q&A · ' + doc.title, source: ref });
    await learn.addCards(deck.id, (m.data.pairs || []).map((p) => ({ front: p.q, back: p.a, source: p.quote })));
    toast(`Made ${m.data.pairs.length} flashcards. Review them in Create → Learn.`);
  };

  const filtered = useMemo(() => (sources || []).filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())), [sources, q]);
  const unavailable = status && !status.ready;

  if (!ref) {
    return (
      <div className="sec-shell">
        <main className="lib-main">
          <div className="lib-inner">
            <header className="sec-top"><h1>Think</h1><div className="sec-top-actions"><button type="button" className="tb lg" aria-label="Settings" onClick={openSettings}><Icon name="Settings" size={20} /></button></div></header>
            <p className="sec-lead">Pick a document and ask it anything. Every answer comes from the document's own text.</p>
            {unavailable && <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{status.message}</span></div>}
            <label className="search"><Icon name="Search" size={18} /><input id="think-search" type="search" dir="auto" placeholder="Find a document or file" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            {sources === null ? <div className="empty"><span className="spin" /> Loading…</div>
              : !filtered.length ? <div className="empty"><Icon name="FileSearch" size={28} /><p>No documents yet. Write one, or add files in Read.</p></div>
                : (
                  <div className="drows">
                    {filtered.map((s) => (
                      <button type="button" key={src.sourceKey(s)} className="drow src-pick" disabled={s.locked} onClick={() => setRef({ kind: s.kind, id: s.id })}>
                        <span className={'ftype t-' + (s.kind === 'doc' ? 'doc' : s.ftype)}><Icon name={s.locked ? 'Lock' : s.kind === 'doc' ? 'PenLine' : src.FILE_TYPES[s.ftype].icon} size={20} /><b>{s.kind === 'doc' ? 'Qalam' : src.FILE_TYPES[s.ftype].label}</b></span>
                        <span className="drow-text"><span className="drow-title" dir="auto">{s.title}</span><span className="drow-meta">{s.locked ? 'Password protected · unlock it in Write first' : fmtDate(s.at) + (s.words ? ` · ${s.words.toLocaleString()} words` : '')}</span></span>
                        <Icon name="ChevronRight" size={18} className="mrow-chev" />
                      </button>
                    ))}
                  </div>
                )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sec-shell think">
      <header className="think-bar">
        <button type="button" className="tb lg" aria-label="Choose another document" onClick={() => setRef(null)}><Icon name="ChevronLeft" size={24} /></button>
        <div className="m-title"><span className="m-title-btn" dir="auto">{doc ? doc.title : 'Loading…'}</span><span className="m-sub">{doc ? `${doc.words.toLocaleString()} words${doc.clipped ? ' · long document, first part used' : ''}` : ''}</span></div>
        {ref.kind === 'doc' && <button type="button" className="tb lg" aria-label="Open in Write" onClick={() => openDoc(ref.id)}><Icon name="PenLine" size={20} /></button>}
        {msgs.length > 0 && <button type="button" className="tb lg" aria-label="Clear conversation" onClick={() => persist([])}><Icon name="Eraser" size={20} /></button>}
      </header>
      <div className="think-scroll">
        <div className="think-inner">
          {unavailable && <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{status.message}</span></div>}
          {loading && <div className="empty sm"><span className="spin" /> Reading the document…</div>}
          {doc && !msgs.length && !busy && (
            <div className="think-hello">
              <Icon name="Brain" size={28} />
              <p>Ask a question about <b dir="auto">{doc.title}</b>, or start with a tool below. Nothing is analysed until you ask.</p>
            </div>
          )}
          {msgs.map((m) => (m.role === 'user'
            ? <div key={m.id} className="bubble me" dir="auto">{m.text}</div>
            : <ResultCard key={m.id} m={m} onCopy={onCopy} onSave={onSave} onCards={onCards} />))}
          {busy && <div className="bubble ai">{stream ? <div className="bubble-text" dir="auto">{stream}</div> : <div className="ai-thinking"><span className="spin" />Thinking… Claude may ask you to allow access the first time.</div>}
            <div className="bubble-actions"><button type="button" className="link-btn" onClick={() => ctl.current && ctl.current.abort()}><Icon name="Square" size={14} />Stop</button></div></div>}
          <div ref={listEnd} />
        </div>
      </div>
      <div className="think-tools">
        <div className="tool-chips">
          {TOOLS.map((t) => (
            <button type="button" key={t.id} className="mchip" disabled={busy || !doc || unavailable} onMouseDown={nd}
              onClick={() => (t.id === 'explain' ? setExplain((v) => !v) : tool(t.id))}><Icon name={t.icon} size={14} />{t.label}</button>
          ))}
          <Seg label="Summary length" value={sumLen} onChange={setSumLen} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'detailed', label: 'Detailed' }]} />
        </div>
        {explain && (
          <form className="explain-box" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.passage.value.trim(); if (v) { setExplain(false); tool('explain', v); } }}>
            <textarea name="passage" id="think-passage" dir="auto" rows={3} placeholder="Paste the passage you want explained" />
            <button type="submit" className="btn primary">Explain</button>
          </form>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea id="think-input" dir="auto" rows={1} value={input} placeholder={unavailable ? 'AI is not available in this view' : 'Ask about this document…'} disabled={unavailable || !doc}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <button type="submit" className="tb lg accent" aria-label="Send" disabled={!input.trim() || busy || unavailable}><Icon name="ArrowUp" size={20} /></button>
        </form>
      </div>
    </div>
  );
}
