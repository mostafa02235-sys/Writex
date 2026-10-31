#!/usr/bin/env node
// Copies the Writex icons and launch screen (made by scripts/make-icons.py) into the
// Android project and removes Capacitor's default placeholder artwork.
// Safe to run any number of times; "npm run android:sync" runs it after "cap sync".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const SRC = path.join(ROOT, 'assets/android-res');
if (!fs.existsSync(RES)) { console.error('android/ is missing. Run "npx cap add android" first.'); process.exit(1); }

// Capacitor's sample splash screens and vector icon
for (const dir of fs.readdirSync(RES)) {
  if (/^drawable-(land|port)-/.test(dir)) fs.rmSync(path.join(RES, dir), { recursive: true, force: true });
}
for (const f of ['drawable/splash.png', 'drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml']) {
  fs.rmSync(path.join(RES, f), { force: true });
}
try { if (!fs.readdirSync(path.join(RES, 'drawable-v24')).length) fs.rmdirSync(path.join(RES, 'drawable-v24')); } catch (e) { /* absent */ }

let n = 0;
(function copy(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); } else { fs.copyFileSync(a, b); n++; }
  }
})(SRC, RES);
console.log(`Writex icons and splash applied (${n} files).`);
