// HTTP API for Writex AI (see docs/API.md). Plain node:http, no framework.
import http from 'node:http';
import crypto from 'node:crypto';
import { openDb } from './db/index.js';
import { createRegistry } from './ai/registry.js';
import { createJobs, JobError } from './jobs/queue.js';
import { TASKS } from './ai/tasks.js';
import { createAuth } from './auth.js';
import { createLimiter } from './ratelimit.js';

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error'; } }

export function createApp(cfg, { log = console.log } = {}) {
  const db = openDb(cfg.dbPath);
  const registry = createRegistry(cfg);
  const jobs = createJobs({ db, registry, cfg, log });
  const auth = createAuth({ db, cfg });
  const limiter = createLimiter(db);
  const startedAt = Date.now();

  const usageToday = db.prepare('SELECT COALESCE(SUM(input_chars),0) AS input, COALESCE(SUM(output_chars),0) AS output, COUNT(*) AS calls FROM usage WHERE device_id = ? AND created_at > ?');
  const usageDays = db.prepare(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, SUM(input_chars) AS input, SUM(output_chars) AS output, COUNT(*) AS calls
    FROM usage WHERE device_id = ? AND created_at > ? GROUP BY day ORDER BY day`);
  const jobCounts = db.prepare('SELECT status, COUNT(*) AS n FROM jobs WHERE device_id = ? GROUP BY status');
  const insFile = db.prepare('INSERT INTO files (id, device_id, name, kind, mime, size, text, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const delFile = db.prepare('DELETE FROM files WHERE id = ? AND device_id = ?');
  const startOfDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };

  /* ---------- helpers ---------- */
  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (cfg.allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-writex-invite, x-writex-app');
      res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
  }
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  async function readBody(req, limit) {
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, `The upload is larger than ${Math.round(limit / 1048576)} MB.`, 'too_large');
      chunks.push(c);
    }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { throw new HttpError(400, 'The request body is not valid JSON.', 'bad_json'); }
  }
  const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  function device(req) {
    const d = auth.verify(req.headers.authorization);
    if (!d) throw new HttpError(401, 'This device is not signed in to Writex AI.', 'unauthorized');
    return d;
  }
  function limit(bucket, max, windowMs, msg) {
    const wait = limiter.hit(bucket, max, windowMs);
    if (wait) throw Object.assign(new HttpError(429, msg, 'rate_limited'), { retryAfter: wait });
  }

  /* ---------- routes ---------- */
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  route('GET', '/v1/health', () => ({ ok: true, service: 'writex-ai', version: cfg.version, ready: registry.ready, uptime: Math.round((Date.now() - startedAt) / 1000) }));

  route('POST', '/v1/devices', async (req) => {
    if (cfg.inviteCode && req.headers['x-writex-invite'] !== cfg.inviteCode) throw new HttpError(403, 'This Writex AI server needs an invite code.', 'invite_required');
    limit('reg:' + auth.ipHash(ipOf(req)), cfg.limits.registrationsPerHour, 3600000, 'Too many new devices from this network. Try again later.');
    const body = await readBody(req, 4096);
    return auth.register({ ip: ipOf(req), platform: body.platform, appVersion: body.appVersion });
  });

  route('GET', '/v1/status', (req) => {
    const d = device(req);
    const u = usageToday.get(d.id, startOfDay());
    return {
      ready: registry.ready,
      models: registry.describe(),
      tasks: Object.keys(TASKS),
      limits: { dailyChars: cfg.limits.deviceDailyChars, jobsPerMinute: cfg.limits.deviceJobsPerMinute, concurrentJobs: cfg.limits.deviceConcurrent, maxUploadMB: Math.round(cfg.limits.maxUploadBytes / 1048576) },
      usage: { today: { inputChars: u.input, outputChars: u.output, modelCalls: u.calls } },
    };
  });

  route('GET', '/v1/usage', (req) => {
    const d = device(req);
    const jobsBy = Object.fromEntries(jobCounts.all(d.id).map((r) => [r.status, r.n]));
    return { days: usageDays.all(d.id, Date.now() - 30 * 86400000), jobs: jobsBy, dailyLimitChars: cfg.limits.deviceDailyChars };
  });

  route('POST', '/v1/files', async (req) => {
    const d = device(req);
    limit('files:' + d.id, 60, 60000, 'Too many uploads. Wait a moment.');
    const b = await readBody(req, cfg.limits.maxUploadBytes * 1.4);
    const kind = b.kind === 'image' ? 'image' : 'text';
    if (kind === 'text' && typeof b.text !== 'string') throw new HttpError(400, 'A document needs its text.', 'bad_request');
    if (kind === 'image' && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(b.data || '')) throw new HttpError(400, 'Images must be PNG, JPG, WebP or GIF.', 'bad_request');
    const size = kind === 'text' ? Buffer.byteLength(b.text) : Math.round((b.data.length * 3) / 4);
    if (size > cfg.limits.maxUploadBytes) throw new HttpError(413, 'This file is too large.', 'too_large');
    const id = 'file_' + crypto.randomBytes(9).toString('base64url');
    insFile.run(id, d.id, String(b.name || 'Document').slice(0, 200), kind, String(b.mime || '').slice(0, 80), size, kind === 'text' ? b.text : null, kind === 'image' ? b.data : null, Date.now());
    return { id, name: b.name, kind, size };
  });
  route('DELETE', '/v1/files/:id', (req, p) => { const d = device(req); delFile.run(p.id, d.id); return { ok: true }; });

  route('POST', '/v1/jobs', async (req) => {
    const d = device(req);
    if (!registry.ready) throw new HttpError(503, 'Writex AI has no model provider configured on the server yet.', 'no_provider');
    limit('jobs:' + d.id, cfg.limits.deviceJobsPerMinute, 60000, 'Too many requests. Wait a moment and try again.');
    const used = usageToday.get(d.id, startOfDay()).input;
    if (used > cfg.limits.deviceDailyChars) throw new HttpError(429, 'Today\'s Writex AI allowance for this device is used up. It resets at midnight UTC.', 'quota');
    const b = await readBody(req, cfg.limits.maxUploadBytes * 1.4);
    if (!b.type || !TASKS[b.type]) throw new HttpError(400, 'Unknown task type.', 'bad_request');
    const input = b.input || {};
    return { job: jobs.create(d.id, { type: b.type, input, title: b.title }) };
  });

  route('GET', '/v1/jobs', (req, p, url) => { const d = device(req); return { jobs: jobs.list(d.id, Number(url.searchParams.get('limit')) || 50) }; });
  route('GET', '/v1/jobs/:id', (req, p) => { const d = device(req); const j = jobs.get(d.id, p.id); if (!j) throw new HttpError(404, 'Task not found.', 'not_found'); return { job: j }; });
  route('POST', '/v1/jobs/:id/cancel', (req, p) => { const d = device(req); const j = jobs.cancel(d.id, p.id); if (!j) throw new HttpError(404, 'Task not found.', 'not_found'); return { job: j }; });
  route('POST', '/v1/jobs/:id/retry', (req, p) => {
    const d = device(req);
    limit('jobs:' + d.id, cfg.limits.deviceJobsPerMinute, 60000, 'Too many requests. Wait a moment and try again.');
    try { const j = jobs.retry(d.id, p.id); if (!j) throw new HttpError(404, 'Task not found.', 'not_found'); return { job: j }; } catch (e) { if (e instanceof JobError) throw new HttpError(409, e.message, e.code); throw e; }
  });

  // Server-sent events: current state first, then live updates until the job ends.
  route('GET', '/v1/jobs/:id/events', (req, p, url, res) => {
    const d = device(req);
    const j = jobs.get(d.id, p.id);
    if (!j) throw new HttpError(404, 'Task not found.', 'not_found');
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const write = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    write({ type: 'snapshot', job: j, text: jobs.FINISHED.has(j.status) ? (j.result || '') : jobs.partialText(j.id) || j.result || '' });
    if (jobs.FINISHED.has(j.status)) { write({ type: 'done', job: j }); res.end(); return undefined; }
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const off = jobs.subscribe(j.id, (ev) => { write(ev); if (ev.type === 'done') { clearInterval(ping); off(); res.end(); } });
    req.on('close', () => { clearInterval(ping); off(); });
    return undefined;
  });

  /* ---------- server ---------- */
  const server = http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://x');
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const out = await r.fn(req, m.groups || {}, url, res);
        if (out !== undefined) send(res, 200, out);
        return;
      }
      throw new HttpError(404, 'Not found.', 'not_found');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500 && !(e instanceof HttpError)) log(`error ${req.method} ${url.pathname}: ${e.stack || e}`);
      if (e.retryAfter) res.setHeader('retry-after', String(e.retryAfter));
      if (!res.headersSent) send(res, status, { error: { code: e.code || 'server_error', message: status >= 500 && !(e instanceof HttpError) ? 'Writex AI had an internal error.' : e.message } });
      else res.end();
    }
  });

  return {
    server, db, jobs, registry,
    listen(port = cfg.port) { jobs.start(); return new Promise((r) => server.listen(port, () => r(server.address().port))); },
    async close() { jobs.stop(); await new Promise((r) => server.close(r)); server.closeAllConnections && server.closeAllConnections(); db.close(); },
  };
}
