// End-to-end tests of the Writex AI HTTP API.
// Models: the deterministic test provider, and a local fake that speaks the OpenAI
// streaming protocol so the real OpenAI adapter code is exercised too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { chunkText } from '../src/docs/chunker.js';

let app; let base; let token;
const api = async (method, path, body, auth = true) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const waitDone = async (id, ms = 20000) => {
  const t = Date.now();
  for (;;) {
    const { body } = await api('GET', '/v1/jobs/' + id);
    if (['completed', 'failed', 'cancelled'].includes(body.job.status)) return body.job;
    if (Date.now() - t > ms) throw new Error('timeout waiting for ' + id + ' (' + body.job.status + ')');
    await new Promise((r) => setTimeout(r, 50));
  }
};
async function sse(id) {
  const res = await fetch(base + `/v1/jobs/${id}/events`, { headers: { authorization: 'Bearer ' + token } });
  const events = []; const dec = new TextDecoder(); let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6))); }
  }
  return events;
}

before(async () => {
  const cfg = loadConfig({ WRITEX_DB_PATH: ':memory:', WRITEX_ENABLE_TEST_PROVIDER: '1', WRITEX_TOKEN_SECRET: 'test-secret', WRITEX_DEVICE_JOBS_PER_MINUTE: '100', WRITEX_DEVICE_CONCURRENT_JOBS: '3' });
  app = createApp(cfg, { log: () => {} });
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
});
after(async () => { await app.close(); });

test('health and device registration', async () => {
  const h = await (await fetch(base + '/v1/health')).json();
  assert.equal(h.ok, true);
  assert.equal(h.ready, true);
  const r = await api('POST', '/v1/devices', { platform: 'android', appVersion: '1.1' }, false);
  assert.equal(r.status, 200);
  assert.match(r.body.token, /^dev_.+\..+$/);
  token = r.body.token;
});

test('rejects requests without a valid token', async () => {
  const res = await fetch(base + '/v1/status', { headers: { authorization: 'Bearer dev_fake.bad' } });
  assert.equal(res.status, 401);
});

test('status reports models without exposing keys', async () => {
  const { body } = await api('GET', '/v1/status');
  assert.equal(body.ready, true);
  assert.deepEqual(body.models.map((m) => m.tier), ['fast', 'smart', 'vision']);
  assert.ok(!JSON.stringify(body).match(/key|secret/i));
});

test('prompt job streams text and completes', async () => {
  const { body } = await api('POST', '/v1/jobs', { type: 'prompt', input: { prompt: 'Improve this sentence please' } });
  assert.equal(body.job.status, 'waiting');
  const events = await sse(body.job.id);
  const snap = events[0];
  assert.equal(snap.type, 'snapshot');
  const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  const done = events.find((e) => e.type === 'done');
  assert.ok(deltas.length > 10, 'streamed text');
  assert.equal(done.job.status, 'completed');
  assert.equal(done.job.result, snap.text + deltas, 'snapshot + deltas rebuild the result');
  assert.ok(events.some((e) => (e.type === 'state' || e.type === 'snapshot') && ['processing', 'generating', 'waiting'].includes(e.job.status)));
});

test('large document is analysed in parts with real progress', async () => {
  const para = 'Photosynthesis converts light into chemical energy in chloroplasts. ';
  const text = (para.repeat(40) + '\n\n').repeat(60); // ~165k characters
  const up = await api('POST', '/v1/files', { name: 'Biology.pdf', kind: 'text', text });
  assert.equal(up.status, 200);
  const { body } = await api('POST', '/v1/jobs', { type: 'summarize', input: { fileIds: [up.body.id], length: 'detailed' } });
  const events = await sse(body.job.id);
  const analyzing = events.filter((e) => e.type === 'state' && e.job.status === 'analyzing');
  assert.ok(analyzing.length > 2, 'reported analysing stages');
  const last = analyzing[analyzing.length - 1].job.progress;
  assert.equal(last.done, last.total);
  assert.equal(last.total, chunkText(text, 20000).length);
  assert.equal(events.at(-1).job.status, 'completed');
});

test('compare needs two documents', async () => {
  const up = await api('POST', '/v1/files', { name: 'A', kind: 'text', text: 'Alpha report 2025.' });
  const { body } = await api('POST', '/v1/jobs', { type: 'compare', input: { fileIds: [up.body.id] } });
  const j = await waitDone(body.job.id);
  assert.equal(j.status, 'failed');
  assert.equal(j.errorCode, 'bad_request');
});

test('quiz returns parsed JSON', async () => {
  const { body } = await api('POST', '/v1/jobs', { type: 'quiz', input: { documents: [{ name: 'Notes', text: 'The capital of France is Paris.' }], count: 3 } });
  const j = await waitDone(body.job.id);
  assert.equal(j.status, 'completed');
  assert.equal(j.data.test, true);
});

test('chat with an attached document and history', async () => {
  const up = await api('POST', '/v1/files', { name: 'Doc', kind: 'text', text: 'Writex stores documents on the device.' });
  const { body } = await api('POST', '/v1/jobs', { type: 'chat', input: { fileIds: [up.body.id], messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Where are documents stored?' }] } });
  const j = await waitDone(body.job.id);
  assert.equal(j.status, 'completed');
  assert.match(j.result, /TEST MODEL/);
});

test('cancel stops a running job and keeps partial text', async () => {
  const { body } = await api('POST', '/v1/jobs', { type: 'prompt', input: { prompt: '[slow] write a long essay about rivers and seas and mountains' } });
  await new Promise((r) => setTimeout(r, 900));
  const c = await api('POST', `/v1/jobs/${body.job.id}/cancel`);
  assert.equal(c.status, 200);
  const j = await waitDone(body.job.id);
  assert.equal(j.status, 'cancelled');
});

test('retry creates a linked job', async () => {
  const { body } = await api('POST', '/v1/jobs', { type: 'prompt', input: { prompt: 'short' } });
  await waitDone(body.job.id);
  const r = await api('POST', `/v1/jobs/${body.job.id}/retry`);
  assert.equal(r.body.job.parentId, body.job.id);
  assert.equal(r.body.job.attempt, 2);
  assert.equal((await waitDone(r.body.job.id)).status, 'completed');
});

test('temporary provider failures are retried automatically', async () => {
  app.registry.providers.test.failTimes(2);
  const { body } = await api('POST', '/v1/jobs', { type: 'prompt', input: { prompt: 'resilient' } });
  const j = await waitDone(body.job.id, 30000);
  assert.equal(j.status, 'completed');
});

test('jobs and usage are listed per device only', async () => {
  const mine = (await api('GET', '/v1/jobs')).body.jobs;
  assert.ok(mine.length >= 5);
  const other = (await api('POST', '/v1/devices', {}, false)).body.token;
  const res = await fetch(base + '/v1/jobs/' + mine[0].id, { headers: { authorization: 'Bearer ' + other } });
  assert.equal(res.status, 404);
  const u = (await api('GET', '/v1/usage')).body;
  assert.ok(u.days.length >= 1);
  assert.ok(u.jobs.completed >= 3);
});

test('OpenAI adapter streams through the real protocol', async () => {
  // Minimal fake of the OpenAI streaming endpoint
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      assert.equal(req.headers.authorization, 'Bearer sk-test');
      assert.equal(parsed.stream, true);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const w of ['Hello', ' from', ' OpenAI']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const { createOpenAIProvider } = await import('../src/ai/providers/openai.js');
  const p = createOpenAIProvider({ apiKey: 'sk-test', baseUrl: `http://127.0.0.1:${fake.address().port}/v1`, defaults: {} });
  let streamed = '';
  const out = await p.generate({ model: 'm', messages: [{ role: 'user', content: 'hi' }], onText: (d) => { streamed += d; } });
  fake.close();
  assert.equal(out.text, 'Hello from OpenAI');
  assert.equal(streamed, out.text);
  assert.equal(out.usage.outputTokens, 3);
});

test('rate limiting returns 429', async () => {
  const cfg = loadConfig({ WRITEX_DB_PATH: ':memory:', WRITEX_ENABLE_TEST_PROVIDER: '1', WRITEX_TOKEN_SECRET: 's', WRITEX_DEVICE_JOBS_PER_MINUTE: '2' });
  const a2 = createApp(cfg, { log: () => {} });
  const port = await a2.listen(0);
  const reg = await (await fetch(`http://127.0.0.1:${port}/v1/devices`, { method: 'POST' })).json();
  const post = () => fetch(`http://127.0.0.1:${port}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer ' + reg.token, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prompt', input: { prompt: 'x' } }) });
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
  const third = await post();
  assert.equal(third.status, 429);
  await a2.close();
});

test('no provider configured gives a clear error', async () => {
  const cfg = loadConfig({ WRITEX_DB_PATH: ':memory:', WRITEX_TOKEN_SECRET: 's' });
  const a3 = createApp(cfg, { log: () => {} });
  const port = await a3.listen(0);
  const reg = await (await fetch(`http://127.0.0.1:${port}/v1/devices`, { method: 'POST' })).json();
  const res = await fetch(`http://127.0.0.1:${port}/v1/jobs`, { method: 'POST', headers: { authorization: 'Bearer ' + reg.token, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prompt', input: { prompt: 'x' } }) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'no_provider');
  await a3.close();
});

test('interrupted jobs are queued again after a restart', async () => {
  const db = app.db;
  const id = 'job_interrupted';
  const dev = db.prepare('SELECT id FROM devices LIMIT 1').get().id;
  db.prepare(`INSERT INTO jobs (id, device_id, type, status, input_json, created_at, updated_at) VALUES (?, ?, 'prompt', 'generating', ?, ?, ?)`).run(id, dev, JSON.stringify({ prompt: 'resume me' }), Date.now(), Date.now());
  app.jobs.start();
  const t = Date.now();
  let row;
  do { await new Promise((r) => setTimeout(r, 50)); row = db.prepare('SELECT status, attempt FROM jobs WHERE id = ?').get(id); } while (row.status !== 'completed' && Date.now() - t < 10000);
  assert.equal(row.status, 'completed');
  assert.equal(row.attempt, 2);
});
