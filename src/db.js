// Document persistence: IndexedDB with an in-memory fallback.

const DB_NAME = 'qalam-docs';
const VERSION = 3;
let dbp = null;
let memory = null; // used when IndexedDB is unavailable
export let persistent = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try {
      if (!window.indexedDB) throw new Error('no idb');
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (e) { persistent = false; resolve(null); return; }
    const timer = setTimeout(() => { persistent = false; resolve(null); }, 4000);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      // v2: version history, crash recovery, custom templates, study subjects
      if (!db.objectStoreNames.contains('versions')) {
        const v = db.createObjectStore('versions', { keyPath: 'id' });
        v.createIndex('docId', 'docId', { unique: false });
      }
      if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('subjects')) db.createObjectStore('subjects', { keyPath: 'id' });
      // v3: reading files, learning, studio creations, document chats
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fileData')) db.createObjectStore('fileData', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cards')) {
        const c = db.createObjectStore('cards', { keyPath: 'id' });
        c.createIndex('deckId', 'deckId', { unique: false });
      }
      if (!db.objectStoreNames.contains('quizzes')) db.createObjectStore('quizzes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('creations')) db.createObjectStore('creations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => db.close(); // let a newer tab upgrade
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); persistent = false; resolve(null); };
    req.onblocked = () => { /* an older tab is open; the timer above falls back if it never closes */ };
  }).then((db) => {
    if (!db) memory = memory || { docs: new Map(), folders: new Map(), meta: new Map(), versions: new Map(), recovery: new Map(), templates: new Map(), subjects: new Map(), files: new Map(), fileData: new Map(), decks: new Map(), cards: new Map(), quizzes: new Map(), creations: new Map(), chats: new Map() };
    return db;
  });
  return dbp;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('Storage error'));
    t.onabort = () => reject(t.error || new Error('Storage was interrupted'));
  });
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export async function getAll(store) {
  const db = await open();
  if (!db) return [...memory[store].values()].map(clone);
  return tx(db, store, 'readonly', (s) => s.getAll());
}
export async function get(store, id) {
  const db = await open();
  if (!db) return clone(memory[store].get(id));
  return tx(db, store, 'readonly', (s) => s.get(id));
}
export async function put(store, value) {
  const db = await open();
  if (!db) { memory[store].set(value.id || value.key, clone(value)); return value; }
  await tx(db, store, 'readwrite', (s) => s.put(value));
  return value;
}
export async function del(store, id) {
  const db = await open();
  if (!db) { memory[store].delete(id); return; }
  await tx(db, store, 'readwrite', (s) => s.delete(id));
}

export async function ready() { await open(); return persistent; }

export async function getByIndex(store, index, key) {
  const db = await open();
  if (!db) return [...memory[store].values()].filter((v) => v[index] === key).map(clone);
  return tx(db, store, 'readonly', (s) => s.index(index).getAll(key));
}
