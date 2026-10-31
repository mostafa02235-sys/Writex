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
import * as local from './localAI.js';
import * as engine from './aiEngine.js';
import { tr } from './i18n.js';

export const LANGS = [
  { id: 'Arabic', label: 'العربية' }, { id: 'English', label: tr('English') }, { id: 'French', label: tr('Français') },
  { id: 'Spanish', label: tr('Español') }, { id: 'Turkish', label: tr('Türkçe') }, { id: 'German', label: tr('Deutsch') },
];
export const TONES = ['Formal', 'Friendly', 'Academic', 'Confident', 'Simple', 'Persuasive'];
export const TONE_LABEL = { Formal: tr('Formal'), Friendly: tr('Friendly'), Academic: tr('Academic'), Confident: tr('Confident'), Simple: tr('Simple'), Persuasive: tr('Persuasive') };

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
  { id: 'continue', label: tr('Continue writing'), icon: 'PenLine', kind: 'insert', ask: 'Continue the text naturally from where it ends, in the same language, voice and formatting. Write about two paragraphs. Output only the continuation, without repeating the text.' },
  { id: 'organize', label: tr('Organise paragraphs'), icon: 'ListTree', kind: 'replace', ask: 'Reorganise the text into a clear, logical order with smooth transitions, merging repeated points. Keep every piece of information, the language and the meaning.' },
  { id: 'explain', label: tr('Explain'), icon: 'Lightbulb', kind: 'insert', ask: 'Explain this text in simple terms for a student: what it means, key terms, and an example. Answer in the same language as the text.' },
];

export function buildPrompt(task, text, opts = {}) {
  const ask = task.ask.replace('{lang}', opts.lang || 'English').replace('{tone}', (opts.tone || 'Formal').toLowerCase());
  const format = task.kind === 'titles'
    ? 'Reply with only a JSON array of strings, for example ["Title one","Title two"].'
    : 'Reply with only the resulting text — no preamble, no quotation marks, no explanations, no Markdown headings or asterisks. Keep paragraph breaks as blank lines.';
  return `You are a writing assistant inside a document editor.\nTask: ${ask}\n${format}\n\nText:\n"""\n${text}\n"""`;
}

/* ---------- Writex AI (on-device) ---------- */
// Every AI feature in the app runs on the phone through the local engine (localAI.js).
// There are no external AI providers and no API keys.
export function getAIConfig() { return { provider: 'local' }; }

// { ready, code, message, model }
export async function providerStatus() {
  if (!local.supported) return { ready: false, code: 'unsupported', message: tr('Writex AI runs on the Android app, on your phone. It is not available in this view.') };
  try {
    const dev = await local.device();
    if (!dev.engine) return { ready: false, code: 'engine', message: tr('The Writex AI engine could not start on this device.') };
    const m = await local.currentModel(dev);
    if (!m) return { ready: false, code: 'no_model', message: tr('Install a Writex AI model first (Settings › Writex AI). After that it works offline.') };
    return { ready: true, model: m };
  } catch (e) { return { ready: false, code: 'error', message: e.message }; }
}

export const aiErrorText = (e) => (e && e.message) || tr('Something went wrong.');

// Writing assistant tools. onText receives the whole answer so far.
export async function runTask({ task, text, opts, signal, onText }) {
  const prompt = buildPrompt(task, text, opts);
  const job = await engine.runTask('prompt', { prompt, maxTokens: Math.min(1800, Math.max(400, Math.round(text.length / 2))) }, {
    title: task.label, signal, onText: task.kind === 'titles' ? undefined : (t) => onText && onText(clean(t)),
  });
  if (task.kind === 'titles') {
    try { return { titles: JSON.parse(String(job.result).match(/\[[\s\S]*\]/)[0]).map(String).slice(0, 8) }; } catch (e) {
      return { titles: String(job.result || '').split('\n').map((x) => x.replace(/^[-*\d.\s"]+|"$/g, '').trim()).filter(Boolean).slice(0, 8) };
    }
  }
  return { text: clean(job.result) };
}

function clean(t) {
  return String(t || '').replace(/^\s*```[a-z]*\n?|```\s*$/g, '').replace(/^\s*"""\s*|\s*"""\s*$/g, '').trim();
}

/* ---------- generic helpers used by Think, Create and Learn ---------- */
// Returns { text } or a parsed JSON value when json: true.
export async function complete({ prompt, turns, json, onText, signal, title }) {
  if (turns) {
    const job = await engine.runTask('chat', { messages: turns.filter((t) => t.role !== 'system') }, { title, signal, onText });
    return { text: job.result || '' };
  }
  const job = await engine.runTask('prompt', { prompt, json: !!json, maxTokens: json ? 1600 : 1400 }, { title, signal, onText });
  if (json) return job.data;
  return { text: job.result || '' };
}

// Keep prompts inside provider limits; tells the caller whether text was cut.
// The on-device model reads long text in parts (aiEngine.js); one prompt holds about this much.
export const MAX_SOURCE = 10000;
export function clip(text, max = MAX_SOURCE) {
  const t = String(text || '');
  return t.length > max ? { text: t.slice(0, max), clipped: true, total: t.length } : { text: t, clipped: false, total: t.length };
}
