// OpenAI Chat Completions adapter. Also used for any OpenAI-compatible server
// (self-hosted open-source models via Ollama, vLLM, LM Studio, llama.cpp…).
import { postJSON, readSSE, ProviderError } from './util.js';

function toOpenAI(messages, system) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    out.push({ role: m.role, content: m.content.map((p) => (p.type === 'image' ? { type: 'image_url', image_url: { url: p.dataUrl } } : { type: 'text', text: p.text })) });
  }
  return out;
}

export function createOpenAIProvider({ id = 'openai', label = 'OpenAI', apiKey, baseUrl, defaults }) {
  return {
    id, label, defaults,
    async generate({ model, system, messages, json, maxTokens, signal, onText, timeoutMs }) {
      const body = { model, messages: toOpenAI(messages, system), stream: true, stream_options: { include_usage: true } };
      if (maxTokens) body.max_tokens = maxTokens;
      if (json) body.response_format = { type: 'json_object' };
      const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
      const res = await postJSON(`${baseUrl.replace(/\/$/, '')}/chat/completions`, body, { headers, signal, timeoutMs });
      let text = ''; let usage = {}; let finish = null;
      await readSSE(res, (data) => {
        if (data === '[DONE]') return;
        let ev; try { ev = JSON.parse(data); } catch (e) { return; }
        if (ev.error) throw new ProviderError(ev.error.message || 'Provider stream error', { code: 'provider_error', retryable: true });
        const c = ev.choices && ev.choices[0];
        if (c && c.delta && c.delta.content) { text += c.delta.content; if (onText) onText(c.delta.content); }
        if (c && c.finish_reason) finish = c.finish_reason;
        if (ev.usage) usage = { inputTokens: ev.usage.prompt_tokens, outputTokens: ev.usage.completion_tokens };
      });
      return { text, usage, truncated: finish === 'length' };
    },
  };
}
