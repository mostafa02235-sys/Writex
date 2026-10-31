// Persistent AI job queue and runner.
//
// Every request becomes a job row in SQLite, so work survives app restarts and
// closed connections: the app can reconnect and read the result later. Jobs that
// were running when the server stopped are queued again on start-up.
//
// States: waiting → processing → (analyzing) → generating → completed | failed | cancelled
// Progress is only reported as real counts (e.g. "part 3 of 12"), never estimated.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { TASKS, SYSTEM, mapNotes } from '../ai/tasks.js';
import { chunkText } from '../docs/chunker.js';

const DIRECT_LIMIT = 60000;   // characters of source text sent in one request
const CHUNK = 20000;          // characters per part when a source is longer
const FINISHED = new Set(['completed', 'failed', 'cancelled']);
const now = () => Date.now();
const newId = () => 'job_' + crypto.randomBytes(9).toString('base64url');

export class JobError extends Error {
  constructor(message, code = 'failed') { super(message); this.code = code; }
}

export function createJobs({ db, registry, cfg, log = () => {} }) {
  const live = new Map(); // id → { emitter, controller, text, saveAt }
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  let stopped = false;

  const q = {
    insert: db.prepare(`INSERT INTO jobs (id, device_id, type, title, status, input_json, attempt, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?)`),
    get: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    list: db.prepare('SELECT * FROM jobs WHERE device_id = ? ORDER BY created_at DESC LIMIT ?'),
    waiting: db.prepare("SELECT * FROM jobs WHERE status = 'waiting' ORDER BY created_at ASC LIMIT 50"),
    update: db.prepare(`UPDATE jobs SET status = ?, stage = ?, progress_done = ?, progress_total = ?, model = COALESCE(?, model),
      updated_at = ?, started_at = COALESCE(started_at, ?) WHERE id = ?`),
    partial: db.prepare('UPDATE jobs SET result_text = ?, updated_at = ? WHERE id = ?'),
    finish: db.prepare(`UPDATE jobs SET status = ?, stage = NULL, result_text = ?, result_json = ?, error = ?, error_code = ?,
      updated_at = ?, finished_at = ? WHERE id = ?`),
    requeue: db.prepare("UPDATE jobs SET status = 'waiting', stage = NULL, progress_done = 0, progress_total = 0, attempt = attempt + 1, updated_at = ? WHERE status IN ('processing', 'analyzing', 'generating')"),
    file: db.prepare('SELECT id, name, kind, mime, text, data FROM files WHERE id = ? AND device_id = ?'),
    usage: db.prepare(`INSERT INTO usage (device_id, job_id, provider, model, input_chars, output_chars, input_tokens, output_tokens, ok, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  };

  const view = (row) => row && {
    id: row.id, type: row.type, title: row.title, status: row.status, stage: row.stage,
    progress: row.progress_total ? { done: row.progress_done, total: row.progress_total } : null,
    result: row.result_text, data: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error, errorCode: row.error_code, model: row.model, attempt: row.attempt, parentId: row.parent_id,
    createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at, finishedAt: row.finished_at,
    input: (() => { try { const i = JSON.parse(row.input_json); return { ...i, messages: undefined, text: undefined, prompt: undefined }; } catch (e) { return null; } })(),
  };
  const emit = (id, ev) => bus.emit(id, ev);

  function setState(id, status, stage, done = 0, total = 0, model = null) {
    q.update.run(status, stage || null, done, total, model, now(), status === 'waiting' ? null : now(), id);
    emit(id, { type: 'state', job: view(q.get.get(id)) });
  }

  function create(deviceId, { type, input = {}, title }, parentId = null, attempt = 1) {
    const task = TASKS[type];
    if (!task) throw new JobError(`Unknown task type "${type}".`, 'bad_request');
    const id = newId();
    q.insert.run(id, deviceId, type, (title || '').slice(0, 200) || null, JSON.stringify(input), attempt, parentId, now(), now());
    setImmediate(tick);
    return view(q.get.get(id));
  }

  const get = (deviceId, id) => { const r = q.get.get(id); return r && r.device_id === deviceId ? view(r) : null; };
  const list = (deviceId, limit = 50) => q.list.all(deviceId, Math.min(200, limit)).map(view);

  function cancel(deviceId, id) {
    const r = q.get.get(id);
    if (!r || r.device_id !== deviceId) return null;
    if (FINISHED.has(r.status)) return view(r);
    const l = live.get(id);
    if (l) { l.cancelled = true; l.controller.abort(); } else finish(id, 'cancelled', r.result_text, null, 'Cancelled.', 'cancelled');
    return view(q.get.get(id));
  }

  function retry(deviceId, id) {
    const r = q.get.get(id);
    if (!r || r.device_id !== deviceId) return null;
    if (!FINISHED.has(r.status)) throw new JobError('This task is still running.', 'conflict');
    return create(deviceId, { type: r.type, input: JSON.parse(r.input_json), title: r.title }, r.id, r.attempt + 1);
  }

  function finish(id, status, text, data, error, code) {
    q.finish.run(status, text || null, data ? JSON.stringify(data) : null, error || null, code || null, now(), now(), id);
    live.delete(id);
    emit(id, { type: 'done', job: view(q.get.get(id)) });
    setImmediate(tick);
  }

  function subscribe(id, fn) {
    bus.on(id, fn);
    return () => bus.off(id, fn);
  }
  const partialText = (id) => (live.get(id) || {}).text || '';

  /* ---------- scheduling ---------- */
  function running() {
    let total = 0; const perDevice = {};
    for (const l of live.values()) { total++; perDevice[l.deviceId] = (perDevice[l.deviceId] || 0) + 1; }
    return { total, perDevice };
  }
  function tick() {
    if (stopped) return;
    const r = running();
    for (const row of q.waiting.all()) {
      if (r.total >= cfg.limits.maxConcurrent) break;
      if ((r.perDevice[row.device_id] || 0) >= cfg.limits.deviceConcurrent) continue;
      r.total++; r.perDevice[row.device_id] = (r.perDevice[row.device_id] || 0) + 1;
      run(row);
    }
  }

  /* ---------- model calls with retry ---------- */
  async function callModel(job, l, tier, { system, messages, json, stream }) {
    const { provider, model } = registry.pick(tier);
    l.model = `${provider.id}:${model}`;
    const inputChars = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : m.content.reduce((k, p) => k + (p.text || '').length, 0)), 0) + (system || '').length;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (l.controller.signal.aborted) throw new JobError('Cancelled.', 'cancelled');
      let streamed = '';
      try {
        const out = await provider.generate({
          model, system, messages, json,
          signal: l.controller.signal,
          timeoutMs: cfg.limits.requestTimeoutMs,
          onText: stream ? (d) => { streamed += d; l.text += d; emit(job.id, { type: 'delta', text: d }); savePartial(job.id, l); } : null,
        });
        q.usage.run(job.device_id, job.id, provider.id, model, inputChars, out.text.length, out.usage.inputTokens ?? null, out.usage.outputTokens ?? null, 1, now());
        return out;
      } catch (e) {
        q.usage.run(job.device_id, job.id, provider.id, model, inputChars, 0, null, null, 0, now());
        if (l.controller.signal.aborted || e.code === 'cancelled') throw new JobError('Cancelled.', 'cancelled');
        lastErr = e;
        if (!e.retryable) break;
        if (stream && streamed) { l.text = l.text.slice(0, l.text.length - streamed.length); emit(job.id, { type: 'reset', text: l.text }); }
        log(`job ${job.id}: retrying after ${e.code}`);
        await new Promise((res) => setTimeout(res, [1000, 3000, 8000][attempt]));
      }
    }
    throw new JobError(lastErr ? lastErr.message : 'The AI provider failed.', lastErr ? lastErr.code : 'provider_error');
  }

  function savePartial(id, l) {
    const t = now();
    if (t - (l.saveAt || 0) > 1500) { l.saveAt = t; q.partial.run(l.text, t, id); }
  }

  /* ---------- the pipeline ---------- */
  function loadSources(job, input) {
    const out = [];
    for (const fid of input.fileIds || []) {
      const f = q.file.get(fid, job.device_id);
      if (!f) throw new JobError('An attached file is no longer on the server. Attach it again.', 'missing_file');
      out.push(f);
    }
    for (const d of input.documents || []) out.push({ name: d.name || 'Document', kind: 'text', text: String(d.text || '') });
    return out;
  }
  const block = (sources) => sources.filter((s) => s.kind === 'text').map((s, i) => `### Document ${i + 1}: ${s.name}\n${s.text}`).join('\n\n');

  // Reads long sources part by part and returns compact notes (stage "analyzing").
  async function analyze(job, l, sources, goal) {
    const parts = [];
    for (const s of sources.filter((x) => x.kind === 'text')) {
      for (const c of chunkText(s.text, CHUNK)) parts.push({ name: s.name, text: c });
    }
    let notes = [];
    setState(job.id, 'analyzing', 'reading', 0, parts.length, l.model);
    for (let i = 0; i < parts.length; i++) {
      const out = await callModel(job, l, 'fast', {
        system: SYSTEM,
        messages: [{ role: 'user', content: `${mapNotes(goal)}\n\nDocument: ${parts[i].name} (part ${i + 1} of ${parts.length})\n"""\n${parts[i].text}\n"""` }],
      });
      if (!/^\(nothing relevant\)$/i.test(out.text.trim())) notes.push(`[${parts[i].name}, part ${i + 1}]\n${out.text.trim()}`);
      setState(job.id, 'analyzing', 'reading', i + 1, parts.length, l.model);
    }
    // Condense again if the notes themselves are still too long
    let round = 0;
    while (notes.join('\n\n').length > DIRECT_LIMIT && round < 3) {
      round++;
      const groups = chunkText(notes.join('\n\n'), CHUNK, 0);
      setState(job.id, 'analyzing', 'condensing', 0, groups.length, l.model);
      const next = [];
      for (let i = 0; i < groups.length; i++) {
        const out = await callModel(job, l, 'fast', { system: SYSTEM, messages: [{ role: 'user', content: `Condense these notes for the goal "${goal}" without losing facts, numbers, names or source labels:\n\n${groups[i]}` }] });
        next.push(out.text.trim());
        setState(job.id, 'analyzing', 'condensing', i + 1, groups.length, l.model);
      }
      notes = next;
    }
    return notes.join('\n\n');
  }

  async function execute(job, l) {
    const input = JSON.parse(job.input_json);
    const task = TASKS[job.type];
    setState(job.id, 'processing', 'preparing', 0, 0);

    if (task.direct) {
      if (!input.prompt) throw new JobError('The request is empty.', 'bad_request');
      setState(job.id, 'generating', 'writing', 0, 0, registry.pick(task.tier(input)).provider.id + ':' + registry.pick(task.tier(input)).model);
      const out = await callModel(job, l, task.tier(input), { system: input.system || SYSTEM, messages: [{ role: 'user', content: String(input.prompt) }], json: !!input.json, stream: true });
      return { text: out.text, json: input.json ? parseJSON(out.text) : null };
    }

    const sources = loadSources(job, input);
    const images = sources.filter((s) => s.kind === 'image');
    const textLen = sources.reduce((n, s) => n + (s.kind === 'text' ? s.text.length : 0), 0);
    if (task.minSources && sources.filter((s) => s.kind === 'text').length < task.minSources) {
      throw new JobError(`This task needs at least ${task.minSources} documents.`, 'bad_request');
    }

    if (task.chat) {
      const msgs = (input.messages || []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content).slice(-20)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 20000) }));
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new JobError('The conversation has no question.', 'bad_request');
      let context = '';
      if (textLen > DIRECT_LIMIT) context = 'Notes made from the attached documents:\n' + await analyze(job, l, sources, task.goal({ messages: msgs }));
      else if (textLen) context = 'Attached documents:\n' + block(sources);
      if (context) msgs[msgs.length - 1] = { role: 'user', content: `${context}\n\n---\n${msgs[msgs.length - 1].content}` };
      if (images.length) msgs[msgs.length - 1] = { role: 'user', content: [{ type: 'text', text: msgs[msgs.length - 1].content }, ...images.map((im) => ({ type: 'image', dataUrl: im.data }))] };
      const tier = images.length ? 'vision' : (textLen > 20000 ? 'smart' : 'fast');
      setState(job.id, 'generating', 'writing', 0, 0, l.model);
      const out = await callModel(job, l, tier, { system: SYSTEM, messages: msgs, stream: true });
      return { text: out.text };
    }

    const info = { ...input, hasSources: sources.length > 0 };
    let material = '';
    if (textLen > DIRECT_LIMIT) material = '\n\nNotes made from the documents (read in parts):\n' + await analyze(job, l, sources, task.goal ? task.goal(info) : 'the task');
    else if (textLen) material = '\n\n' + block(sources);
    const content = task.final(info) + material;
    const parts = images.length ? [{ type: 'text', text: content }, ...images.map((im) => ({ type: 'image', dataUrl: im.data }))] : content;
    setState(job.id, 'generating', 'writing', 0, 0, l.model);
    const out = await callModel(job, l, images.length ? 'vision' : task.tier(info, textLen), { system: SYSTEM, messages: [{ role: 'user', content: parts }], json: !!task.json, stream: true });
    return { text: out.text, json: task.json ? parseJSON(out.text) : null };
  }

  function parseJSON(text) {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (e) { /* try the outermost object */ }
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* fall through */ } }
    throw new JobError('The model\'s answer was not in the expected format. Try again.', 'bad_output');
  }

  async function run(row) {
    const controller = new AbortController();
    const l = { deviceId: row.device_id, controller, text: '', model: null };
    live.set(row.id, l);
    const timer = setTimeout(() => { l.timedOut = true; controller.abort(); }, cfg.limits.jobTimeoutMs);
    try {
      const out = await execute(row, l);
      finish(row.id, 'completed', out.text, out.json, null, null);
    } catch (e) {
      if (stopped) return; // server shutting down: the job is queued again on next start
      if (l.cancelled) finish(row.id, 'cancelled', l.text, null, 'Cancelled.', 'cancelled');
      else if (l.timedOut) finish(row.id, 'failed', l.text, null, 'The task took longer than the time limit.', 'timeout');
      else finish(row.id, 'failed', l.text, null, e.message || 'The task failed.', e.code || 'failed');
      if (!l.cancelled && !(e instanceof JobError)) log(`job ${row.id} error: ${e.stack || e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  function start() {
    const n = q.requeue.run(now()).changes;
    if (n) log(`requeued ${n} interrupted job(s)`);
    tick();
  }
  function stop() {
    stopped = true;
    for (const l of live.values()) l.controller.abort();
  }

  return { create, get, list, cancel, retry, subscribe, partialText, start, stop, tick, FINISHED };
}
