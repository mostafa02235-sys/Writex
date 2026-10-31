// Device tokens. The app registers once and keeps a signed token; no personal
// data is collected. Tokens are HMAC-signed with WRITEX_TOKEN_SECRET.
import crypto from 'node:crypto';

export function createAuth({ db, cfg }) {
  const sign = (id) => crypto.createHmac('sha256', cfg.tokenSecret).update(id).digest('base64url');
  const ins = db.prepare('INSERT INTO devices (id, created_at, last_seen_at, ip_hash, platform, app_version) VALUES (?, ?, ?, ?, ?, ?)');
  const get = db.prepare('SELECT * FROM devices WHERE id = ?');
  const seen = db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?');
  const ipHash = (ip) => crypto.createHash('sha256').update(cfg.tokenSecret + '|' + (ip || '')).digest('hex').slice(0, 24);

  return {
    ipHash,
    register({ ip, platform, appVersion }) {
      const id = 'dev_' + crypto.randomBytes(12).toString('base64url');
      ins.run(id, Date.now(), Date.now(), ipHash(ip), String(platform || '').slice(0, 20), String(appVersion || '').slice(0, 20));
      return { deviceId: id, token: `${id}.${sign(id)}` };
    },
    verify(header) {
      const m = /^Bearer\s+(dev_[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(header || '');
      if (!m) return null;
      const expected = sign(m[1]);
      if (expected.length !== m[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]))) return null;
      const dev = get.get(m[1]);
      if (!dev || dev.blocked) return null;
      if (Date.now() - dev.last_seen_at > 60000) seen.run(Date.now(), dev.id);
      return dev;
    },
  };
}
