// Google Gemini adapter (Generative Language API, streaming).
import { postJSON, readSSE, ProviderError } from './util.js';

function toGemini(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map((p) => {
      if (p.type !== 'image') return { text: p.text };
      const mm = /^data:([^;]+);base64,(.*)$/.exec(p.dataUrl || '');
      return mm ? { inline_data: { mime_type: mm[1], data: mm[2] } } : { text: '' };
    }),
  }));
}

export function createGeminiProvider({ apiKey, baseUrl, defaults }) {
  return {
    id: 'gemini', label: 'Gemini', defaults,
    async generate({ model, system, messages, json, maxTokens, signal, onText, timeoutMs }) {
      const body = { contents: toGemini(messages), generationConfig: {} };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (json) body.generationConfig.responseMimeType = 'application/json';
      if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
      const url = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      const res = await postJSON(url, body, { headers: { 'x-goog-api-key': apiKey }, signal, timeoutMs });
      let text = ''; let usage = {}; let finish = null;
      await readSSE(res, (data) => {
        let ev; try { ev = JSON.parse(data); } catch (e) { return; }
        if (ev.error) throw new ProviderError(ev.error.message || 'Provider stream error', { code: 'provider_error', retryable: true });
        const cand = ev.candidates && ev.candidates[0];
        const parts = (cand && cand.content && cand.content.parts) || [];
        for (const p of parts) if (p.text) { text += p.text; if (onText) onText(p.text); }
        if (cand && cand.finishReason) finish = cand.finishReason;
        if (ev.usageMetadata) usage = { inputTokens: ev.usageMetadata.promptTokenCount, outputTokens: ev.usageMetadata.candidatesTokenCount };
      });
      if (!text && finish === 'SAFETY') throw new ProviderError('The model declined this request.', { code: 'refused' });
      return { text, usage, truncated: finish === 'MAX_TOKENS' };
    },
  };
}
