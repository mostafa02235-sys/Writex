// Reads configuration from the environment (and an optional .env file).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function loadConfig(env = process.env) {
  if (env === process.env) loadDotEnv();
  const num = (k, d) => (env[k] !== undefined && env[k] !== '' ? Number(env[k]) : d);
  const str = (k, d = '') => (env[k] !== undefined && env[k] !== '' ? String(env[k]) : d);
  const production = str('NODE_ENV') === 'production';
  let secret = str('WRITEX_TOKEN_SECRET');
  if (!secret) {
    if (production) throw new Error('WRITEX_TOKEN_SECRET must be set in production.');
    secret = crypto.randomBytes(32).toString('hex'); // tokens reset when the server restarts
  }
  return {
    port: num('PORT', 8787),
    production,
    tokenSecret: secret,
    dbPath: str('WRITEX_DB_PATH', './data/writex.db'),
    allowedOrigins: ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost',
      ...str('WRITEX_ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean)],
    providers: {
      openai: { apiKey: str('OPENAI_API_KEY'), baseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1') },
      gemini: { apiKey: str('GEMINI_API_KEY'), baseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta') },
      selfhosted: { apiKey: str('SELFHOSTED_API_KEY'), baseUrl: str('SELFHOSTED_BASE_URL') },
      test: { enabled: str('WRITEX_ENABLE_TEST_PROVIDER') === '1' && !production },
    },
    models: { fast: str('WRITEX_MODEL_FAST'), smart: str('WRITEX_MODEL_SMART'), vision: str('WRITEX_MODEL_VISION') },
    limits: {
      maxConcurrent: num('WRITEX_MAX_CONCURRENT_JOBS', 4),
      deviceConcurrent: num('WRITEX_DEVICE_CONCURRENT_JOBS', 2),
      deviceJobsPerMinute: num('WRITEX_DEVICE_JOBS_PER_MINUTE', 12),
      deviceDailyChars: num('WRITEX_DEVICE_DAILY_CHARS', 3_000_000),
      registrationsPerHour: num('WRITEX_REGISTRATIONS_PER_HOUR', 20),
      jobTimeoutMs: num('WRITEX_JOB_TIMEOUT_SECONDS', 900) * 1000,
      requestTimeoutMs: num('WRITEX_REQUEST_TIMEOUT_SECONDS', 180) * 1000,
      maxUploadBytes: num('WRITEX_MAX_UPLOAD_MB', 25) * 1024 * 1024,
    },
    inviteCode: str('WRITEX_INVITE_CODE'),
    version: '1.0.0',
  };
}
