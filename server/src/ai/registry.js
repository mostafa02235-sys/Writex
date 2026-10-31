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
};

export function createRegistry(cfg) {
  const providers = {};
  const p = cfg.providers;
  if (p.openai.apiKey) providers.openai = createOpenAIProvider({ apiKey: p.openai.apiKey, baseUrl: p.openai.baseUrl, defaults: DEFAULTS.openai });
  if (p.gemini.apiKey) providers.gemini = createGeminiProvider({ apiKey: p.gemini.apiKey, baseUrl: p.gemini.baseUrl, defaults: DEFAULTS.gemini });
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
    describe() {
      return ['fast', 'smart', 'vision'].map((tier) => {
        const t = tiers[tier];
        return t && t.provider ? { tier, provider: t.provider.id, model: t.model, available: true } : { tier, available: false, reason: (t && t.error) || 'No provider configured' };
      });
    },
  };
}
