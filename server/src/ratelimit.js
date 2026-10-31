// Sliding-window limits stored in SQLite, so they hold across restarts.
export function createLimiter(db) {
  const add = db.prepare('INSERT INTO rate_events (bucket, created_at) VALUES (?, ?)');
  const count = db.prepare('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND created_at > ?');
  const prune = db.prepare('DELETE FROM rate_events WHERE created_at < ?');
  let lastPrune = 0;
  return {
    // Returns seconds to wait (0 when allowed) and records the hit when allowed.
    hit(bucket, max, windowMs) {
      const t = Date.now();
      if (t - lastPrune > 600000) { prune.run(t - 86400000); lastPrune = t; }
      const n = count.get(bucket, t - windowMs).n;
      if (n >= max) return Math.ceil(windowMs / 1000 / Math.max(1, max));
      add.run(bucket, t);
      return 0;
    },
  };
}
