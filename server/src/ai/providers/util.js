// Shared helpers for model adapters: SSE parsing, retries and error classification.

export class ProviderError extends Error {
  constructor(message, { code = 'provider_error', status = 0, retryable = false } = {}) {
    super(message);
    this.code = code; this.status = status; this.retryable = retryable;
  }
}

export function classify(status, bodyText) {
  if (status === 401 || status === 403) return new ProviderError('The AI provider rejected the server credentials.', { code: 'provider_auth', status });
  if (status === 429) return new ProviderError('The AI provider is busy (rate limited).', { code: 'provider_busy', status, retryable: true });
  if (status === 400 && /context|too long|maximum.*tokens|token limit/i.test(bodyText)) return new ProviderError('The text is too long for the selected model.', { code: 'too_long', status });
  if (status >= 500) return new ProviderError('The AI provider had a temporary problem.', { code: 'provider_down', status, retryable: true });
  return new ProviderError(`The AI provider returned an error (${status}).`, { code: 'provider_error', status });
}

// Reads a text/event-stream body and calls onData(dataString) for each event.
export async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = chunk.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) onData(data);
    }
  }
  const rest = buf.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
  if (rest) onData(rest);
}

export async function postJSON(url, body, { headers = {}, signal, timeoutMs }) {
  const timeout = AbortSignal.timeout(timeoutMs || 180000);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: sig });
  } catch (e) {
    if (signal && signal.aborted) throw new ProviderError('Cancelled.', { code: 'cancelled' });
    if (timeout.aborted) throw new ProviderError('The AI provider took too long to answer.', { code: 'timeout', retryable: true });
    throw new ProviderError('Could not reach the AI provider.', { code: 'network', retryable: true });
  }
  if (!res.ok) throw classify(res.status, await res.text().catch(() => ''));
  return res;
}

export const estimateTokens = (s) => Math.ceil(String(s || '').length / 3.6);
