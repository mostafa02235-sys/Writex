// Document and folder operations on top of db.js
import * as db from './db.js';
import { uid } from './util.js';
import { TEMPLATES, WELCOME, allTemplates } from './templates.js';
import { DEFAULT_SETTINGS } from './constants.js';

export async function listDocs() {
  const docs = await db.getAll('docs');
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const listFolders = async () => (await db.getAll('folders')).sort((a, b) => a.name.localeCompare(b.name));
export const getDoc = (id) => db.get('docs', id);

export async function createDoc({ title, delta, settings, folderId = null, preview = '', text = '', ...extra }) {
  const now = Date.now();
  const doc = {
    id: uid('doc'), title: title || 'Untitled document', folderId,
    delta: delta || { ops: [{ insert: '\n', attributes: { dir: 'auto' } }] },
    settings: { ...DEFAULT_SETTINGS, ...(settings || {}) },
    preview, text, words: 0, createdAt: now, updatedAt: now, openedAt: now,
    ...extra,
  };
  await db.put('docs', doc);
  return doc;
}

export async function fromTemplate(tid, folderId = null, extra) {
  const t = allTemplates().find((x) => x.id === tid) || TEMPLATES[0];
  const title = tid === 'blank' ? 'Untitled document' : tid === 'blank-ar' ? 'مستند بدون عنوان' : t.name;
  return createDoc({ title, delta: t.delta(), settings: t.settings(), folderId, ...(extra || {}) });
}

export async function updateDoc(id, patch) {
  const cur = await db.get('docs', id);
  if (!cur) throw new Error('This document no longer exists.');
  const next = { ...cur, ...patch, updatedAt: patch.updatedAt || Date.now() };
  await db.put('docs', next);
  return next;
}

export async function duplicateDoc(id) {
  const cur = await db.get('docs', id);
  if (!cur) throw new Error('This document no longer exists.');
  const now = Date.now();
  const copy = { ...cur, id: uid('doc'), title: cur.title + ' (copy)', createdAt: now, updatedAt: now };
  await db.put('docs', copy);
  return copy;
}

export async function deleteDoc(id) {
  await db.del('docs', id);
  try { await deleteVersionsFor(id); await db.del('recovery', id); } catch (e) { /* ignore */ }
}

export async function createFolder(name) {
  const f = { id: uid('fld'), name, createdAt: Date.now() };
  await db.put('folders', f);
  return f;
}
export async function renameFolder(id, name) {
  const f = await db.get('folders', id);
  if (f) await db.put('folders', { ...f, name });
}
export async function deleteFolder(id) {
  const docs = await db.getAll('docs');
  for (const d of docs) if (d.folderId === id) await db.put('docs', { ...d, folderId: null });
  await db.del('folders', id);
}

// First run: seed example documents so the library is not empty.
export async function seedIfNeeded() {
  const persistent = await db.ready();
  const meta = await db.get('meta', 'seeded');
  if (meta) return persistent;
  const existing = await db.getAll('docs');
  if (!existing.length) {
    const now = Date.now();
    const story = TEMPLATES.find((t) => t.id === 'story');
    const s = await createDoc({ title: 'ليلة المطر (مثال)', delta: story.delta(), settings: story.settings() });
    await db.put('docs', { ...s, example: true, updatedAt: now - 1000 * 60 * 60 * 26 });
    const w = await createDoc({ title: WELCOME.title, delta: WELCOME.delta(), settings: WELCOME.settings() });
    await db.put('docs', { ...w, example: true, updatedAt: now - 1000 * 60 * 4 });
  }
  await db.put('meta', { key: 'seeded', at: Date.now() });
  return persistent;
}

/* ---------- version history ---------- */
const MAX_VERSIONS = 40;
export async function saveVersion(doc, reason = 'auto') {
  if (!doc || doc.locked) return null;
  const v = { id: uid('ver'), docId: doc.id, at: Date.now(), title: doc.title, delta: doc.delta, words: doc.words || 0, reason };
  await db.put('versions', v);
  const all = (await db.getByIndex('versions', 'docId', doc.id)).sort((a, b) => b.at - a.at);
  for (const old of all.slice(MAX_VERSIONS)) await db.del('versions', old.id);
  return v;
}
export async function listVersions(docId) {
  return (await db.getByIndex('versions', 'docId', docId)).sort((a, b) => b.at - a.at);
}
export const deleteVersion = (id) => db.del('versions', id);
export async function deleteVersionsFor(docId) {
  for (const v of await db.getByIndex('versions', 'docId', docId)) await db.del('versions', v.id);
}

/* ---------- crash recovery ---------- */
export const putRecovery = (docId, data) => db.put('recovery', { id: docId, at: Date.now(), ...data });
export const getRecovery = (docId) => db.get('recovery', docId);
export const clearRecovery = (docId) => db.del('recovery', docId);

/* ---------- custom templates ---------- */
export async function listCustomTemplates() { return (await db.getAll('templates')).sort((a, b) => b.createdAt - a.createdAt); }
export async function saveCustomTemplate({ name, delta, settings, lang }) {
  const t = { id: uid('tpl'), name, delta, settings, lang: lang || 'EN', createdAt: Date.now() };
  await db.put('templates', t);
  return t;
}
export const deleteCustomTemplate = (id) => db.del('templates', id);

/* ---------- study subjects ---------- */
export async function listSubjects() { return (await db.getAll('subjects')).sort((a, b) => a.createdAt - b.createdAt); }
export async function saveSubject(s) {
  const v = { createdAt: Date.now(), ...s, id: s.id || uid('sub') };
  await db.put('subjects', v);
  return v;
}
export async function deleteSubject(id) {
  const docs = await db.getAll('docs');
  for (const d of docs) if (d.subjectId === id) await db.put('docs', { ...d, subjectId: null, studyType: null });
  await db.del('subjects', id);
}

/* ---------- writing statistics ---------- */
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export async function addWords(n) {
  if (!n || n <= 0) return;
  const cur = (await db.get('meta', 'stats')) || { key: 'stats', days: {} };
  const k = dayKey();
  cur.days[k] = (cur.days[k] || 0) + n;
  // keep a year of history
  const keys = Object.keys(cur.days).sort();
  while (keys.length > 370) delete cur.days[keys.shift()];
  await db.put('meta', cur);
}
export async function getStats() { return (await db.get('meta', 'stats')) || { key: 'stats', days: {} }; }

/* ---------- create from a stored template ---------- */
export async function fromCustomTemplate(id, extra) {
  const t = await db.get('templates', id);
  if (!t) throw new Error('This template no longer exists.');
  return createDoc({ title: t.name, delta: t.delta, settings: t.settings, ...(extra || {}) });
}
