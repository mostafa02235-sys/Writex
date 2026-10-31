#!/usr/bin/env node
// Lists interface strings (tr('…') calls) that have no Arabic translation in
// src/locales/ar.js, and catalogue entries no longer used. Exits with an error when
// a translation is missing, so the Android build never ships a half-English screen.
//   node scripts/i18n-check.mjs          check
//   node scripts/i18n-check.mjs --list   print every string as JSON (for translators)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'locales') walk(p); } else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
})(SRC);

const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t' }[c] || c));
const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /(?<![\w.$])tr\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  let m;
  while ((m = re.exec(src))) {
    const key = unescape(m[1] != null ? m[1] : m[2]);
    if (!used.has(key)) used.set(key, []);
    used.get(key).push(path.relative(ROOT, f) + ':' + src.slice(0, m.index).split('\n').length);
  }
}

const { AR } = await import(pathToFileURL(path.join(SRC, 'locales/ar.js')).href);
if (process.argv.includes('--list')) { console.log(JSON.stringify([...used.keys()], null, 1)); process.exit(0); }

const missing = [...used.keys()].filter((k) => !Object.prototype.hasOwnProperty.call(AR, k));
const unused = Object.keys(AR).filter((k) => !used.has(k));
const badPlaceholders = [...used.keys()].filter((k) => AR[k] != null && (k.match(/\{\d+\}/g) || []).sort().join() !== (AR[k].match(/\{\d+\}/g) || []).sort().join());

console.log(`${used.size} interface strings, ${used.size - missing.length} translated into Arabic.`);
if (unused.length) console.log(`${unused.length} Arabic entries are no longer used (harmless).`);
for (const k of badPlaceholders) console.log(`Placeholder mismatch: ${JSON.stringify(k)} → ${JSON.stringify(AR[k])}`);
if (missing.length) {
  console.log(`\nMissing Arabic translations (${missing.length}):`);
  for (const k of missing) console.log(`  ${JSON.stringify(k)}   (${used.get(k)[0]})`);
}
process.exit(missing.length || badPlaceholders.length ? 1 : 0);
