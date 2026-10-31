// npm run migrate — applies pending migrations and exits.
import { loadConfig } from '../config.js';
import { openDb, migrate } from './index.js';
const cfg = loadConfig();
const db = openDb(cfg.dbPath);
console.log('Migrations up to date:', migrate(db).length ? 'applied new ones' : 'nothing to apply');
