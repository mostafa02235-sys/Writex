// Smart Learning: decks, spaced repetition (SM-2 style), quizzes and progress.
import * as db from './db.js';
import { uid } from './util.js';
import { dayKey } from './store.js';

const DAY = 86400000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ---------- decks & cards ---------- */
export async function listDecks() { return (await db.getAll('decks')).sort((a, b) => b.createdAt - a.createdAt); }
export async function saveDeck(deck) { const d = { createdAt: Date.now(), ...deck, id: deck.id || uid('deck') }; await db.put('decks', d); return d; }
export async function deleteDeck(id) { for (const c of await db.getByIndex('cards', 'deckId', id)) await db.del('cards', c.id); await db.del('decks', id); }
export const deckCards = (deckId) => db.getByIndex('cards', 'deckId', deckId);
export async function allCards() { return db.getAll('cards'); }
export async function addCards(deckId, list) {
  for (const c of list) await db.put('cards', { id: uid('card'), deckId, front: c.front, back: c.back, source: c.source || '', ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), createdAt: Date.now() });
}
export const saveCard = (c) => db.put('cards', c);
export const deleteCard = (id) => db.del('cards', id);

// grade: 0 again · 1 hard · 2 good · 3 easy
export function schedule(card, grade) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = card;
  if (grade === 0) { reps = 0; lapses += 1; interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else {
    if (reps === 0) interval = grade === 3 ? 3 : 1;
    else if (reps === 1) interval = grade === 1 ? 3 : grade === 3 ? 8 : 6;
    else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 3 ? ease * 1.3 : ease));
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    reps += 1;
  }
  const due = grade === 0 ? Date.now() + 10 * 60 * 1000 : startOfToday() + interval * DAY + 4 * 3600 * 1000;
  return { ...card, ease, interval, reps, lapses, due, lastReviewed: Date.now() };
}
export const nextLabel = (card, grade) => {
  const n = schedule(card, grade);
  if (grade === 0) return '10 min';
  return n.interval <= 1 ? '1 day' : n.interval < 30 ? `${n.interval} days` : `${Math.round(n.interval / 30)} mo`;
};
export const isDue = (c, now = Date.now()) => (c.due || 0) <= now;
export const isNew = (c) => !c.reps && !c.lapses;
export const mastered = (c) => (c.interval || 0) >= 21;

/* ---------- quizzes ---------- */
export async function listQuizzes() { return (await db.getAll('quizzes')).sort((a, b) => b.createdAt - a.createdAt); }
export async function saveQuiz(q) { const v = { createdAt: Date.now(), attempts: [], ...q, id: q.id || uid('quiz') }; await db.put('quizzes', v); return v; }
export const deleteQuiz = (id) => db.del('quizzes', id);

/* ---------- activity log (for the dashboard) ---------- */
export async function logActivity(kind, n = 1) {
  const cur = (await db.get('meta', 'learnlog')) || { key: 'learnlog', days: {} };
  const k = dayKey();
  const d = cur.days[k] || { reviews: 0, quizzes: 0, correct: 0, answered: 0 };
  d[kind] = (d[kind] || 0) + n;
  cur.days[k] = d;
  const keys = Object.keys(cur.days).sort();
  while (keys.length > 370) delete cur.days[keys.shift()];
  await db.put('meta', cur);
}
export async function getActivity() { return ((await db.get('meta', 'learnlog')) || { days: {} }).days; }

/* ---------- grounding check: keep only items whose quoted evidence is in the source ---------- */
const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[“”"'‘’«»]/g, '').replace(/\s+/g, ' ').trim();
export function grounded(item, sourceText) {
  const ev = norm(item.source || item.evidence || '');
  if (ev.length < 8) return false;
  const src = norm(sourceText);
  if (src.includes(ev)) return true;
  // allow small differences: check that most 5-word windows of the evidence appear
  const w = ev.split(' ');
  if (w.length < 6) return false;
  let hit = 0; let tot = 0;
  for (let i = 0; i + 5 <= w.length; i += 3) { tot++; if (src.includes(w.slice(i, i + 5).join(' '))) hit++; }
  return tot > 0 && hit / tot >= 0.6;
}
