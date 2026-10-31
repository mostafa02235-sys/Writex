// Client for the Writex AI server (server/ in this repository).
//
// The app never talks to model providers directly and never holds provider keys.
// It registers this device once, sends tasks as jobs, and follows them with a
// streaming connection. Jobs run on the server, so a task keeps going if the app
// is closed; its result is fetched when the app opens again.
import { storage } from './util.js';
import { tr } from './i18n.js';
import * as db from './db.js';
import { platform } from './platform.js';

const BUILD = (typeof window !== 'undefined' && window.__WRITEX_CONFIG) || {};
const FINISHED = new Set(['completed', 'failed', 'cancelled']);
export const isFinished = (s) => FINISHED.has(s);

export function serverUrl() {
  return String(storage.get('writex.aiServer', '') || BUILD.aiUrl || '').trim().replace(/\/+$/, '');
}
export const builtInServer = () => String(BUILD.aiUrl || '').replace(/\/+$/, '');
export function setServerUrl(url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  storage.set('writex.aiServer', u && u !== builtInServer() ? u : '');
  tokenPromise = null;
}
export const configured = () => !!serverUrl();

/* ---------- errors ---------- */
const MESSAGES = {
  unauthorized: () => tr('This device could not sign in to Writex AI. Try again.'),
  no_provider: () => tr('The Writex AI server is running but has no AI model connected yet.'),
  rate_limited: () => tr('Too many requests right now. Wait a moment and try again.'),
  quota: () => tr("Today's Writex AI allowance for this device is used up. It resets at midnight (UTC)."),
  too_large: () => tr('This file is too large for Writex AI.'),
  invite_required: () => tr('This Writex AI server is private and needs an invite.'),
  network: () => tr('Could not reach Writex AI. Check your internet connection.'),
  not_configured: () => tr('Writex AI is not connected to a server yet.'),
  timeout: () => tr('The task took longer than the time limit.'),
  provider_busy: () => tr('The AI service is busy. Try again in a moment.'),
  provider_down: () => tr('The AI service had a temporary problem. Try again.'),
  provider_auth: () => tr('The Writex AI server could not sign in to its AI provider.'),
  too_long: () => tr('This text is too long for the AI model. Try a smaller part.'),
  bad_output: () => tr('The answer was not in the expected format. Try again.'),
  missing_file: () => tr('An attached file is no longer on the server. Attach it again.'),
  refused: () => tr('The AI model declined this request.'),
  cancelled: () => tr('Cancelled.'),
};
export class AIError extends Error {
  constructor(code, message) { super((MESSAGES[code] && MESSAGES[code]()) || message || tr('Something went wrong.')); this.code = code; }
}

/* ---------- device token ---------- */
let tokenPromise = null;
const tokenKey = () => 'writex.aiToken.' + serverUrl();
async function token(force) {
  if (force) { storage.set(tokenKey(), null); tokenPromise = null; }
  const saved = storage.get(tokenKey(), null);
  if (saved) return saved;
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await raw('POST', '/v1/devices', { platform, appVersion: BUILD.version || '' }, false);
      storage.set(tokenKey(), res.token);
      return res.token;
    })().finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function raw(method, path, body, auth, signal) {
  if (!configured()) throw new AIError('not_configured');
  const headers = { 'content-type': 'application/json', 'x-writex-app': 'writex' };
  if (auth) headers.authorization = 'Bearer ' + (await token());
  let res;
  try {
    res = await fetch(serverUrl() + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AIError('cancelled');
    throw new AIError('network');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new AIError(err.code || (res.status === 401 ? 'unauthorized' : 'http'), err.message || tr('Writex AI answered with an error ({0}).', res.status));
  }
  return data;
}
async function api(method, path, body, signal) {
  try { return await raw(method, path, body, true, signal); } catch (e) {
    if (e.code !== 'unauthorized') throw e;
    await token(true); // the server was reset: sign this device in again
    return raw(method, path, body, true, signal);
  }
}

/* ---------- endpoints ---------- */
export async function health() {
  if (!configured()) return { ok: false, code: 'not_configured' };
  try {
    const res = await fetch(serverUrl() + '/v1/health', { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
    const h = await res.json();
    return { ok: !!h.ok, ready: !!h.ready, version: h.version };
  } catch (e) { return { ok: false, code: 'network' }; }
}
export const status = () => api('GET', '/v1/status');
export const usage = () => api('GET', '/v1/usage');
export const listJobs = (limit = 50) => api('GET', '/v1/jobs?limit=' + limit).then((r) => r.jobs);
export const getJob = (id) => api('GET', '/v1/jobs/' + id).then((r) => r.job);
export const cancelJob = (id) => api('POST', `/v1/jobs/${id}/cancel`).then((r) => r.job);
export const retryJob = (id) => api('POST', `/v1/jobs/${id}/retry`).then((r) => r.job);

// Uploads extracted document text or an image. onProgress(loaded, total) uses real byte counts.
export async function uploadFile({ name, kind, text, data, mime }, onProgress) {
  const body = JSON.stringify({ name, kind, text, data, mime });
  const send = (tok) => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', serverUrl() + '/v1/files');
    x.setRequestHeader('content-type', 'application/json');
    x.setRequestHeader('authorization', 'Bearer ' + tok);
    if (onProgress) x.upload.onprogress = (e) => onProgress(e.loaded, e.total || body.length);
    x.onload = () => {
      let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* empty */ }
      if (x.status >= 200 && x.status < 300) resolve(d);
      else reject(new AIError((d && d.error && d.error.code) || (x.status === 401 ? 'unauthorized' : 'http'), d && d.error && d.error.message));
    };
    x.onerror = () => reject(new AIError('network'));
    x.send(body);
  });
  if (!configured()) throw new AIError('not_configured');
  try { return await send(await token()); } catch (e) {
    if (e.code !== 'unauthorized') throw e;
    return send(await token(true));
  }
}

/* ---------- local task history (kept on the device) ---------- */
export async function saveLocal(job, extra) {
  const prev = (await db.get('aijobs', job.id).catch(() => null)) || {};
  const rec = { ...prev, ...extra, id: job.id, type: job.type, title: job.title || prev.title || '', status: job.status, stage: job.stage, progress: job.progress, result: job.result != null ? job.result : prev.result, data: job.data || prev.data || null, error: job.error, errorCode: job.errorCode, createdAt: job.createdAt || prev.createdAt || Date.now(), updatedAt: Date.now() };
  await db.put('aijobs', rec).catch(() => {});
  return rec;
}
export async function localJobs() {
  return (await db.getAll('aijobs').catch(() => [])).sort((a, b) => b.createdAt - a.createdAt);
}
export const deleteLocal = (id) => db.del('aijobs', id);

/* ---------- running and following jobs ---------- */
export async function createJob(type, input, { title, context } = {}) {
  const { job } = await api('POST', '/v1/jobs', { type, input, title });
  await saveLocal(job, { context: context || null });
  return job;
}

// Follows a job until it finishes. onText gets the whole text so far; onState gets
// the job (status, stage, real progress). Reconnects after dropped connections.
export async function followJob(id, { onText, onState, signal } = {}) {
  let text = ''; let attempts = 0;
  for (;;) {
    if (signal && signal.aborted) throw new AIError('cancelled');
    try {
      const res = await fetch(`${serverUrl()}/v1/jobs/${id}/events`, { headers: { authorization: 'Bearer ' + (await token()) }, signal });
      if (res.status === 401) { await token(true); continue; }
      if (!res.ok || !res.body) throw new AIError('network');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        attempts = 0;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'snapshot' || ev.type === 'reset') { text = ev.text || ''; if (onText) onText(text); }
          if (ev.type === 'delta') { text += ev.text; if (onText) onText(text); }
          if (ev.job && onState) onState(ev.job);
          if (ev.type === 'snapshot' || ev.type === 'state') saveLocal(ev.job);
          if (ev.type === 'done') {
            await saveLocal(ev.job);
            return ev.job;
          }
        }
      }
    } catch (e) {
      if ((signal && signal.aborted) || (e && e.name === 'AbortError')) throw new AIError('cancelled');
      if (e instanceof AIError && e.code !== 'network') throw e;
    }
    // Connection dropped before the end: the job keeps running on the server.
    attempts++;
    if (attempts > 6) {
      const j = await getJob(id).catch(() => null);
      if (j && isFinished(j.status)) { await saveLocal(j); return j; }
      throw new AIError('network');
    }
    await new Promise((r) => setTimeout(r, Math.min(15000, 800 * 2 ** attempts)));
  }
}

// Creates a job and waits for it. Aborting the signal cancels the job on the server.
export async function runJob(type, input, { title, context, onText, onState, signal } = {}) {
  const job = await createJob(type, input, { title, context });
  if (onState) onState(job);
  const onAbort = () => { cancelJob(job.id).catch(() => {}); };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const done = await followJob(job.id, { onText, onState, signal });
    if (done.status === 'failed') throw new AIError(done.errorCode, done.error);
    if (done.status === 'cancelled') throw new AIError('cancelled');
    return done;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

// After the app starts: pick up tasks that were still running when it closed.
export async function resumeUnfinished(onFinished) {
  if (!configured()) return;
  for (const j of await localJobs()) {
    if (isFinished(j.status)) continue;
    followJob(j.id).then((done) => onFinished && onFinished(done)).catch(() => {});
  }
}

export const answerLang = () => storage.get('writex.aiLang', 'auto');
export const setAnswerLang = (v) => storage.set('writex.aiLang', v);
