// Writex AI tasks, run entirely on the device.
//
// Each request becomes a task with real states (waiting → processing → analysing
// → generating → completed / failed / cancelled), saved on the phone. Long
// documents are read part by part: the model writes notes on each part, the notes
// are condensed if needed, and the final answer is written from them. Deterministic
// work (text extraction, splitting, keyword search, formatting) is done with normal
// code, not by the model.
import * as ai from './localAI.js';
import * as db from './db.js';
import { uid } from './util.js';
import { tr } from './i18n.js';

/* ---------- prompts ---------- */
export const SYSTEM = 'You are Writex AI, the assistant inside the Writex writing app. You run privately on the user\'s phone. '
  + 'Be accurate and well organised. When documents are provided, rely on them and say clearly when something is not in them; never invent quotes or facts. '
  + 'Use simple Markdown (# headings, - lists, **bold**) unless JSON is requested.';
const LANG = (pref) => (pref === 'ar' ? 'Answer in Arabic.' : pref === 'en' ? 'Answer in English.'
  : 'Answer in the same language as the request or, if none, the documents\' language.');

export const TASKS = {
  write: { final: (i) => `Write a complete, well-structured document with headings and paragraphs.\nTopic and details: ${i.brief}\n${LANG(i.lang)}`, tokens: 1400 },
  summarize: { goal: () => 'the main points, facts and conclusions', final: (i) => `Summarise the document${i.many ? 's' : ''}. Length: ${i.length || 'medium'} (short = 3-4 sentences; medium = one paragraph and 5-7 key points; detailed = section by section). ${LANG(i.lang)}`, tokens: 900 },
  analyze: { goal: (i) => `information that answers: ${i.question}`, retrieve: (i) => i.question, final: (i) => `Answer this question using only the documents: ${i.question}\nQuote short supporting passages. If the answer is not in the documents, say so. ${LANG(i.lang)}`, tokens: 700 },
  find: { goal: (i) => `every passage about: ${i.question}`, retrieve: (i) => i.question, final: (i) => `List every place in the documents that mentions "${i.question}", quoting each passage briefly and saying which document it is in. ${LANG(i.lang)}`, tokens: 700 },
  compare: { minSources: 2, goal: () => 'claims, numbers, structure, agreements and contradictions', final: (i) => `Compare the documents: what each covers, key similarities, key differences, and contradictions (say which document). End with a short conclusion. ${LANG(i.lang)}`, tokens: 1000 },
  extract: { goal: () => 'names, dates, numbers, definitions and tables', final: (i) => `Extract the important information from the documents: people and organisations, dates, numbers, definitions, and any tables (as Markdown tables). Add nothing that is not in the documents. ${LANG(i.lang)}`, tokens: 900 },
  explain: { goal: (i) => `explaining: ${i.topic || 'the main ideas'}`, final: (i) => `Explain ${i.topic ? '"' + i.topic + '"' : 'this material'} clearly for a student: start simply, then go deeper, with examples, and define each technical term. ${LANG(i.lang)}`, tokens: 1000 },
  study_guide: { goal: () => 'concepts, definitions, rules and examples for studying', final: (i) => `Create a study summary: overview, key concepts by section, definitions, rules or formulas, examples from the text, and a final checklist. ${LANG(i.lang)}`, tokens: 1200 },
  revision_plan: { goal: () => 'the topics and how difficult each is', final: (i) => `Create a ${i.days || 7}-day revision plan for this material: topics per day, active-recall tasks, practice and review days. ${LANG(i.lang)}`, tokens: 900 },
  quiz: { json: true, goal: () => 'facts and concepts suitable for exam questions', final: (i) => `Write a ${i.difficulty || 'hard'} exam of ${i.count || 10} questions using only the documents. Mix multiple choice (4 options), true/false and fill-in-the-blank (use ____ for the blank). Reply with JSON: {"title":"","questions":[{"type":"mcq|tf|blank","q":"","options":[""],"answer":"","explanation":""}]}. ${LANG(i.lang)}`, tokens: 1500 },
  flashcards: { json: true, goal: () => 'terms, definitions and facts worth memorising', final: (i) => `Create ${i.count || 15} flashcards from the documents only. Reply with JSON: {"cards":[{"front":"","back":""}]}. ${LANG(i.lang)}`, tokens: 1200 },
  outline: { goal: () => 'the main topics in order', final: (i) => `Create a presentation outline from the documents: a title slide and ${i.slides || 8} slides, each with a title and 3-5 short bullet points. ${LANG(i.lang)}`, tokens: 900 },
  research_outline: { goal: () => 'arguments, evidence and open questions', final: (i) => `Create a research outline${i.topic ? ' on "' + i.topic + '"' : ''}${i.hasSources ? ' using the supplied sources' : ''}: research question, aims, sections with points and evidence${i.hasSources ? ' (say which source)' : ''}, method ideas and open questions. ${LANG(i.lang)}`, tokens: 1000 },
  sources_review: { minSources: 1, goal: () => 'each source\'s claim, method, evidence and limits', final: (i) => `Review each supplied source: main claim, method, key evidence, strengths and limitations. Then compare them and suggest an order for the references. ${LANG(i.lang)}`, tokens: 1100 },
  organize: { final: (i) => `Turn these notes into a clear, organised document with headings and paragraphs. Keep every piece of information and the original language. Reply with only the document.\n\nNotes:\n"""\n${i.text}\n"""`, tokens: 1400 },
};

/* ---------- text helpers (no model involved) ---------- */
export function chunkText(text, maxChars) {
  const s = String(text || '');
  if (s.length <= maxChars) return s.trim() ? [s] : [];
  const out = []; let start = 0;
  while (start < s.length) {
    let end = Math.min(s.length, start + maxChars);
    if (end < s.length) {
      const win = s.slice(start + Math.floor(maxChars * 0.6), end);
      const p = win.lastIndexOf('\n\n');
      const q = Math.max(win.lastIndexOf('. '), win.lastIndexOf('؟ '), win.lastIndexOf('? '), win.lastIndexOf('\n'));
      const cut = p >= 0 ? p : q;
      if (cut >= 0) end = start + Math.floor(maxChars * 0.6) + cut + 1;
    }
    out.push(s.slice(start, end));
    if (end >= s.length) break;
    start = end;
  }
  return out;
}
const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
// Keyword search: ranks parts by how many query words they contain
export function rankParts(parts, query) {
  const q = new Set(words(query));
  if (!q.size) return parts.map((p, i) => ({ ...p, score: 0, i }));
  return parts.map((p, i) => {
    let score = 0;
    for (const w of words(p.text)) if (q.has(w)) score++;
    return { ...p, score, i };
  }).sort((a, b) => b.score - a.score || a.i - b.i);
}
export function parseJSON(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  throw new ai.LocalAIError('bad_output');
}

// Sizes are in characters. A 4-bit model with an 8k-token context handles about
// 9,000 characters of source text plus instructions and the answer.
let CHUNK = 9000;
let DIRECT = 10000;
let NOTE_TOKENS = 400;
// Smaller parts make the automated emulator test finish in reasonable time.
export function setScale(chunk, direct, noteTokens) { CHUNK = chunk; DIRECT = direct || chunk; NOTE_TOKENS = noteTokens || NOTE_TOKENS; }

/* ---------- task records ---------- */
const FINISHED = new Set(['completed', 'failed', 'cancelled']);
export const isFinished = (s) => FINISHED.has(s);
async function save(job) { job.updatedAt = Date.now(); await db.put('aijobs', { ...job }).catch(() => {}); }
export async function listJobs() { return (await db.getAll('aijobs').catch(() => [])).sort((a, b) => b.createdAt - a.createdAt); }
export const deleteJob = (id) => db.del('aijobs', id);
export async function clearJobs() { for (const j of await listJobs()) await db.del('aijobs', j.id); }
// Tasks that were running when the app closed cannot continue: mark them so they can be retried.
export async function markInterrupted() {
  for (const j of await listJobs()) if (!isFinished(j.status)) await save({ ...j, status: 'failed', error: tr('The app was closed before this task finished.'), errorCode: 'interrupted' });
}

const live = new Map(); // id → AbortController

/**
 * Runs a task. type: a TASKS key, 'chat', or 'prompt'.
 * input: { prompt?, messages?, sources?: [{name, text}], ...task options }
 * onState(job) reports state and real progress; onText(text) streams the answer.
 */
export async function runTask(type, input, { title, onState, onText, signal } = {}) {
  const job = { id: uid('job'), type, title: title || '', status: 'waiting', stage: null, progress: null, result: '', data: null, error: null, createdAt: Date.now(), input: { ...input, sources: (input.sources || []).map((s) => ({ name: s.name, chars: s.text.length })), messages: undefined } };
  const ctl = new AbortController();
  live.set(job.id, ctl);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  const set = async (patch) => { Object.assign(job, patch); await save(job); if (onState) onState({ ...job }); };
  await set({});
  try {
    const out = await execute(type, input, { set, onText: (t) => { job.result = t; if (onText) onText(t); }, signal: ctl.signal });
    await set({ status: 'completed', stage: null, progress: null, result: out.text, data: out.data || null, model: out.model });
    return { ...job };
  } catch (e) {
    const code = ctl.signal.aborted ? 'cancelled' : (e && e.code) || 'failed';
    await set({ status: code === 'cancelled' ? 'cancelled' : 'failed', stage: null, error: code === 'cancelled' ? null : (e && e.message) || String(e), errorCode: code });
    const err = e instanceof ai.LocalAIError ? e : new ai.LocalAIError(code);
    err.job = { ...job };
    throw err;
  } finally {
    live.delete(job.id);
  }
}
export function cancelTask(id) { const c = live.get(id); if (c) c.abort(); }

async function call(messages, { set, maxTokens, json, onText, signal, stage }) {
  const r = await ai.generate({
    messages, maxTokens, json, signal, onText,
    onState: (s) => { if (s === 'loading') set({ status: 'processing', stage: 'loading' }); },
  });
  if (stage) await set({ stage });
  return r;
}

async function execute(type, input, { set, onText, signal }) {
  await set({ status: 'processing', stage: 'preparing' });
  await ai.ensureLoaded((s) => s === 'loading' && set({ stage: 'loading' }));
  if (signal.aborted) throw new ai.LocalAIError('cancelled');

  // Plain prompts from the writing assistant, Studio, Learn and the companion
  if (type === 'prompt') {
    await set({ status: 'generating', stage: 'writing' });
    const r = await call([{ role: 'system', content: input.system || SYSTEM }, { role: 'user', content: String(input.prompt || '') }], { set, maxTokens: input.maxTokens || 1200, json: !!input.json, onText, signal });
    return { text: r.text, data: input.json ? parseJSON(r.text) : null, model: r.model.model };
  }

  const sources = (input.sources || []).filter((s) => s.text && s.text.trim());
  const total = sources.reduce((n, s) => n + s.text.length, 0);
  const task = type === 'chat' ? { goal: () => 'answering the user\'s latest question', retrieve: () => lastUser(input), tokens: 900 } : TASKS[type];
  if (!task) throw new ai.LocalAIError('bad_request');
  if (task.minSources && sources.length < task.minSources) throw Object.assign(new ai.LocalAIError('bad_request'), { message: tr('This task needs at least {0} documents.', task.minSources) });

  let material = '';
  if (total && total <= DIRECT) {
    material = sources.map((s, i) => `### Document ${i + 1}: ${s.name}\n${s.text}`).join('\n\n');
  } else if (total) {
    const parts = [];
    for (const s of sources) for (const c of chunkText(s.text, CHUNK)) parts.push({ name: s.name, text: c });
    const q = task.retrieve ? task.retrieve(input) : '';
    // Questions: read only the parts that match best (keyword search); other tasks read everything
    let chosen = parts;
    if (q) {
      const ranked = rankParts(parts, q).filter((p) => p.score > 0);
      chosen = (ranked.length ? ranked : parts).slice(0, 4).sort((a, b) => a.i - b.i);
    }
    const goal = task.goal ? task.goal(input) : 'the task';
    let notes = [];
    await set({ status: 'analyzing', stage: 'reading', progress: { done: 0, total: chosen.length } });
    for (let k = 0; k < chosen.length; k++) {
      if (signal.aborted) throw new ai.LocalAIError('cancelled');
      const r = await call([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `You are reading part ${k + 1} of ${chosen.length} of: ${chosen[k].name}.\nWrite compact notes for ${goal}: key facts, names, numbers, definitions and short exact quotes. If nothing is relevant, reply "(nothing)".\n\n"""\n${chosen[k].text}\n"""` },
      ], { set, maxTokens: NOTE_TOKENS, signal });
      if (!/^\(?nothing\)?\.?$/i.test(r.text.trim())) notes.push(`[${chosen[k].name}, part ${chosen[k].i + 1}]\n${r.text.trim()}`);
      await set({ progress: { done: k + 1, total: chosen.length } });
    }
    // Condense notes that are still too long to fit
    let round = 0;
    while (notes.join('\n\n').length > DIRECT && round < 3) {
      round++;
      const groups = chunkText(notes.join('\n\n'), CHUNK);
      await set({ status: 'analyzing', stage: 'condensing', progress: { done: 0, total: groups.length } });
      const next = [];
      for (let k = 0; k < groups.length; k++) {
        if (signal.aborted) throw new ai.LocalAIError('cancelled');
        const r = await call([{ role: 'system', content: SYSTEM }, { role: 'user', content: `Condense these notes for ${goal} without losing facts, numbers, names or source labels:\n\n${groups[k]}` }], { set, maxTokens: 500, signal });
        next.push(r.text.trim());
        await set({ progress: { done: k + 1, total: groups.length } });
      }
      notes = next;
    }
    material = 'Notes made from the documents (read in parts):\n' + notes.join('\n\n');
  }

  await set({ status: 'generating', stage: 'writing', progress: null });
  let messages;
  if (type === 'chat') {
    const hist = (input.messages || []).filter((m) => m.content).slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (material) hist[hist.length - 1] = { role: 'user', content: `${material}\n\n---\n${hist[hist.length - 1].content}` };
    messages = [{ role: 'system', content: SYSTEM + ' ' + LANG(input.lang) }, ...hist];
  } else {
    const info = { ...input, hasSources: sources.length > 0, many: sources.length > 1 };
    messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: task.final(info) + (material ? '\n\n' + material : '') }];
  }
  const r = await call(messages, { set, maxTokens: input.maxTokens || task.tokens || 900, json: !!task.json, onText, signal });
  return { text: r.text, data: task.json ? parseJSON(r.text) : null, model: r.model.model };
}

function lastUser(i) {
  const m = [...(i.messages || [])].reverse().find((x) => x.role === 'user');
  return m ? String(m.content) : '';
}
