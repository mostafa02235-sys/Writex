// Builds the configured model providers and decides which model handles a task.
// The app never chooses a provider: it sends a task, and the server routes it.
import { createOpenAIProvider } from './providers/openai.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createTestProvider } from './providers/test.js';

// Defaults when WRITEX_MODEL_* are not set. Change them in .env as providers release new models.
const DEFAULTS = {
  openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o', vision: 'gpt-4o-mini' },
  gemini: { fast: 'gemini-2.0-flash', smart: 'gemini-2.5-pro', vision: 'gemini-2.0-flash' },
  selfhosted: { fast: 'llama3.1', smart: 'llama3.1', vision: 'llava' },
  // Free tiers. Model names change over time: override with WRITEX_MODEL_* if one disappears.
  groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile', vision: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  cerebras: { fast: 'llama3.1-8b', smart: 'llama-3.3-70b', vision: '' },
  openrouter: { fast: 'meta-llama/llama-3.3-70b-instruct:free', smart: 'meta-llama/llama-3.3-70b-instruct:free', vision: 'google/gemma-3-27b-it:free' },
};

export function createRegistry(cfg) {
  const providers = {};
  const p = cfg.providers;
  if (p.openai.apiKey) providers.openai = createOpenAIProvider({ apiKey: p.openai.apiKey, baseUrl: p.openai.baseUrl, defaults: DEFAULTS.openai });
  if (p.gemini.apiKey) providers.gemini = createGeminiProvider({ apiKey: p.gemini.apiKey, baseUrl: p.gemini.baseUrl, defaults: DEFAULTS.gemini });
  if (p.groq.apiKey) providers.groq = createOpenAIProvider({ id: 'groq', label: 'Groq', apiKey: p.groq.apiKey, baseUrl: p.groq.baseUrl, defaults: DEFAULTS.groq });
  if (p.cerebras.apiKey) providers.cerebras = createOpenAIProvider({ id: 'cerebras', label: 'Cerebras', apiKey: p.cerebras.apiKey, baseUrl: p.cerebras.baseUrl, defaults: DEFAULTS.cerebras, jsonMode: false });
  if (p.openrouter.apiKey) providers.openrouter = createOpenAIProvider({ id: 'openrouter', label: 'OpenRouter', apiKey: p.openrouter.apiKey, baseUrl: p.openrouter.baseUrl, defaults: DEFAULTS.openrouter, jsonMode: false, headers: { 'x-title': 'Writex AI' } });
  if (p.selfhosted.baseUrl) providers.selfhosted = createOpenAIProvider({ id: 'selfhosted', label: 'Self-hosted', apiKey: p.selfhosted.apiKey, baseUrl: p.selfhosted.baseUrl, defaults: DEFAULTS.selfhosted });
  if (p.test.enabled) providers.test = createTestProvider();

  const first = Object.values(providers)[0] || null;
  const tiers = {};
  for (const tier of ['fast', 'smart', 'vision']) {
    const spec = cfg.models[tier];
    if (spec) {
      const [pid, ...rest] = spec.split(':');
      const model = rest.join(':');
      if (providers[pid] && model) tiers[tier] = { provider: providers[pid], model };
      else tiers[tier] = { error: `WRITEX_MODEL_${tier.toUpperCase()}="${spec}" refers to a provider that is not configured.` };
    } else if (first) {
      tiers[tier] = { provider: first, model: first.defaults[tier] };
    }
  }
  // The smart tier falls back to fast, and vision to smart, when not available.
  if (!tiers.smart || tiers.smart.error) tiers.smart = tiers.fast;
  if (!tiers.vision || tiers.vision.error) tiers.vision = tiers.smart;

  return {
    providers,
    ready: !!(tiers.fast && tiers.fast.provider),
    pick(tier) {
      const t = tiers[tier] || tiers.fast;
      if (!t || !t.provider) throw Object.assign(new Error('Writex AI has no model provider configured on the server.'), { code: 'no_provider' });
      return t;
    },
    // The chosen model first, then the same tier on every other configured provider.
    // Free tiers have tight limits, so a busy provider hands the request to the next one.
    candidates(tier) {
      const first = this.pick(tier);
      const out = [first];
      for (const prov of Object.values(providers)) {
        if (prov === first.provider || prov.id === 'test') continue;
        const model = prov.defaults[tier] || prov.defaults.smart || prov.defaults.fast;
        if (model && (tier !== 'vision' || prov.defaults.vision)) out.push({ provider: prov, model });
      }
      return out;
    },
    describe() {
      return ['fast', 'smart', 'vision'].map((tier) => {
        const t = tiers[tier];
        return t && t.provider ? { tier, provider: t.provider.id, model: t.model, available: true } : { tier, available: false, reason: (t && t.error) || 'No provider configured' };
      });
    },
  };
}
