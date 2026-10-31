// Writex AI server entry point.
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const app = createApp(cfg, { log: (m) => console.log(new Date().toISOString(), m) });
const port = await app.listen();
const models = app.registry.describe().map((m) => `${m.tier}=${m.available ? m.provider + ':' + m.model : 'unavailable'}`).join(' ');
console.log(`Writex AI listening on :${port} — ${app.registry.ready ? 'ready' : 'NO MODEL PROVIDER CONFIGURED'} — ${models}`);
if (cfg.providers.test.enabled) console.log('WARNING: the automated-test model is enabled. Never enable it in production.');

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(0); });
