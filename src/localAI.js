// Writex AI on-device engine (JavaScript side).
//
// The model runs inside the Android app through llama.cpp (native code in
// android/app/src/main/cpp). This module installs models, picks one that fits the
// phone, loads/unloads it, and streams answers. Prompts and documents never leave
// the device; the internet is only used to download a model once.
import * as N from 'writex-native';
import { storage } from './util.js';
import { tr } from './i18n.js';
import { isNative, BACKGROUND_EVENT } from './platform.js';

const plugin = N.WritexAI || null;
export const supported = !!(isNative && plugin);

const GB = 1024 * 1024 * 1024;
// Qwen2.5 Instruct models (multilingual, good Arabic and English), 4-bit GGUF.
export const MODELS = [
  {
    id: 'light', name: tr('Lightweight'), model: 'Qwen2.5 0.5B Instruct', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491400032, minRam: 3 * GB, maxCtx: 8192, license: 'Apache 2.0',
    note: tr('Fastest. Good for short rewrites and quick questions.'),
  },
  {
    id: 'standard', name: tr('Standard'), model: 'Qwen2.5 1.5B Instruct', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1117320736, minRam: 4 * GB, maxCtx: 8192, license: 'Apache 2.0',
    note: tr('Balanced quality and speed for writing, summaries and study material.'),
  },
  {
    id: 'advanced', name: tr('Advanced'), model: 'Qwen2.5 3B Instruct', file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: 2104932768, minRam: 6 * GB, maxCtx: 8192, license: 'Qwen Research License (personal and research use)',
    note: tr('Best answers and Arabic quality. Needs a phone with 6 GB of memory or more.'),
  },
];
export const modelById = (id) => MODELS.find((m) => m.id === id);

/* ---------- device and installed models ---------- */
export async function device() {
  if (!supported) return null;
  return plugin.device();
}
export function fits(m, dev) {
  if (!dev) return false;
  return dev.totalMem >= m.minRam * 0.93; // reported memory is a little below the marketed size
}
export function recommended(dev) {
  const ok = MODELS.filter((m) => fits(m, dev));
  return ok.length ? ok[ok.length - 1] : null;
}
export function installedSet(dev) {
  const files = new Map(((dev && dev.files) || []).map((f) => [f.file, f.size]));
  return new Set(MODELS.filter((m) => files.get(m.file) === m.size).map((m) => m.id));
}
export const activeId = () => storage.get('writex.aiModel', null);
export const setActive = (id) => storage.set('writex.aiModel', id);

// The model to use: the chosen one if installed, otherwise the best installed one that fits.
export async function currentModel(dev) {
  dev = dev || (await device());
  if (!dev) return null;
  const inst = installedSet(dev);
  const chosen = modelById(activeId());
  if (chosen && inst.has(chosen.id)) return chosen;
  const best = [...MODELS].reverse().find((m) => inst.has(m.id) && fits(m, dev)) || MODELS.find((m) => inst.has(m.id));
  return best || null;
}

/* ---------- installation ---------- */
const listeners = new Set();
let dlHandle = null;
export function onDownload(fn) {
  listeners.add(fn);
  if (supported && !dlHandle) dlHandle = plugin.addListener('download', (ev) => listeners.forEach((f) => f(ev)));
  return () => listeners.delete(fn);
}
export async function install(id) {
  const m = modelById(id);
  const dev = await device();
  if (!fits(m, dev)) throw new LocalAIError('too_big');
  if (dev.freeStorage < m.size + 200 * 1024 * 1024) throw new LocalAIError('no_storage');
  try {
    await plugin.download({ id: m.id, url: m.url, file: m.file, size: m.size });
  } catch (e) { throw new LocalAIError(codeOf(e)); }
  if (!activeId()) setActive(m.id);
  return true;
}
export const cancelInstall = () => plugin && plugin.cancelDownload();
export async function remove(id) {
  const m = modelById(id);
  await plugin.deleteModel({ file: m.file });
  if (activeId() === id) storage.set('writex.aiModel', null);
  loaded = null;
}

/* ---------- errors ---------- */
const MESSAGES = {
  unsupported: () => tr('Writex AI runs on the Android app, on your phone. It is not available in this view.'),
  no_model: () => tr('Install a Writex AI model first (Settings › Writex AI). After that it works offline.'),
  too_big: () => tr('This model needs more memory than this phone has. Choose a smaller model.'),
  no_storage: () => tr('Not enough free storage for this model.'),
  low_memory: () => tr('The phone is low on free memory right now. Close other apps and try again, or use a smaller model.'),
  network: () => tr('The download failed. Check your internet connection and try again; it continues where it stopped.'),
  busy: () => tr('Another model is downloading.'),
  too_long: () => tr('This request is too long for the model. Writex AI splits long documents automatically; try a shorter selection.'),
  engine_unavailable: () => tr('The Writex AI engine could not start on this device.'),
  model_load_failed: () => tr('The model file could not be loaded. Remove it and install it again.'),
  not_a_model: () => tr('The downloaded file is not a valid model. Try installing again.'),
  cancelled: () => tr('Cancelled.'),
  bad_output: () => tr('The answer was not in the expected format. Try again.'),
  bad_request: () => tr('Something went wrong.'),
};
export class LocalAIError extends Error {
  constructor(code) { super((MESSAGES[code] || (() => tr('Writex AI had a problem ({0}).', code)))()); this.code = code; }
}
function codeOf(e) {
  const c = (e && (e.code || e.message || e.errorMessage)) || '';
  const known = Object.keys(MESSAGES).find((k) => String(c).includes(k));
  return known || String(c || 'failed');
}

/* ---------- loading and memory ---------- */
let loaded = null;        // file name of the model in memory
let idleTimer = 0;
const IDLE_UNLOAD_MS = 4 * 60 * 1000;
function scheduleUnload() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { unload(); }, IDLE_UNLOAD_MS);
}
export async function unload() {
  clearTimeout(idleTimer);
  if (!supported || !loaded) return;
  loaded = null;
  try { await plugin.unload(); } catch (e) { /* ignore */ }
}
if (typeof window !== 'undefined') {
  // Free the model's memory when the app goes to the background and nothing is running
  window.addEventListener(BACKGROUND_EVENT, () => { if (!running) unload(); });
}

export async function ensureLoaded(onState) {
  if (!supported) throw new LocalAIError('unsupported');
  const dev = await device();
  const m = await currentModel(dev);
  if (!m) throw new LocalAIError('no_model');
  if (loaded !== m.file) {
    if (onState) onState('loading');
    try { await plugin.load({ file: m.file, maxCtx: m.maxCtx }); } catch (e) { throw new LocalAIError(codeOf(e)); }
    loaded = m.file;
  }
  scheduleUnload();
  return m;
}
export const isLoaded = () => !!loaded;

/* ---------- generation (one request at a time) ---------- */
let chain = Promise.resolve();
let running = 0;
let tokenHandle = null;
const tokenSubs = new Map();
let lastSpeed = storage.get('writex.aiSpeed', null);
export const speed = () => lastSpeed;

// messages: [{role: 'system'|'user'|'assistant', content}]. onText gets the whole text so far.
export function generate({ messages, maxTokens = 512, temperature = 0.6, json = false, onText, signal, onState }) {
  const run = async () => {
    if (signal && signal.aborted) throw new LocalAIError('cancelled');
    const m = await ensureLoaded(onState);
    if (!tokenHandle) tokenHandle = await plugin.addListener('token', (ev) => { const f = tokenSubs.get(ev.requestId); if (f) f(ev.text); });
    const requestId = 'r' + Math.random().toString(36).slice(2);
    let text = '';
    tokenSubs.set(requestId, (piece) => { text += piece; if (onText) onText(text); });
    const stop = () => plugin.stop().catch(() => {});
    if (signal) signal.addEventListener('abort', stop, { once: true });
    running++;
    clearTimeout(idleTimer);
    try {
      if (onState) onState('generating');
      const r = await plugin.generate({ requestId, messages, maxTokens, temperature: json ? 0.2 : temperature, grammar: json ? JSON_GRAMMAR : undefined });
      if (signal && signal.aborted) throw new LocalAIError('cancelled');
      if (r.outputTokens > 4 && r.genMs > 0) {
        lastSpeed = { tokensPerSecond: Math.round((r.outputTokens / r.genMs) * 10000) / 10, promptPerSecond: r.promptMs > 0 ? Math.round((r.promptTokens / r.promptMs) * 1000) : null, model: m.id, at: Date.now() };
        storage.set('writex.aiSpeed', lastSpeed);
      }
      return { text: r.text, promptTokens: r.promptTokens, outputTokens: r.outputTokens, model: m };
    } catch (e) {
      if (e instanceof LocalAIError) throw e;
      throw new LocalAIError(signal && signal.aborted ? 'cancelled' : codeOf(e));
    } finally {
      running--;
      tokenSubs.delete(requestId);
      if (signal) signal.removeEventListener('abort', stop);
      scheduleUnload();
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

export async function countTokens(text) {
  await ensureLoaded();
  const r = await plugin.countTokens({ text });
  return r.tokens;
}

// llama.cpp grammar that forces valid JSON (from llama.cpp's grammars/json.gbnf)
export const JSON_GRAMMAR = String.raw`root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws
object ::=
  "{" ws (
            string ":" ws value
    ("," ws string ":" ws value)*
  )? "}" ws
array  ::=
  "[" ws (
            value
    ("," ws value)*
  )? "]" ws
string ::=
  "\"" (
    [^"\\\x7F\x00-\x1F] |
    "\\" (["\\bfnrt] | "u" [0-9a-fA-F]{4})
  )* "\"" ws
number ::= ("-"? ([0-9] | [1-9] [0-9]{0,15})) ("." [0-9]+)? ([eE] [-+]? [0-9] [1-9]{0,15})? ws
ws ::= | " " | "\n" [ \t]{0,20}
`;
