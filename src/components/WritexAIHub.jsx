// Writex AI: conversations with attached documents, task actions, live task
// progress and task history. Everything runs on the phone (localAI.js, aiEngine.js).
import React, { useState, useEffect, useRef, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, ConfirmDialog } from './ui.jsx';
import { SourcePicker } from './SourcePicker.jsx';
import * as engine from '../aiEngine.js';
import { storage } from '../util.js';
import * as src from '../sources.js';
import * as store from '../store.js';
import * as db from '../db.js';
import { mdToHtml, mdToDelta, mdToPlain } from '../markdown.js';
import { uid, fmtDate, readFileAs, downscaleImage, saveFile, savedLabel, safeFilename } from '../util.js';
import { normalizeDelta } from '../quillSetup.js';
import { tr } from '../i18n.js';
import { providerStatus, getAIConfig } from '../ai.js';

// Suggested actions: server task types and the input they need
export const ACTIONS = [
  { type: 'summarize', icon: 'ListChecks', label: tr('Summarise'), needs: 1, input: { length: 'medium' } },
  { type: 'analyze', icon: 'MessageSquareText', label: tr('Ask the documents'), needs: 1, ask: tr('What do you want to know?'), key: 'question' },
  { type: 'find', icon: 'Search', label: tr('Find information'), needs: 1, ask: tr('What should Writex AI look for?'), key: 'question' },
  { type: 'compare', icon: 'GitCompare', label: tr('Compare documents'), needs: 2 },
  { type: 'extract', icon: 'Table', label: tr('Extract key info and tables'), needs: 1 },
  { type: 'explain', icon: 'Lightbulb', label: tr('Explain'), needs: 1, ask: tr('What should be explained?'), key: 'topic' },
  { type: 'study_guide', icon: 'GraduationCap', label: tr('Study summary'), needs: 1 },
  { type: 'quiz', icon: 'ListTodo', label: tr('Difficult exam'), needs: 1, input: { difficulty: 'hard', count: 10 } },
  { type: 'flashcards', icon: 'Layers', label: tr('Flashcards'), needs: 1, input: { count: 15 } },
  { type: 'revision_plan', icon: 'CalendarDays', label: tr('Revision plan'), needs: 1, input: { days: 7 } },
  { type: 'outline', icon: 'Presentation', label: tr('Presentation outline'), needs: 1, input: { slides: 8 } },
  { type: 'sources_review', icon: 'Library', label: tr('Review sources'), needs: 1 },
  { type: 'research_outline', icon: 'Microscope', label: tr('Research outline'), needs: 0, ask: tr('Research topic'), key: 'topic' },
  { type: 'write', icon: 'PenLine', label: tr('Write a document'), needs: 0, ask: tr('What should the document be about?'), key: 'brief' },
  { type: 'organize', icon: 'ListTree', label: tr('Notes → organised document'), needs: 0, ask: tr('Paste your notes'), key: 'text' },
];
const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.type, a]));

export const STATE_LABEL = {
  waiting: tr('Waiting'), processing: tr('Processing'), analyzing: tr('Analysing'), generating: tr('Generating'),
  completed: tr('Completed'), failed: tr('Failed'), cancelled: tr('Cancelled'),
};
const TYPE_LABEL = { prompt: tr('Writing assistant'), chat: tr('Conversation'), ...Object.fromEntries(ACTIONS.map((a) => [a.type, a.label])), continue: tr('Continue writing'), organize: tr('Organise paragraphs') };

export function stateText(job) {
  if (!job) return '';
  const p = job.progress;
  if (job.status === 'analyzing' && p) return tr('Analysing part {0} of {1}', Math.min(p.done + 1, p.total), p.total);
  if (job.stage === 'loading') return tr('Loading the model…');
  return STATE_LABEL[job.status] || job.status;
}

// Text form of a structured (JSON) result, for display and insertion
function resultText(job, text) {
  const d = job && job.data;
  if (d && Array.isArray(d.questions)) {
    return `# ${d.title || tr('Quiz')}\n\n` + d.questions.map((q, i) => `${i + 1}. ${q.q}\n${(q.type === 'mcq' ? (q.options || []) : []).map((o, k) => `   - ${String.fromCharCode(65 + k)}) ${o}`).join('\n')}\n   **${tr('Answer')}:** ${q.answer}${q.explanation ? ' — ' + q.explanation : ''}`).join('\n\n');
  }
  if (d && Array.isArray(d.cards)) return d.cards.map((c) => `- **${c.front}** — ${c.back}`).join('\n');
  return text || (job && job.result) || '';
}

// Document text is extracted on the phone (pdf.js, mammoth); nothing is uploaded.
async function attachmentText(att) {
  const r = await src.sourceText(att.ref);
  return { name: att.name || r.title, text: r.text };
}

export function WritexAIHub({ toast, openDoc, openSettings, status }) {
  const [convs, setConvs] = useState([]);
  const [conv, setConv] = useState(null);
  const [input, setInput] = useState('');
  const [attachSheet, setAttachSheet] = useState(false);
  const [historySheet, setHistorySheet] = useState(false);
  const [askAction, setAskAction] = useState(null);
  const [askText, setAskText] = useState('');
  const [upload, setUpload] = useState(null);
  const [insertFor, setInsertFor] = useState(null);
  const [confirmInsert, setConfirmInsert] = useState(null);
  const running = useRef(new Map()); // jobId → AbortController
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const convRef = useRef(null);
  convRef.current = conv;

  useEffect(() => {
    db.getAll('aichats').then((list) => {
      const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt);
      setConvs(sorted);
      setConv(sorted[0] || newConv());
    }).catch(() => setConv(newConv()));
    return () => { for (const c of running.current.values()) c.abort(); };
  }, []);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [conv && conv.messages.length, conv && conv.tick]);

  function newConv() { return { id: uid('chat'), title: '', messages: [], attachments: [], createdAt: Date.now(), updatedAt: Date.now() }; }
  const save = (c) => {
    const next = { ...c, updatedAt: Date.now() };
    setConv(next);
    if (next.messages.length) {
      db.put('aichats', { ...next, messages: next.messages.slice(-80) }).catch(() => {});
      setConvs((list) => [next, ...list.filter((x) => x.id !== next.id)]);
    }
    return next;
  };
  // Updates one message in the current conversation (safe across async updates)
  const patchMsg = (convId, msgId, patch) => {
    setConv((c) => {
      if (!c || c.id !== convId) return c;
      const next = { ...c, tick: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) };
      if (patch.final) db.put('aichats', { ...next, updatedAt: Date.now() }).catch(() => {});
      return next;
    });
  };

  const ready = status && status.ready;

  /* ---------- attachments ---------- */
  const addAttachment = (att) => {
    const c = convRef.current;
    if (c.attachments.some((a) => a.key === att.key)) return;
    save({ ...c, attachments: [...c.attachments, att] });
  };
  const pickSource = (s) => {
    setAttachSheet(false);
    addAttachment({ key: src.sourceKey(s), kind: s.kind === 'doc' ? 'doc' : 'file', ref: { kind: s.kind, id: s.id }, name: s.title, ftype: s.ftype });
  };
  const onDeviceFile = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    setAttachSheet(false);
    for (const f of files) {
      try {
        if (/^image\//.test(f.type)) { toast(tr('The on-device model reads text. Attach PDFs, Word or text files.'), 'error'); continue; }
        const rec = await src.addFile(f); // also appears in Read
        addAttachment({ key: 'file:' + rec.id, kind: 'file', ref: { kind: 'file', id: rec.id }, name: rec.name, ftype: rec.type });
      } catch (err) { toast(err.message, 'error'); }
    }
  };
  const removeAttachment = (key) => save({ ...convRef.current, attachments: convRef.current.attachments.filter((a) => a.key !== key) });

  async function readAll(c) {
    const out = [];
    for (let i = 0; i < c.attachments.length; i++) {
      setUpload({ i: i + 1, n: c.attachments.length, name: c.attachments[i].name });
      out.push(await attachmentText(c.attachments[i]));
    }
    setUpload(null);
    return out;
  }

  /* ---------- running a request ---------- */
  async function run({ type, text, input: extra }) {
    if (!ready) { toast((status && status.message) || tr('Install a Writex AI model first (Settings › Writex AI). After that it works offline.'), 'error'); return; }
    let c = convRef.current;
    const userMsg = { id: uid('m'), role: 'user', text, action: type !== 'chat' ? type : null, attachments: c.attachments.map((a) => a.name) };
    const botMsg = { id: uid('m'), role: 'assistant', text: '', status: 'waiting', type };
    c = save({ ...c, title: c.title || (text || ACTION[type]?.label || '').slice(0, 60), messages: [...c.messages, userMsg, botMsg] });
    const convId = c.id;
    let sources = [];
    try { sources = await readAll(c); } catch (e) {
      setUpload(null);
      patchMsg(convId, botMsg.id, { status: 'failed', error: e.message, final: true });
      return;
    }
    const lang = storage.get('writex.aiLang', 'auto');
    const input = type === 'chat'
      ? { messages: c.messages.filter((m) => m.id !== botMsg.id && (m.role === 'user' || m.status === 'completed')).map((m) => ({ role: m.role, content: m.text || ACTION[m.action]?.label || '' })).filter((m) => m.content), sources, lang }
      : { ...(ACTION[type] && ACTION[type].input), ...extra, sources, lang };
    const ctl = new AbortController();
    const title = (ACTION[type] ? ACTION[type].label : '') + (text ? (ACTION[type] ? ': ' : '') + text.slice(0, 80) : '');
    try {
      const done = await engine.runTask(type, input, {
        title, signal: ctl.signal,
        onState: (job) => { running.current.set(job.id, ctl); patchMsg(convId, botMsg.id, { jobId: job.id, status: job.status, stage: job.stage, progress: job.progress }); },
        onText: (t) => patchMsg(convId, botMsg.id, { text: t }),
      });
      patchMsg(convId, botMsg.id, { status: 'completed', text: resultText(done, done.result), data: done.data || null, final: true });
    } catch (e) {
      patchMsg(convId, botMsg.id, { status: e.code === 'cancelled' ? 'cancelled' : 'failed', error: e.code === 'cancelled' ? '' : e.message, final: true });
    } finally {
      for (const [k, v] of running.current) if (v === ctl) running.current.delete(k);
    }
  }

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    run({ type: 'chat', text: t });
  };
  const startAction = (a) => {
    const n = (conv.attachments || []).filter((x) => x.kind !== 'image').length;
    if (a.needs && n < a.needs) { toast(a.needs > 1 ? tr('Attach at least {0} documents first.', a.needs) : tr('Attach a document first.'), 'error'); setAttachSheet(true); return; }
    if (a.ask) { setAskAction(a); setAskText(''); return; }
    run({ type: a.type, text: '' });
  };
  const submitAsk = () => {
    const a = askAction; const t = askText.trim();
    if (!t) return;
    setAskAction(null);
    run({ type: a.type, text: t, input: { [a.key || (a.type === 'analyze' ? 'question' : 'topic')]: t } });
  };
  const cancel = (m) => { const ctl = running.current.get(m.jobId); if (ctl) ctl.abort(); else if (m.jobId) engine.cancelTask(m.jobId); };
  const retry = (m) => {
    const idx = conv.messages.findIndex((x) => x.id === m.id);
    const q = conv.messages[idx - 1];
    if (!q) return;
    save({ ...conv, messages: conv.messages.filter((x) => x.id !== m.id && x.id !== q.id) });
    setTimeout(() => run({ type: m.type || 'chat', text: q.text, input: q.text && m.type !== 'chat' ? { [ACTION[m.type] && ACTION[m.type].key || (m.type === 'analyze' ? 'question' : 'topic')]: q.text } : undefined }), 0);
  };

  /* ---------- results ---------- */
  const copy = async (text) => { try { await navigator.clipboard.writeText(mdToPlain(text)); toast(tr('Copied')); } catch (e) { toast(tr('Copy is blocked here.'), 'error'); } };
  const saveAsDoc = async (m) => {
    const title = (conv.title || tr('Writex AI result')).slice(0, 80);
    const d = await store.createDoc({ title, delta: normalizeDelta(mdToDelta(m.text)) });
    toast(tr('Saved to Write'));
    openDoc(d.id);
  };
  const exportText = async (m) => {
    const r = await saveFile(safeFilename(conv.title || 'Writex AI', 'md'), new Blob([m.text], { type: 'text/markdown' }));
    if (r === 'saved') toast(savedLabel(tr('File ready')));
  };
  const doInsert = async ({ m, doc }) => {
    const d = await store.getDoc(doc.id);
    if (!d || d.locked) { toast(tr('This document is password protected. Open it in Write first to unlock it.'), 'error'); return; }
    const ops = [...((d.delta && d.delta.ops) || [])];
    const add = normalizeDelta(mdToDelta('\n' + m.text)).ops;
    await store.updateDoc(d.id, { delta: { ops: [...ops, ...add] }, text: (d.text || '') + '\n' + mdToPlain(m.text) });
    toast(tr('Added to the end of “{0}”', d.title));
    setConfirmInsert(null);
  };

  if (!conv) return <div className="empty"><span className="spin" /></div>;
  const hasDocs = conv.attachments.some((a) => a.kind !== 'image');

  return (
    <div className="wx">
      <div className="wx-head">
        <div className="wx-title"><span className="wx-badge"><Icon name="Sparkles" size={16} /></span><b>{tr('Writex AI')}</b>
          <span className={'wx-dot ' + (ready ? 'ok' : status ? 'warn' : '')} title={ready ? tr('Connected') : (status && status.message) || ''} /></div>
        <div className="sec-top-actions">
          <button type="button" className="tb lg" aria-label={tr('Conversation history')} onClick={() => setHistorySheet(true)}><Icon name="History" size={20} /></button>
          <button type="button" className="tb lg" aria-label={tr('New conversation')} onClick={() => setConv(newConv())}><Icon name="SquarePen" size={20} /></button>
        </div>
      </div>

      {status && !status.ready && (
        <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{status.message}</span><button type="button" className="link-btn" onClick={openSettings}>{tr('Settings')}</button></div>
      )}

      <div className="wx-msgs">
        {!conv.messages.length && (
          <div className="wx-intro">
            <h2>{tr('What can Writex AI do for you?')}</h2>
            <p>{tr('Write, rewrite and continue documents; summarise, compare and question long PDFs and Word files; build study guides, quizzes and research outlines. Attach documents for answers based on them.')}</p>
            <p className="wx-private"><Icon name="ShieldCheck" size={16} />{tr('Runs privately on this phone. Works offline. Your documents and conversations never leave the device.')}{status && status.model ? ' · ' + status.model.model : ''}</p>
          </div>
        )}
        {conv.messages.map((m) => (m.role === 'user' ? (
          <div key={m.id} className="wx-msg user" dir="auto">
            {m.action && <span className="wx-act"><Icon name={(ACTION[m.action] || {}).icon || 'Sparkles'} size={14} />{(ACTION[m.action] || {}).label}</span>}
            {m.text && <div>{m.text}</div>}
            {m.attachments && m.attachments.length > 0 && <div className="wx-att-line"><Icon name="Paperclip" size={13} />{m.attachments.join(' · ')}</div>}
          </div>
        ) : (
          <div key={m.id} className={'wx-msg bot ' + m.status}>
            {!engine.isFinished(m.status) && (
              <div className="wx-task" role="status">
                <span className="spin" /><span>{stateText(m)}</span>
                <button type="button" className="btn sm ghost" onClick={() => cancel(m)}><Icon name="Square" size={14} />{tr('Cancel')}</button>
              </div>
            )}
            {m.text && <div className="wx-md" dir="auto" dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }} />}
            {m.status === 'failed' && <div className="wx-err"><Icon name="CircleAlert" size={16} /><span>{m.error || tr('The task failed.')}</span><button type="button" className="btn sm" onClick={() => retry(m)}><Icon name="RotateCcw" size={14} />{tr('Retry')}</button></div>}
            {m.status === 'cancelled' && <div className="wx-err muted"><span>{tr('Cancelled.')}</span><button type="button" className="btn sm" onClick={() => retry(m)}><Icon name="RotateCcw" size={14} />{tr('Retry')}</button></div>}
            {m.status === 'completed' && m.text && (
              <div className="wx-actions">
                <button type="button" className="btn sm" onClick={() => copy(m.text)}><Icon name="Copy" size={14} />{tr('Copy')}</button>
                <button type="button" className="btn sm" onClick={() => setInsertFor(m)}><Icon name="FileInput" size={14} />{tr('Insert into document')}</button>
                <button type="button" className="btn sm" onClick={() => saveAsDoc(m)}><Icon name="FilePlus2" size={14} />{tr('Save as document')}</button>
                <button type="button" className="btn sm" onClick={() => exportText(m)}><Icon name="Download" size={14} />{tr('Export')}</button>
              </div>
            )}
          </div>
        )))}
        <div ref={endRef} />
      </div>

      <div className="wx-actions-row" role="list" aria-label={tr('Suggested actions')}>
        {ACTIONS.filter((a) => (hasDocs ? a.needs > 0 || a.type === 'write' : a.needs === 0)).map((a) => (
          <button type="button" key={a.type} role="listitem" data-action={a.type} className="fchip" onClick={() => startAction(a)}><Icon name={a.icon} size={15} />{a.label}</button>
        ))}
      </div>

      {upload && (
        <div className="wx-upload" role="status">
          <span className="spin" /><span>{tr('Reading {0} of {1}: {2}', upload.i, upload.n, upload.name)}</span>
        </div>
      )}
      {conv.attachments.length > 0 && (
        <div className="wx-atts">
          {conv.attachments.map((a) => (
            <span key={a.key} className="chip wx-chip"><Icon name={a.kind === 'doc' ? 'PenLine' : 'FileText'} size={13} /><span dir="auto">{a.name}</span>
              <button type="button" aria-label={tr('Remove {0}', a.name)} onClick={() => removeAttachment(a.key)}><Icon name="X" size={12} /></button></span>
          ))}
        </div>
      )}
      <div className="m-composer wx-composer">
        <button type="button" className="tb lg" aria-label={tr('Attach documents or PDFs')} onClick={() => setAttachSheet(true)}><Icon name="Paperclip" size={20} /></button>
        <textarea id="wx-input" dir="auto" rows={1} value={input} placeholder={tr('Message Writex AI…')} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } }} />
        <button type="button" className="tb lg accent" aria-label={tr('Send')} disabled={!input.trim()} onClick={send}><Icon name="ArrowUp" size={20} /></button>
      </div>
      <input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" onChange={onDeviceFile} />

      <Sheet open={attachSheet} onClose={() => setAttachSheet(false)} title={tr('Attach')} className="sheet-tall">
        <button type="button" className="mrow" onClick={() => fileRef.current && fileRef.current.click()}>
          <span className="mrow-ico"><Icon name="Upload" size={19} /></span><span className="mrow-label">{tr('From this device')}<small>{tr('PDF, Word or text files')}</small></span>
        </button>
        <p className="hint" style={{ margin: '10px 4px 6px' }}>{tr('Or pick from your documents and files:')}</p>
        <SourcePicker onPick={pickSource} />
      </Sheet>

      <Sheet open={historySheet} onClose={() => setHistorySheet(false)} title={tr('Conversations')} className="sheet-tall">
        <button type="button" className="mrow" onClick={() => { setConv(newConv()); setHistorySheet(false); }}><span className="mrow-ico"><Icon name="Plus" size={19} /></span><span className="mrow-label">{tr('New conversation')}</span></button>
        {convs.map((c) => (
          <div key={c.id} className="mrow">
            <button type="button" className="mrow-main" onClick={() => { setConv(c); setHistorySheet(false); }}>
              <span className="mrow-label" dir="auto">{c.title || tr('Conversation')}<small>{fmtDate(c.updatedAt)}</small></span>
            </button>
            <button type="button" className="tb" aria-label={tr('Delete')} onClick={async () => { await db.del('aichats', c.id); setConvs((l) => l.filter((x) => x.id !== c.id)); if (conv.id === c.id) setConv(newConv()); }}><Icon name="Trash2" size={17} /></button>
          </div>
        ))}
      </Sheet>

      <Sheet open={!!askAction} onClose={() => setAskAction(null)} title={askAction ? askAction.label : ''}>
        {askAction && (
          <div className="form-stack">
            <label className="field"><span>{askAction.ask}</span><textarea id="wx-ask" dir="auto" rows={3} value={askText} onChange={(e) => setAskText(e.target.value)} autoFocus /></label>
            <button type="button" className="btn primary" disabled={!askText.trim()} onClick={submitAsk}>{tr('Start')}</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!insertFor} onClose={() => setInsertFor(null)} title={tr('Insert into which document?')} className="sheet-tall">
        {insertFor && <DocPicker onPick={(doc) => { setConfirmInsert({ m: insertFor, doc }); setInsertFor(null); }} />}
      </Sheet>
      {confirmInsert && (
        <ConfirmDialog title={tr('Add to this document?')} danger={false} confirmLabel={tr('Add to end')}
          message={tr('The result will be added to the end of “{0}”. Nothing already in the document changes.', confirmInsert.doc.title)}
          onConfirm={() => doInsert(confirmInsert)} onClose={() => setConfirmInsert(null)} />
      )}
    </div>
  );
}

function DocPicker({ onPick }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => { store.listDocs().then((l) => setDocs(l.filter((d) => !d.locked))).catch(() => setDocs([])); }, []);
  if (!docs) return <div className="empty"><span className="spin" /></div>;
  if (!docs.length) return <p className="hint">{tr('No documents yet.')}</p>;
  return (
    <div className="mlist">
      {docs.map((d) => (
        <button type="button" key={d.id} className="mrow" onClick={() => onPick(d)}>
          <span className="mrow-ico"><Icon name="FileText" size={18} /></span><span className="mrow-label" dir="auto">{d.title}<small>{fmtDate(d.updatedAt)}</small></span>
        </button>
      ))}
    </div>
  );
}

// Task history: everything Writex AI has run for this device.
export function TasksPanel({ toast, openDoc }) {
  const [jobs, setJobs] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const load = async () => { setJobs(await engine.listJobs()); };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const remove = async (j) => { await engine.deleteJob(j.id); load(); };
  const toDoc = async (j) => { const d = await store.createDoc({ title: (j.title || TYPE_LABEL[j.type] || 'Writex AI').slice(0, 80), delta: normalizeDelta(mdToDelta(resultText(j))) }); openDoc(d.id); };

  if (!jobs) return <div className="empty"><span className="spin" /></div>;
  return (
    <div className="wx-tasks">
      
      {!jobs.length && <div className="empty"><Icon name="ListTodo" size={28} /><p>{tr('No Writex AI tasks yet. Tasks you start anywhere in the app appear here, with their results.')}</p></div>}
      <div className="drows">
        {jobs.map((j) => (
          <div key={j.id} className="drow">
            <button type="button" className="drow-main" onClick={() => setOpen(j)}>
              <span className={'wx-state s-' + j.status}>{engine.isFinished(j.status) ? <Icon name={j.status === 'completed' ? 'CircleCheck' : j.status === 'failed' ? 'CircleAlert' : 'CircleSlash'} size={18} /> : <span className="spin" />}</span>
              <span className="drow-text"><span className="drow-title" dir="auto">{j.title || TYPE_LABEL[j.type] || j.type}</span><span className="drow-meta">{stateText(j)} · {fmtDate(j.createdAt)}</span></span>
            </button>
            {!engine.isFinished(j.status) && <button type="button" className="tb" aria-label={tr('Cancel')} onClick={() => engine.cancelTask(j.id)}><Icon name="Square" size={16} /></button>}
            {engine.isFinished(j.status) && <button type="button" className="tb" aria-label={tr('Delete')} onClick={() => remove(j)}><Icon name="Trash2" size={16} /></button>}
          </div>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? (open.title || TYPE_LABEL[open.type] || '') : ''} className="sheet-tall">
        {open && (
          <div className="form-stack">
            <p className="hint">{stateText(open)} · {fmtDate(open.createdAt)}{open.error ? ' · ' + open.error : ''}</p>
            {resultText(open) ? <div className="wx-md" dir="auto" dangerouslySetInnerHTML={{ __html: mdToHtml(resultText(open)) }} /> : <p className="hint">{tr('No result yet.')}</p>}
            {resultText(open) && (
              <div className="wx-actions">
                <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(mdToPlain(resultText(open))); toast(tr('Copied')); } catch (e) { toast(tr('Copy is blocked here.'), 'error'); } }}><Icon name="Copy" size={14} />{tr('Copy')}</button>
                <button type="button" className="btn sm" onClick={() => toDoc(open)}><Icon name="FilePlus2" size={14} />{tr('Save as document')}</button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function useAIStatus() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let live = true;
    providerStatus(getAIConfig()).then((s) => { if (live) setSt(s); });
    return () => { live = false; };
  }, []);
  return st;
}
