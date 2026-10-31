// Deterministic stand-in model for automated tests ONLY (WRITEX_ENABLE_TEST_PROVIDER=1,
// refused when NODE_ENV=production). It does not generate language; it returns
// labelled, predictable text so the job pipeline, streaming, cancellation and the app
// can be tested end to end without calling a paid service.
import { ProviderError } from './util.js';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new ProviderError('Cancelled.', { code: 'cancelled' })); }, { once: true });
});

export function createTestProvider() {
  let failNext = 0;
  return {
    id: 'test', label: 'Test model (automated tests only)', defaults: { fast: 'test-fast', smart: 'test-smart', vision: 'test-vision' },
    failTimes(n) { failNext = n; },
    async generate({ model, system, messages, json, signal, onText }) {
      if (failNext > 0) { failNext--; throw new ProviderError('Simulated temporary failure', { code: 'provider_down', retryable: true }); }
      const last = messages[messages.length - 1];
      const input = typeof last.content === 'string' ? last.content : last.content.map((p) => p.text || '[image]').join(' ');
      const slow = /\[slow\]/.test(input);
      const words = input.replace(/\s+/g, ' ').trim().split(' ');
      let out;
      if (json) {
        out = JSON.stringify({ test: true, model, words: words.length, items: words.slice(0, 3) });
      } else {
        out = `[TEST MODEL ${model}] ${words.length} words received. First words: ${words.slice(0, 8).join(' ')}`;
      }
      let text = '';
      for (const piece of out.match(/.{1,12}/g) || []) {
        await sleep(slow ? 400 : 5, signal);
        text += piece; if (onText) onText(piece);
      }
      return { text, usage: { inputTokens: Math.ceil(input.length / 4), outputTokens: Math.ceil(text.length / 4) } };
    },
  };
}
