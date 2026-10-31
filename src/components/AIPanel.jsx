import React, { useState, useEffect, useRef } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, Seg } from './ui.jsx';
import { TASKS, LANGS, TONES, PROVIDERS, getAIConfig, setAIConfig, providerStatus, runTask, aiErrorText } from '../ai.js';
import { diffWords } from '../diff.js';

const nd = (e) => e.preventDefault();
const MAX_CHARS = 60000;

// Captures the text the assistant works on, so the result can be applied to exactly that range.
function captureScope(q, range, scope) {
  if (!q) return null;
  const len = q.getLength();
  if (scope === 'document') {
    const text = q.getText(0, len - 1);
    return { index: 0, length: len - 1, text, label: 'Whole document' };
  }
  const r = range || { index: 0, length: 0 };
  if (scope === 'selection' && r.length > 0) return { index: r.index, length: r.length, text: q.getText(r.index, r.length), label: 'Selected text' };
  const [line] = q.getLine(Math.min(r.index, len - 1));
  if (!line) return null;
  const index = q.getIndex(line);
  const length = Math.max(0, line.length() - 1);
  return { index, length, text: q.getText(index, length), label: 'Current paragraph' };
}

export function AIPanel({ open, onClose, quill, lastRange, toast, setTitle, initialTask }) {
  const [page, setPage] = useState('tools');
  const [scope, setScope] = useState('selection');
  const [task, setTask] = useState(null);
  const [lang, setLang] = useState('English');
  const [tone, setTone] = useState('Formal');
  const [state, setState] = useState('idle'); // idle | thinking | streaming | done | error
  const [out, setOut] = useState('');
  const [titles, setTitles] = useState([]);
  const [err, setErr] = useState('');
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState({ ready: false, message: 'Checking AI…' });
  const [cfg, setCfg] = useState(getAIConfig);
  const [showDiff, setShowDiff] = useState(true);
  const [staleWarn, setStaleWarn] = useState(false);
  const ctl = useRef(null);

  const hasSel = !!(lastRange.current && lastRange.current.length > 0);
  useEffect(() => {
    if (!open) return;
    setScope(hasSel ? 'selection' : 'paragraph');
    setPage('tools');
    setState('idle'); setOut(''); setTitles([]); setErr(''); setStaleWarn(false);
    if (initialTask) setTask(TASKS.find((t) => t.id === initialTask) || null);
  }, [open]);
  useEffect(() => { let live = true; providerStatus(cfg).then((s) => { if (live) setStatus(s); }); return () => { live = false; }; }, [cfg, open]);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);

  const saveCfg = (c) => { setCfg(c); setAIConfig(c); };
  const pick = (t) => { setTask(t); if (t.id === 'summarize' || t.id === 'titles') setScope(hasSel ? 'selection' : 'document'); };

  const run = async (t = task) => {
    const q = quill();
    if (!t || !q) return;
    const s = captureScope(q, lastRange.current, scope);
    if (!s || !s.text.trim()) { setErr(scope === 'selection' ? 'Select some text in the document first.' : 'There is no text here yet.'); setState('error'); setPage('result'); return; }
    if (s.text.length > MAX_CHARS) { setErr(`That is ${s.text.length.toLocaleString()} characters. Select a part under ${MAX_CHARS.toLocaleString()} characters.`); setState('error'); setPage('result'); return; }
    setSrc(s); setTask(t); setOut(''); setTitles([]); setErr(''); setStaleWarn(false);
    setPage('result'); setState('thinking');
    ctl.current = new AbortController();
    try {
      const r = await runTask({ task: t, text: s.text, opts: { lang, tone }, signal: ctl.current.signal, onText: (txt) => { setOut(txt); setState('streaming'); } });
      if (r.titles) setTitles(r.titles); else setOut(r.text);
      setState('done');
      if (r.truncated) toast('The answer was cut short. Try a smaller selection.', 'error');
    } catch (e) {
      if (e && e.code === 'cancelled') { setState(out ? 'done' : 'idle'); if (!out) setPage('tools'); return; }
      if (e && e.text) setOut(e.text);
      setErr(aiErrorText(e)); setState('error');
    }
  };
  const stop = () => { if (ctl.current) ctl.current.abort(); };

  const asLines = (t) => t.replace(/\n{2,}/g, '\n');
  const inlineAttrs = (q, i) => { const op = q.getContents(i, 1).ops[0]; return op && typeof op.insert === 'string' ? op.attributes : undefined; };

  const replace = (force) => {
    const q = quill(); if (!q || !src || !out) return;
    const now = q.getText(src.index, src.length);
    if (now !== src.text && !force) { setStaleWarn(true); return; }
    const attrs = inlineAttrs(q, src.index);
    q.deleteText(src.index, src.length, 'user');
    q.insertText(src.index, asLines(out), attrs, 'user');
    q.setSelection(src.index, asLines(out).length, 'silent');
    toast('Replaced with the suggestion. Undo restores the original.');
    onClose();
  };
  const insertBelow = (text = out, heading) => {
    const q = quill(); if (!q || !text) return;
    const end = src ? src.index + src.length : (lastRange.current || { index: 0 }).index;
    const [line] = q.getLine(Math.min(end, q.getLength() - 1));
    const pos = line ? q.getIndex(line) + line.length() : q.getLength() - 1;
    const body = asLines(text);
    q.insertText(pos, body + '\n', 'user');
    q.formatLine(pos, body.length, { dir: 'auto', header: heading || false, list: false, blockquote: false }, 'user');
    q.setSelection(pos + body.length, 0, 'silent');
    toast('Added to the document.');
    onClose();
  };
  const copy = async (text = out) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy is blocked here. Select the text and copy it manually.', 'error'); }
  };

  const busy = state === 'thinking' || state === 'streaming';
  let body;
  let actions = null;
  if (page === 'settings') {
    actions = <button type="button" className="tb" aria-label="Back" onMouseDown={nd} onClick={() => setPage('tools')}><Icon name="ArrowLeft" size={20} /></button>;
    body = (
      <>
        <section className="msec">
          <h3>Provider</h3>
          <Seg label="AI provider" value={cfg.provider} onChange={(v) => saveCfg({ ...cfg, provider: v })} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
          <p className="mnote">{PROVIDERS.find((p) => p.id === cfg.provider).note}</p>
        </section>
        {cfg.provider !== 'claude' && (
          <section className="msec">
            <h3>Server endpoint</h3>
            <label className="field">
              <span>{cfg.provider === 'openai' ? 'OpenAI' : 'Gemini'} proxy URL</span>
              <input id={'ai-ep-' + cfg.provider} dir="ltr" type="url" placeholder="https://your-server.example/ai" value={(cfg.endpoints || {})[cfg.provider] || ''}
                onChange={(e) => saveCfg({ ...cfg, endpoints: { ...(cfg.endpoints || {}), [cfg.provider]: e.target.value.trim() } })} />
            </label>
            <p className="mnote">Your server keeps the API key and receives <code>{'{ provider, prompt }'}</code>, replying with <code>{'{ text }'}</code>. Never paste an API key into this app. Inside the Claude preview, requests to other servers are blocked, so use Claude here and switch providers after you deploy.</p>
          </section>
        )}
        <div className={'ai-status ' + (status.ready ? 'ok' : 'warn')}><Icon name={status.ready ? 'CircleCheck' : 'TriangleAlert'} size={16} /><span>{status.ready ? (status.warning || 'Ready') : status.message}</span></div>
      </>
    );
  } else if (page === 'result') {
    actions = !busy ? <button type="button" className="tb" aria-label="Back to tools" onMouseDown={nd} onClick={() => setPage('tools')}><Icon name="ArrowLeft" size={20} /></button> : null;
    const canReplace = task && task.kind === 'replace' && state === 'done' && out;
    body = (
      <>
        {src && (
          <details className="ai-src">
            <summary>{src.label} · {src.text.length.toLocaleString()} characters</summary>
            <div className="ai-src-text" dir="auto">{src.text.slice(0, 3000)}{src.text.length > 3000 ? '…' : ''}</div>
          </details>
        )}
        <div className="ai-result" aria-live="polite">
          <div className="ai-result-head">
            <span><Icon name={task ? task.icon : 'Sparkles'} size={16} />{task ? task.label : 'Result'}{task && task.option === 'lang' ? ` → ${lang}` : ''}{task && task.option === 'tone' ? ` · ${tone}` : ''}</span>
            {canReplace && <button type="button" className="link-btn" onMouseDown={nd} onClick={() => setShowDiff((v) => !v)}>{showDiff ? 'Hide changes' : 'Show changes'}</button>}
          </div>
          {state === 'thinking' && <div className="ai-thinking"><span className="spin" />Thinking… Claude may ask you to allow access the first time.</div>}
          {titles.length > 0 && (
            <div className="mlist">
              {titles.map((t, i) => (
                <div key={i} className="ai-title-row">
                  <span dir="auto">{t}</span>
                  <div>
                    <button type="button" className="btn sm" onMouseDown={nd} onClick={() => { setTitle(t); toast('Document renamed'); }}>Use as name</button>
                    <button type="button" className="btn sm" onMouseDown={nd} onClick={() => insertBelow(t, 1)}>Insert</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {out && (canReplace && showDiff && task.id !== 'translate'
            ? <div className="ai-out diff" dir="auto">{diffWords(src.text, out).map((p, i) => <span key={i} className={'d-' + p.type}>{p.text}</span>)}</div>
            : <div className="ai-out" dir="auto">{out}</div>)}
          {state === 'error' && <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{err}</span></div>}
          {staleWarn && (
            <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>The original text changed after the suggestion was made.</span>
              <button type="button" className="btn sm" onMouseDown={nd} onClick={() => replace(true)}>Replace anyway</button></div>
          )}
        </div>
        <div className="ai-actions">
          {busy && <button type="button" className="btn" onMouseDown={nd} onClick={stop}><Icon name="Square" size={16} />Stop</button>}
          {!busy && canReplace && <button type="button" className="btn primary" onMouseDown={nd} onClick={() => replace(false)}><Icon name="Replace" size={16} />Replace</button>}
          {!busy && out && state !== 'error' && <button type="button" className={'btn' + (canReplace ? '' : ' primary')} onMouseDown={nd} onClick={() => insertBelow()}><Icon name="CornerDownLeft" size={16} />Insert below</button>}
          {!busy && out && <button type="button" className="btn" onMouseDown={nd} onClick={() => copy()}><Icon name="Copy" size={16} />Copy</button>}
          {!busy && task && <button type="button" className="btn ghost" onMouseDown={nd} onClick={() => run(task)}><Icon name="RefreshCw" size={16} />Try again</button>}
        </div>
        {state === 'done' && canReplace && <p className="mnote">Nothing in your document changes until you tap Replace or Insert below.</p>}
      </>
    );
  } else {
    actions = <button type="button" className="tb" aria-label="AI settings" onMouseDown={nd} onClick={() => setPage('settings')}><Icon name="Settings" size={19} /></button>;
    body = (
      <>
        {!status.ready && <div className="ai-status warn"><Icon name="TriangleAlert" size={16} /><span>{status.message}</span></div>}
        <section className="msec">
          <h3>Work on</h3>
          <Seg label="Scope" value={scope} onChange={setScope} options={[
            { value: 'selection', label: hasSel ? 'Selection' : 'Selection (none)' }, { value: 'paragraph', label: 'Paragraph' }, { value: 'document', label: 'Document' },
          ]} />
        </section>
        <section className="msec">
          <h3>Tools</h3>
          <div className="ai-tools">
            {TASKS.map((t) => (
              <button type="button" key={t.id} className={'ai-tool' + (task && task.id === t.id ? ' on' : '')} onMouseDown={nd} onClick={() => pick(t)}>
                <Icon name={t.icon} size={18} /><span>{t.label}</span>
              </button>
            ))}
          </div>
        </section>
        {task && task.option === 'lang' && (
          <section className="msec"><h3>Translate into</h3>
            <div className="mchips">{LANGS.map((l) => <button type="button" key={l.id} className={'mchip' + (lang === l.id ? ' on' : '')} onMouseDown={nd} onClick={() => setLang(l.id)}>{l.label}</button>)}</div>
          </section>
        )}
        {task && task.option === 'tone' && (
          <section className="msec"><h3>Tone</h3>
            <div className="mchips">{TONES.map((t) => <button type="button" key={t} className={'mchip' + (tone === t ? ' on' : '')} onMouseDown={nd} onClick={() => setTone(t)}>{t}</button>)}</div>
          </section>
        )}
        <button type="button" className="btn primary block ai-run" disabled={!task || !status.ready || (scope === 'selection' && !hasSel)} onMouseDown={nd} onClick={() => run()}>
          <Icon name="Sparkles" size={18} />{task ? task.label : 'Choose a tool'}
        </button>
        {scope === 'selection' && !hasSel && <p className="mnote">Select text in the document, or switch to Paragraph or Document.</p>}
      </>
    );
  }

  return (
    <Sheet open={open} onClose={() => { stop(); onClose(); }} title={page === 'settings' ? 'AI settings' : 'Writing assistant'} actions={actions} className="sheet-ai">
      {body}
    </Sheet>
  );
}
