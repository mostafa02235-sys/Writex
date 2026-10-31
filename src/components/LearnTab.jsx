import React, { useState, useEffect, useRef, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { Sheet, Seg, ConfirmDialog, PromptDialog } from './ui.jsx';
import { SourcePicker } from './SourcePicker.jsx';
import * as learn from '../learn.js';
import * as store from '../store.js';
import * as src from '../sources.js';
import { complete, clip, aiErrorText } from '../ai.js';
import { fmtDate, uid } from '../util.js';
import { tr, trn } from '../i18n.js';
import { locale } from '../i18n.js';

const nd = (e) => e.preventDefault();
const NEW_PER_DAY = 20;
const DIFF = { easy: 'easy — basic facts, names and definitions', medium: 'medium — main concepts and how they relate', hard: 'hard — details, comparisons and applying ideas from the text' };
const rules = (title, text) => `Use ONLY the document below. Every item must be answerable from the document alone. Do not use outside knowledge. Write in the document's language.\nDocument title: ${title}\nDocument:\n"""\n${text}\n"""\n\n`;

async function generateFrom(kind, source, opts, signal) {
  const r = await src.sourceText(source);
  const cl = clip(r.text);
  if (cl.text.trim().length < 200) throw new Error(tr('This document is too short to make study material from.'));
  let data;
  if (kind === 'flashcards') {
    data = await complete({ signal, json: true, prompt: rules(r.title, cl.text) + `Task: create ${opts.cards} flashcards. Difficulty: ${DIFF[opts.difficulty]}. Reply with only JSON: {"cards":[{"front":"question or term","back":"short answer","source":"exact passage of 8–30 words copied word-for-word from the document that contains the answer"}]}` });
    const all = (data && data.cards) || [];
    const kept = all.filter((c) => c.front && c.back && learn.grounded(c, r.text));
    return { title: r.title, items: kept, dropped: all.length - kept.length, clipped: cl.clipped };
  }
  const types = opts.types.map((t) => ({ mcq: 'multiple choice with 4 options', tf: 'true/false', short: 'short answer' }[t])).join(', ');
  data = await complete({ signal, json: true, prompt: rules(r.title, cl.text) + `Task: write a quiz of ${opts.questions} questions using these types: ${types}. Difficulty: ${DIFF[opts.difficulty]}. Reply with only JSON: {"title":"","questions":[{"type":"mcq","q":"","options":["","","",""],"answer":0,"explanation":"","source":"exact passage copied from the document"},{"type":"tf","q":"a statement","answer":true,"explanation":"","source":""},{"type":"short","q":"","answer":"model answer","explanation":"","source":""}]}. "answer" for mcq is the index of the correct option.` });
  const all = (data && data.questions) || [];
  const kept = all.filter((q) => q.q && learn.grounded(q, r.text) && (q.type !== 'mcq' || (Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(+q.answer) && +q.answer < q.options.length)));
  return { title: data.title || r.title, items: kept.map((q) => ({ ...q, id: uid('q'), answer: q.type === 'mcq' ? +q.answer : q.type === 'tf' ? q.answer === true || q.answer === 'true' : String(q.answer || '') })), dropped: all.length - kept.length, clipped: cl.clipped, docTitle: r.title };
}

/* ---------- review session ---------- */
function Review({ queue, onDone, toast }) {
  const [list] = useState(queue);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [stats, setStats] = useState({ again: 0, good: 0 });
  const c = list[i];
  const grade = async (g) => {
    const n = learn.schedule(c, g);
    await learn.saveCard(n);
    learn.logActivity('reviews').catch(() => {});
    setStats((s) => ({ again: s.again + (g === 0 ? 1 : 0), good: s.good + (g > 0 ? 1 : 0) }));
    setShow(false); setI(i + 1);
  };
  useEffect(() => {
    const k = (e) => { if (!c) return; if (e.key === ' ' && !show) { e.preventDefault(); setShow(true); } else if (show && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key - 1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  if (!c) {
    return (
      <div className="review-done">
        <Icon name="PartyPopper" size={34} />
        <h2>{tr('Session complete')}</h2>
        <p>{tr('{0} cards reviewed · {1} remembered · {2} to see again soon.', list.length, stats.good, stats.again)}</p>
        <button type="button" className="btn primary" onClick={onDone}>{tr('Back to Learn')}</button>
      </div>
    );
  }
  return (
    <div className="review">
      <div className="rv-top"><button type="button" className="tb lg" aria-label={tr('End review')} onClick={onDone}><Icon name="X" size={22} /></button><div className="rv-bar"><i style={{ width: (i / list.length) * 100 + '%' }} /></div><span className="tnum">{i + 1}/{list.length}</span></div>
      <button type="button" className={'flash' + (show ? ' flipped' : '')} onClick={() => setShow(true)} aria-label={show ? tr('Answer') : tr('Show answer')}>
        <span className="fl-label">{learn.isNew(c) ? tr('New card') : tr('Review')}</span>
        <span className="fl-front" dir="auto">{c.front}</span>
        {show && <><span className="fl-sep" /><span className="fl-back" dir="auto">{c.back}</span>{c.source && <q className="fl-src" dir="auto">{c.source}</q>}</>}
        {!show && <span className="fl-tap">{tr('Tap to show the answer')}</span>}
      </button>
      {show && (
        <div className="grades">
          {[[tr('Again'), 0, 'again'], [tr('Hard'), 1, 'hard'], [tr('Good'), 2, 'good'], [tr('Easy'), 3, 'easy']].map(([l, g, cls]) => (
            <button type="button" key={l} className={'grade g-' + cls} onClick={() => grade(g)}><b>{l}</b><span>{learn.nextLabel(c, g)}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- taking a quiz ---------- */
function TakeQuiz({ quiz, onDone }) {
  const qs = quiz.questions;
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [typed, setTyped] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);
  const q = qs[i];
  const record = (ok) => { setResults((r) => [...r, { id: q.id, ok }]); };
  const next = () => { setPick(null); setTyped(''); setRevealed(false); setI(i + 1); };
  const finished = i >= qs.length;
  useEffect(() => {
    if (!finished) return;
    const correct = results.filter((r) => r.ok).length;
    const attempt = { at: Date.now(), score: correct, total: qs.length, wrong: results.filter((r) => !r.ok).map((r) => r.id) };
    learn.saveQuiz({ ...quiz, attempts: [...(quiz.attempts || []), attempt].slice(-30) }).catch(() => {});
    learn.logActivity('quizzes').catch(() => {}); learn.logActivity('answered', qs.length).catch(() => {}); learn.logActivity('correct', correct).catch(() => {});
  }, [finished]);
  if (finished) {
    const correct = results.filter((r) => r.ok).length;
    const pct = Math.round((correct / qs.length) * 100);
    return (
      <div className="review-done">
        <div className="score-ring" style={{ '--p': pct }}><b className="tnum">{pct}%</b></div>
        <h2>{tr('{0} of {1} correct', correct, qs.length)}</h2>
        <div className="quiz-missed">
          {qs.filter((x) => results.find((r) => r.id === x.id && !r.ok)).map((x) => (
            <div key={x.id} className="missed"><b dir="auto">{x.q}</b><span dir="auto">{x.type === 'mcq' ? x.options[x.answer] : x.type === 'tf' ? (x.answer ? tr('True') : tr('False')) : x.answer}</span>{x.source && <q dir="auto">{x.source}</q>}</div>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={onDone}>{tr('Back to Learn')}</button>
      </div>
    );
  }
  const answered = q.type === 'short' ? revealed : pick !== null;
  const ok = q.type === 'mcq' ? pick === q.answer : q.type === 'tf' ? pick === q.answer : null;
  return (
    <div className="review">
      <div className="rv-top"><button type="button" className="tb lg" aria-label={tr('Stop quiz')} onClick={onDone}><Icon name="X" size={22} /></button><div className="rv-bar"><i style={{ width: (i / qs.length) * 100 + '%' }} /></div><span className="tnum">{i + 1}/{qs.length}</span></div>
      <div className="qcard">
        <span className="fl-label">{{ mcq: tr('Multiple choice'), tf: tr('True or false'), short: tr('Short answer') }[q.type]}</span>
        <h2 dir="auto">{q.q}</h2>
        {q.type === 'mcq' && (
          <div className="opts">
            {q.options.map((o, k) => (
              <button type="button" key={k} disabled={answered} className={'opt' + (answered && k === q.answer ? ' right' : '') + (answered && k === pick && k !== q.answer ? ' wrong' : '')}
                onClick={() => { setPick(k); record(k === q.answer); }}><i>{String.fromCharCode(65 + k)}</i><span dir="auto">{o}</span></button>
            ))}
          </div>
        )}
        {q.type === 'tf' && (
          <div className="opts two">
            {[true, false].map((v) => (
              <button type="button" key={String(v)} disabled={answered} className={'opt' + (answered && v === q.answer ? ' right' : '') + (answered && v === pick && v !== q.answer ? ' wrong' : '')}
                onClick={() => { setPick(v); record(v === q.answer); }}><span>{v ? tr('True · صح') : tr('False · خطأ')}</span></button>
            ))}
          </div>
        )}
        {q.type === 'short' && (
          <>
            <textarea id="quiz-short" dir="auto" rows={3} className="short-ans" value={typed} disabled={revealed} placeholder={tr('Type your answer')} onChange={(e) => setTyped(e.target.value)} />
            {!revealed && <button type="button" className="btn primary" onClick={() => setRevealed(true)}>{tr('Show model answer')}</button>}
            {revealed && <div className="model"><b>{tr('Model answer')}</b><p dir="auto">{q.answer}</p></div>}
            {revealed && results.length === i && (
              <div className="ai-actions"><button type="button" className="btn primary" onClick={() => record(true)}>{tr('I got it')}</button><button type="button" className="btn" onClick={() => record(false)}>{tr('Not yet')}</button></div>
            )}
          </>
        )}
        {answered && ok !== null && <div className={'verdict ' + (ok ? 'ok' : 'no')}>{ok ? tr('Correct') : tr('Not quite')}</div>}
        {answered && (q.explanation || q.source) && (
          <div className="explain">{q.explanation && <p dir="auto">{q.explanation}</p>}{q.source && <q dir="auto">{q.source}</q>}</div>
        )}
      </div>
      {answered && results.length > i && <div className="grades one"><button type="button" className="btn primary block" onClick={next}>{i + 1 < qs.length ? tr('Next question') : tr('See results')}</button></div>}
    </div>
  );
}

/* ---------- learn home ---------- */
export function LearnTab({ toast, request, aiOk, aiMessage }) {
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [act, setAct] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [mode, setMode] = useState(null); // {review} | {take} | {deck}
  const [gen, setGen] = useState(null); // {kind, source, opts, state}
  const [dialog, setDialog] = useState(null);
  const [editCard, setEditCard] = useState(null);
  const ctl = useRef(null);

  const refresh = async () => {
    const [d, c, q, a, s] = await Promise.all([learn.listDecks(), learn.allCards(), learn.listQuizzes(), learn.getActivity(), store.listSubjects().catch(() => [])]);
    setDecks(d); setCards(c); setQuizzes(q); setAct(a); setSubjects(s);
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (request && request.create) setGen({ kind: request.create, source: request.source, opts: request.opts, state: 'ready' }); }, [request && request.t]);

  const runGen = async () => {
    if (!gen || !gen.source) return;
    setGen({ ...gen, state: 'busy' });
    ctl.current = new AbortController();
    try {
      const r = await generateFrom(gen.kind, gen.source, gen.opts, ctl.current.signal);
      if (!r.items.length) throw new Error(tr('No items could be checked against the document, so nothing was saved. Try again or pick a longer document.'));
      let note = r.dropped ? tr('{0} item(s) were left out because their supporting text could not be found in the document.', r.dropped) : '';
      if (r.clipped) note += tr(' Only the first part of a long document was used.');
      if (gen.kind === 'flashcards') {
        const deck = await learn.saveDeck({ name: r.title, source: gen.source, difficulty: gen.opts.difficulty });
        await learn.addCards(deck.id, r.items);
        await refresh();
        setGen(null);
        setMode({ deck: deck.id });
        toast(tr('{0} flashcards ready. {1}', r.items.length, note));
      } else {
        const quiz = await learn.saveQuiz({ title: r.title, docTitle: r.docTitle, questions: r.items, difficulty: gen.opts.difficulty, source: gen.source });
        await refresh();
        setGen(null);
        toast(tr('Quiz ready with {0} questions. {1}', r.items.length, note));
        setMode({ take: quiz });
      }
    } catch (e) { setGen({ ...gen, state: 'ready' }); if (!e || e.code !== 'cancelled') toast(aiErrorText(e), 'error'); }
  };

  const now = Date.now();
  const today = store.dayKey();
  const newToday = cards.filter((c) => c.lastReviewed && store.dayKey(c.lastReviewed) === today && c.reps <= 1 && !c.lapses).length;
  const dueQueue = (filter) => {
    const pool = cards.filter((c) => !filter || c.deckId === filter);
    const due = pool.filter((c) => !learn.isNew(c) && learn.isDue(c, now)).sort((a, b) => a.due - b.due);
    const fresh = pool.filter(learn.isNew).slice(0, Math.max(0, NEW_PER_DAY - newToday));
    return [...due, ...fresh];
  };
  const queue = dueQueue();
  const reviewedToday = (act[today] || {}).reviews || 0;
  let streak = 0;
  for (let i = (act[today] && act[today].reviews) ? 0 : 1; i < 400; i++) { const k = store.dayKey(now - i * 86400000); if (act[k] && (act[k].reviews || act[k].quizzes)) streak++; else break; }
  const masteredN = cards.filter(learn.mastered).length;
  const attempts = quizzes.flatMap((q) => q.attempts || []).sort((a, b) => b.at - a.at).slice(0, 10);
  const avg = attempts.length ? Math.round((attempts.reduce((s, a) => s + a.score / a.total, 0) / attempts.length) * 100) : null;
  const days14 = Array.from({ length: 14 }, (_, i) => { const t = now - (13 - i) * 86400000; const k = store.dayKey(t); const d = act[k] || {}; return { k, n: (d.reviews || 0) + (d.answered || 0), lbl: new Date(t).toLocaleDateString(locale, { weekday: 'narrow' }) }; });
  const max14 = Math.max(1, ...days14.map((d) => d.n));
  const nextDue = cards.filter((c) => !learn.isNew(c)).sort((a, b) => a.due - b.due)[0];

  if (mode && mode.review) return <Review queue={mode.review} toast={toast} onDone={() => { setMode(null); refresh(); }} />;
  if (mode && mode.take) return <TakeQuiz quiz={mode.take} onDone={() => { setMode(null); refresh(); }} />;
  if (mode && mode.deck) {
    const deck = decks.find((d) => d.id === mode.deck);
    if (!deck) { setTimeout(() => setMode(null), 0); return null; }
    const dc = cards.filter((c) => c.deckId === deck.id);
    const dq = dueQueue(deck.id);
    return (
      <>
        <header className="sec-top">
          <button type="button" data-back className="tb lg" aria-label={tr('Back to Learn')} onClick={() => setMode(null)}><Icon name="ChevronLeft" size={24} /></button>
          <h1 className="subj-h1" dir="auto">{deck.name}</h1>
          <div className="sec-top-actions">
            <button type="button" className="tb lg" aria-label={tr('Rename deck')} onClick={() => setDialog({ kind: 'rename-deck', deck })}><Icon name="Pencil" size={19} /></button>
            <button type="button" className="tb lg" aria-label={tr('Delete deck')} onClick={() => setDialog({ kind: 'delete-deck', deck })}><Icon name="Trash2" size={19} /></button>
          </div>
        </header>
        <div className="study-stats">
          <div><b className="tnum">{dc.length}</b><span>{tr('cards')}</span></div>
          <div><b className="tnum">{dq.length}</b><span>{tr('to review')}</span></div>
          <div><b className="tnum">{dc.filter(learn.mastered).length}</b><span>{tr('mastered')}</span></div>
        </div>
        <div className="ai-actions">
          <button type="button" className="btn primary" disabled={!dq.length} onClick={() => setMode({ review: dq })}><Icon name="Play" size={16} />{tr('Review')}{' '}{dq.length || ''}</button>
          <button type="button" className="btn" disabled={!dc.length} onClick={() => setMode({ review: [...dc].sort(() => Math.random() - 0.5) })}><Icon name="Shuffle" size={16} />{tr('Practise all')}</button>
          <button type="button" className="btn" onClick={() => setEditCard({ deckId: deck.id, front: '', back: '' })}><Icon name="Plus" size={16} />{tr('Card')}</button>
        </div>
        {subjects.length > 0 && (
          <div className="mchips">{[{ id: null, name: tr('No subject') }, ...subjects].map((s) => <button type="button" key={s.id || 'none'} className={'mchip' + ((deck.subjectId || null) === s.id ? ' on' : '')} onClick={async () => { await learn.saveDeck({ ...deck, subjectId: s.id }); refresh(); }}>{s.name}</button>)}</div>
        )}
        <div className="card-list">
          {dc.map((c) => (
            <button type="button" key={c.id} className="card-row" onClick={() => setEditCard(c)}>
              <span dir="auto" className="cr-front">{c.front}</span><span dir="auto" className="cr-back">{c.back}</span>
              <span className="cr-meta">{learn.isNew(c) ? tr('New') : learn.mastered(c) ? tr('Mastered') : tr('Due {0}', fmtDate(c.due).toLowerCase())}</span>
            </button>
          ))}
        </div>
        <CardSheet card={editCard} onClose={() => setEditCard(null)} onSave={async (c) => { if (c.id) await learn.saveCard(c); else await learn.addCards(c.deckId, [c]); setEditCard(null); refresh(); }} onDelete={async (c) => { await learn.deleteCard(c.id); setEditCard(null); refresh(); }} />
        {dialog && dialog.kind === 'rename-deck' && <PromptDialog title={tr('Rename deck')} label={tr('Name')} initial={dialog.deck.name} onClose={() => setDialog(null)} onSubmit={async (v) => { await learn.saveDeck({ ...dialog.deck, name: v }); refresh(); }} />}
        {dialog && dialog.kind === 'delete-deck' && <ConfirmDialog title={tr('Delete deck?')} message={tr('“{0}” and its {1} cards will be removed.', dialog.deck.name, dc.length)} onClose={() => setDialog(null)} onConfirm={async () => { await learn.deleteDeck(dialog.deck.id); setMode(null); refresh(); }} />}
      </>
    );
  }

  return (
    <>
      <section className="revise-card">
        <div>
          <b className="tnum">{queue.length ? trn(queue.length, '{0} card to review', '{0} cards to review') : cards.length ? tr('All caught up') : tr('Start learning')}</b>
          <span>{queue.length ? tr('Daily revision keeps what you learn.') : nextDue ? tr('Next review {0}', new Date(nextDue.due).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })) : tr('Make flashcards from any document.')}</span>
        </div>
        {queue.length > 0 && <button type="button" className="btn primary" onClick={() => setMode({ review: queue })}><Icon name="Play" size={16} />{tr('Review now')}</button>}
      </section>
      <div className="study-stats four">
        <div><b className="tnum">{reviewedToday}</b><span>{tr('reviewed today')}</span></div>
        <div><b className="tnum">{streak}</b><span>{tr('day streak')}</span></div>
        <div><b className="tnum">{masteredN}<small>/{cards.length}</small></b><span>{tr('mastered')}</span></div>
        <div><b className="tnum">{avg == null ? '—' : avg + '%'}</b><span>{tr('quiz average')}</span></div>
      </div>
      <section className="stats-card learn-act" aria-label={tr('Study activity, last 14 days')}>
        <span className="sec-note">{tr('Last 14 days')}</span>
        <div className="st-week wide">{days14.map((d) => <div key={d.k} className={'st-day' + (d.k === today ? ' today' : '')}><i style={{ height: Math.max(3, Math.round((d.n / max14) * 48)) + 'px' }} /><span>{d.lbl}</span></div>)}</div>
      </section>
      {gen && (
        <section className="gen-card">
          <div className="sec-head"><h2>{gen.kind === 'flashcards' ? tr('New flashcards') : tr('New quiz')}</h2><button type="button" className="tb" aria-label={tr('Cancel')} onClick={() => { if (ctl.current) ctl.current.abort(); setGen(null); }}><Icon name="X" size={18} /></button></div>
          {gen.state === 'busy' ? <div className="ai-thinking"><span className="spin" />{tr('Reading “')}{gen.source.title}{tr('” and checking every item against it…')}</div> : (
            <>
              <SourcePicker value={gen.source} onPick={(s) => setGen({ ...gen, source: s })} />
              <div className="ai-actions"><button type="button" className="btn primary" disabled={!gen.source || !aiOk} onClick={runGen}><Icon name="Sparkles" size={16} />{tr('Generate')}</button></div>
              {!aiOk && <p className="mnote">{aiMessage}</p>}
            </>
          )}
        </section>
      )}
      <section className="sec">
        <div className="sec-head"><h2>{tr('Flashcard decks')}</h2>
          <div className="sec-top-actions">
            <button type="button" className="link-btn" onClick={() => setDialog({ kind: 'new-deck' })}><Icon name="Plus" size={14} />{tr('Empty deck')}</button>
            <button type="button" className="link-btn" onClick={() => setGen({ kind: 'flashcards', source: null, opts: { cards: 15, difficulty: 'medium' }, state: 'ready' })}><Icon name="Sparkles" size={14} />{tr('From document')}</button>
          </div>
        </div>
        {!decks.length ? <p className="mnote">{tr('No decks yet.')}</p> : (
          <div className="deck-grid">
            {decks.map((d) => {
              const dc = cards.filter((c) => c.deckId === d.id); const due = dueQueue(d.id).length; const m = dc.filter(learn.mastered).length;
              const sub = subjects.find((s) => s.id === d.subjectId);
              return (
                <button type="button" key={d.id} className="deck-card" onClick={() => setMode({ deck: d.id })} style={sub ? { '--sc': sub.color } : undefined}>
                  <b dir="auto">{d.name}</b>
                  <span>{trn(dc.length, '{0} card', '{0} cards')}{due ? tr(' · {0} due', due) : ''}</span>
                  <div className="deck-bar"><i style={{ width: (dc.length ? (m / dc.length) * 100 : 0) + '%' }} /></div>
                  {sub && <span className="chip"><i className="chip-dot" />{sub.name}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section className="sec">
        <div className="sec-head"><h2>{tr('Quizzes')}</h2><button type="button" className="link-btn" onClick={() => setGen({ kind: 'quiz', source: null, opts: { questions: 10, difficulty: 'medium', types: ['mcq', 'tf', 'short'] }, state: 'ready' })}><Icon name="Sparkles" size={14} />{tr('From document')}</button></div>
        {!quizzes.length ? <p className="mnote">{tr('No quizzes yet. Questions are made only from your document, and any question whose source text can\'t be found in it is removed.')}</p> : (
          <div className="drows">
            {quizzes.map((q) => {
              const best = (q.attempts || []).reduce((m, a) => Math.max(m, a.score / a.total), -1);
              return (
                <article key={q.id} className="drow">
                  <button type="button" className="drow-main" onClick={() => setMode({ take: q })}>
                    <span className="ftype t-doc"><Icon name="ListChecks" size={20} /><b>{q.questions.length}</b></span>
                    <span className="drow-text"><span className="drow-title" dir="auto">{q.title}</span><span className="drow-meta">{q.difficulty ? q.difficulty[0].toUpperCase() + q.difficulty.slice(1) + ' · ' : ''}{best >= 0 ? tr('best {0}% · ', Math.round(best * 100)) : ''}{(q.attempts || []).length}{' '}{tr('attempts')}</span></span>
                  </button>
                  <button type="button" className="tb lg" aria-label={tr('Delete {0}', q.title)} onClick={() => setDialog({ kind: 'delete-quiz', q })}><Icon name="Trash2" size={18} /></button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <p className="mnote">{tr('Reminders: what\'s due shows here every time you open Learn. Phone notifications need the future native app.')}</p>
      {dialog && dialog.kind === 'new-deck' && <PromptDialog title={tr('New deck')} label={tr('Deck name')} confirmLabel={tr('Create')} onClose={() => setDialog(null)} onSubmit={async (v) => { const d = await learn.saveDeck({ name: v }); await refresh(); setMode({ deck: d.id }); }} />}
      {dialog && dialog.kind === 'delete-quiz' && <ConfirmDialog title={tr('Delete quiz?')} message={tr('“{0}” and its results will be removed.', dialog.q.title)} onClose={() => setDialog(null)} onConfirm={async () => { await learn.deleteQuiz(dialog.q.id); refresh(); }} />}
    </>
  );
}

function CardSheet({ card, onClose, onSave, onDelete }) {
  const [c, setC] = useState(card);
  useEffect(() => { setC(card); }, [card]);
  return (
    <Sheet open={!!card} onClose={onClose} title={card && card.id ? tr('Edit card') : tr('New card')}>
      {c && (
        <div className="form-stack">
          <label className="field"><span>{tr('Front')}</span><textarea id="card-front" dir="auto" rows={2} value={c.front} onChange={(e) => setC({ ...c, front: e.target.value })} /></label>
          <label className="field"><span>{tr('Back')}</span><textarea id="card-back" dir="auto" rows={3} value={c.back} onChange={(e) => setC({ ...c, back: e.target.value })} /></label>
          {c.source && <p className="hint">{tr('From the document: “{0}”', c.source)}</p>}
          <div className="ai-actions">
            {c.id && <button type="button" className="btn ghost danger-text" onClick={() => onDelete(c)}>{tr('Delete')}</button>}
            <span className="grow" />
            <button type="button" className="btn primary" disabled={!c.front.trim() || !c.back.trim()} onClick={() => onSave(c)}>{tr('Save')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
