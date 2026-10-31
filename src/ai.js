// AI writing assistant: tasks + providers.
//
// Providers
// - "claude": built into this artifact through the viewer's own Claude account
//   (window.claude.use('sample')). No API key is involved.
// - "openai" / "gemini": need a server you control that holds the API key and
//   exposes POST {endpoint} with JSON {provider, prompt} → {text}. API keys must
//   never be placed in front-end code, so this app only stores the endpoint URL.
//   Inside the Claude artifact sandbox, calls to other servers are blocked, so
//   these providers only work once the app is deployed elsewhere.
import { storage } from './util.js';
import { tr } from './i18n.js';

export const LANGS = [
  { id: 'Arabic', label: 'العربية' }, { id: 'English', label: tr('English') }, { id: 'French', label: tr('Français') },
  { id: 'Spanish', label: tr('Español') }, { id: 'Turkish', label: tr('Türkçe') }, { id: 'German', label: tr('Deutsch') },
];
export const TONES = ['Formal', 'Friendly', 'Academic', 'Confident', 'Simple', 'Persuasive'];

// kind: 'replace' — result can replace the source text; 'insert' — result is new content
export const TASKS = [
  { id: 'improve', label: tr('Improve writing'), icon: 'Sparkles', kind: 'replace', ask: 'Improve the clarity, flow and word choice of the text. Keep its meaning, language and approximate length.' },
  { id: 'rewrite', label: tr('Rewrite'), icon: 'RefreshCw', kind: 'replace', ask: 'Rewrite the text in a fresh way with the same meaning, in the same language.' },
  { id: 'grammar', label: tr('Fix grammar'), icon: 'SpellCheck', kind: 'replace', ask: 'Correct grammar and punctuation mistakes only. Change nothing else. Keep the same language.' },
  { id: 'spelling', label: tr('Fix spelling'), icon: 'Check', kind: 'replace', ask: 'Correct spelling mistakes only (including Arabic hamza and taa marbuta errors). Change nothing else.' },
  { id: 'summarize', label: tr('Summarize'), icon: 'ListChecks', kind: 'insert', ask: 'Summarize the text in a short paragraph followed by 3–5 bullet points of key ideas. Use the same language as the text.' },
  { id: 'translate', label: tr('Translate'), icon: 'Languages', kind: 'replace', option: 'lang', ask: 'Translate the text into {lang}. Keep paragraph breaks. Output only the translation.' },
  { id: 'expand', label: tr('Expand'), icon: 'Maximize2', kind: 'replace', ask: 'Expand the text with more detail, examples and explanation, roughly doubling its length. Same language and tone.' },
  { id: 'shorten', label: tr('Shorten'), icon: 'Minimize2', kind: 'replace', ask: 'Make the text about half as long while keeping every key point. Same language.' },
  { id: 'titles', label: tr('Generate titles'), icon: 'Heading', kind: 'titles', ask: 'Suggest 6 short, strong titles for this text, in the same language as the text.' },
  { id: 'notes', label: tr('Notes → paragraphs'), icon: 'NotebookPen', kind: 'replace', ask: 'Turn these rough notes into clear, well-structured professional paragraphs. Same language. Do not invent facts that are not in the notes.' },
  { id: 'tone', label: tr('Change tone'), icon: 'Palette', kind: 'replace', option: 'tone', ask: 'Rewrite the text in a {tone} tone. Keep the meaning and the language.' },
  { id: 'explain', label: tr('Explain'), icon: 'Lightbulb', kind: 'insert', ask: 'Explain this text in simple terms for a student: what it means, key terms, and an example. Answer in the same language as the text.' },
];

export function buildPrompt(task, text, opts = {}) {
  const ask = task.ask.replace('{lang}', opts.lang || 'English').replace('{tone}', (opts.tone || 'Formal').toLowerCase());
  const format = task.kind === 'titles'
    ? 'Reply with only a JSON array of strings, for example ["Title one","Title two"].'
    : 'Reply with only the resulting text — no preamble, no quotation marks, no explanations, no Markdown headings or asterisks. Keep paragraph breaks as blank lines.';
  return `You are a writing assistant inside a document editor.\nTask: ${ask}\n${format}\n\nText:\n"""\n${text}\n"""`;
}

/* ---------- provider settings ---------- */
export const PROVIDERS = [
  { id: 'claude', label: 'Claude', note: tr('Built in. Uses your Claude account; no key needed.') },
  { id: 'openai', label: 'OpenAI', note: tr('Needs your own server endpoint that holds the API key.') },
  { id: 'gemini', label: 'Gemini', note: tr('Needs your own server endpoint that holds the API key.') },
];
export function getAIConfig() {
  return storage.get('writex.ai', { provider: 'claude', endpoints: { openai: '', gemini: '' } });
}
export function setAIConfig(c) { storage.set('writex.ai', c); }

let sampleFn;
export async function claudeSample() {
  if (sampleFn !== undefined) return sampleFn;
  try { sampleFn = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; }
  return sampleFn;
}

// Status for the UI: { ready, message }
export async function providerStatus(cfg) {
  if (cfg.provider === 'claude') {
    const s = await claudeSample();
    return s ? { ready: true } : { ready: false, message: tr('Claude is not available in this view. Open the app inside Claude to use the built-in assistant.') };
  }
  const ep = (cfg.endpoints || {})[cfg.provider];
  if (!ep) return { ready: false, message: tr('Add your server endpoint for {0} in AI settings. Keys stay on your server, never in this app.', cfg.provider === 'openai' ? 'OpenAI' : 'Gemini') };
  return { ready: true, warning: tr('Requests go to your server. Inside the Claude preview the sandbox blocks other servers, so this works after you deploy the app.') };
}

const ERR = {
  not_granted: tr('You declined access to Claude for this page. Reload the page to be asked again.'),
  rate_limited: tr('Too many requests right now. Wait a moment and try again.'),
  prompt_too_large: tr('That text is too long for one request. Select a smaller part.'),
  refused: tr('Claude declined this request.'),
  empty_completion: tr('No answer came back. Try again.'),
  upstream_error: tr('The AI service had a problem. Try again in a moment.'),
  sampling_disabled: tr('AI is turned off for this account or organization.'),
  session_expired: tr('Your Claude session expired. Reload the page.'),
  invalid_json: tr('The answer was not in the expected format. Try again.'),
};
export const aiErrorText = (e) => (e && ERR[e.code]) || (e && e.message) || tr('Something went wrong.');

// Run a task. onText receives the whole answer so far.
export async function runTask({ task, text, opts, signal, onText }) {
  const cfg = getAIConfig();
  const prompt = buildPrompt(task, text, opts);
  if (cfg.provider === 'claude') {
    const sample = await claudeSample();
    if (!sample) throw { code: 'unavailable', message: tr('Claude is not available in this view.') };
    if (task.kind === 'titles') {
      const arr = await sample.json(prompt, { signal, modelTier: 'quick' });
      return { titles: Array.isArray(arr) ? arr.map(String).slice(0, 8) : [] };
    }
    const { text: out, truncated } = await sample(prompt, { signal, onText: ({ text: t }) => onText && onText(clean(t)), modelTier: text.length > 6000 ? 'default' : 'quick' });
    return { text: clean(out), truncated };
  }
  // External provider through the user's own server
  const ep = (cfg.endpoints || {})[cfg.provider];
  if (!ep) throw { code: 'not_configured', message: tr('No server endpoint is set for this provider.') };
  let res;
  try {
    res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: cfg.provider, prompt }), signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw { code: 'cancelled', message: tr('Stopped.') };
    throw { code: 'network', message: tr('Could not reach your server. Inside the Claude preview, connections to other servers are blocked.') };
  }
  if (!res.ok) throw { code: 'http', message: tr('Your server answered with an error ({0}).', res.status) };
  const data = await res.json();
  if (task.kind === 'titles') {
    try { return { titles: JSON.parse(String(data.text).match(/\[[\s\S]*\]/)[0]) }; } catch (e) { return { titles: String(data.text || '').split('\n').filter(Boolean) }; }
  }
  const out = clean(String(data.text || ''));
  onText && onText(out);
  return { text: out };
}

function clean(t) {
  return String(t || '').replace(/^\s*```[a-z]*\n?|```\s*$/g, '').replace(/^\s*"""\s*|\s*"""\s*$/g, '').trim();
}


/* ---------- generic helpers used by Think, Create and Learn ---------- */
// Returns { text } or a parsed JSON value when json: true.
export async function complete({ prompt, turns, json, onText, signal, tier }) {
  const cfg = getAIConfig();
  if (cfg.provider === 'claude') {
    const sample = await claudeSample();
    if (!sample) throw { code: 'unavailable', message: tr('Claude is not available in this view. Open the app inside Claude to use AI features.') };
    const input = turns || prompt;
    if (json) return sample.json(input, { signal, modelTier: tier || 'default' });
    const { text, truncated } = await sample(input, { signal, onText: onText ? ({ text: t }) => onText(t) : undefined, modelTier: tier || 'default', cache: turns ? false : undefined });
    return { text, truncated };
  }
  const ep = (cfg.endpoints || {})[cfg.provider];
  if (!ep) throw { code: 'not_configured', message: tr('No server endpoint is set for this provider. Add one in the writing assistant settings.') };
  let res;
  const body = { provider: cfg.provider, prompt: turns ? turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n') : prompt };
  try { res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); } catch (e) {
    if (e && e.name === 'AbortError') throw { code: 'cancelled', message: tr('Stopped.') };
    throw { code: 'network', message: tr('Could not reach your server. Inside the Claude preview, connections to other servers are blocked.') };
  }
  if (!res.ok) throw { code: 'http', message: tr('Your server answered with an error ({0}).', res.status) };
  const data = await res.json();
  const text = String(data.text || '');
  if (json) {
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    if (!m) throw { code: 'invalid_json', message: tr('The answer was not in the expected format.') };
    return JSON.parse(m[0]);
  }
  if (onText) onText(text);
  return { text };
}

// Keep prompts inside provider limits; tells the caller whether text was cut.
export const MAX_SOURCE = 120000;
export function clip(text, max = MAX_SOURCE) {
  const t = String(text || '');
  return t.length > max ? { text: t.slice(0, max), clipped: true, total: t.length } : { text: t, clipped: false, total: t.length };
}
