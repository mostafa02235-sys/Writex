#!/usr/bin/env node
// Builds Writex.
//   node scripts/build.mjs             → www/  (the Android/iOS app: every library and font bundled, works offline)
//   node scripts/build.mjs --artifact  → dist/writex.html (single file for the Claude artifact; libraries from CDNs)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const artifact = process.argv.includes('--artifact');

let esbuild;
try { esbuild = require('esbuild'); } catch (e) {
  if (!process.env.ESBUILD_PATH) throw new Error('esbuild is missing. Run "npm install" first.');
  esbuild = require(process.env.ESBUILD_PATH);
}

const NM = path.join(ROOT, 'node_modules');
const rel = (...p) => path.join(ROOT, ...p);
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

async function bundle(nativeModule) {
  const res = await esbuild.build({
    entryPoints: [rel('src/main.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    minify: true,
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: { '.js': 'jsx' },
    alias: { 'writex-native': rel('src/native', nativeModule) },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
  return res.outputFiles[0].text;
}

/* ---------- single-file artifact ---------- */
async function buildArtifact() {
  const js = (await bundle('web.js')).replace(/<\/script/g, '<\\/script').replace(/<!--/g, '<\\!--');
  const css = fs.readFileSync(rel('styles/app.css'), 'utf8');
  const head = fs.readFileSync(rel('web/artifact-head.html'), 'utf8');
  const body = fs.readFileSync(rel('web/artifact-body.html'), 'utf8')
    .replace('/*APP*/', () => 'window.__startWritex=function(){' + js + '\n};');
  const out = head + '<style>\n' + css + '</style>\n' + body;
  write(rel('dist/writex.html'), out);
  console.log('dist/writex.html', kb(out.length));
}

/* ---------- app (www/) ---------- */
const VENDOR = [
  ['react.js', ['react/umd/react.production.min.js']],
  ['react-dom.js', ['react-dom/umd/react-dom.production.min.js']],
  ['quill.js', ['quill/dist/quill.js']],
  ['lucide.js', ['lucide/dist/umd/lucide.min.js', 'lucide/dist/umd/lucide.js']],
  ['html2canvas.js', ['html2canvas/dist/html2canvas.min.js']],
  ['jspdf.js', ['jspdf/dist/jspdf.umd.min.js']],
  ['mammoth.js', ['mammoth/mammoth.browser.min.js', 'mammoth/mammoth.browser.js']],
  ['docx.js', ['docx/dist/index.iife.js', 'docx/build/index.iife.js', 'docx/build/index.umd.js', 'docx/dist/index.umd.cjs']],
  ['pdf.js', ['pdfjs-dist/build/pdf.min.js', 'pdfjs-dist/legacy/build/pdf.min.js']],
  ['pdf.worker.js', ['pdfjs-dist/build/pdf.worker.min.js', 'pdfjs-dist/legacy/build/pdf.worker.min.js']],
  ['pptxgen.js', ['pptxgenjs/dist/pptxgen.bundle.js']],
  ['mathjax.js', ['mathjax/es5/tex-svg-full.js']],
];

// Fonts used by the interface and the document font menu: package → [family, styles]
const FONTS = [
  ['geist-sans', 'Geist', ['400', '500', '600']],
  ['fraunces', 'Fraunces', ['500', '600']],
  ['amiri', 'Amiri', ['400', '700', '400-italic']],
  ['noto-naskh-arabic', 'Noto Naskh Arabic', ['400', '700']],
  ['ibm-plex-sans-arabic', 'IBM Plex Sans Arabic', ['400', '500', '600', '700']],
  ['cairo', 'Cairo', ['400', '700']],
  ['tajawal', 'Tajawal', ['400', '700']],
  ['noto-kufi-arabic', 'Noto Kufi Arabic', ['400', '700']],
  ['scheherazade-new', 'Scheherazade New', ['400', '700']],
  ['carlito', 'Carlito', ['400', '700', '400-italic', '700-italic']],
  ['source-serif-4', 'Source Serif 4', ['400', '700', '400-italic', '700-italic']],
  ['lora', 'Lora', ['400', '700', '400-italic', '700-italic']],
  ['merriweather', 'Merriweather', ['400', '700', '400-italic']],
  ['eb-garamond', 'EB Garamond', ['400', '700', '400-italic']],
  ['roboto', 'Roboto', ['400', '700', '400-italic']],
  ['open-sans', 'Open Sans', ['400', '700', '400-italic']],
  ['lato', 'Lato', ['400', '700', '400-italic']],
  ['courier-prime', 'Courier Prime', ['400', '700', '400-italic']],
];
const KEEP_SUBSETS = /-(latin|latin-ext|arabic)-\d/;

function buildFonts(out) {
  let css = '/* Bundled fonts (from @fontsource), so the app looks the same offline */\n';
  let bytes = 0;
  const missing = [];
  for (const [pkg, family, styles] of FONTS) {
    const dir = path.join(NM, '@fontsource', pkg);
    if (!fs.existsSync(dir)) { missing.push('@fontsource/' + pkg); continue; }
    for (const st of styles) {
      const file = path.join(dir, st + '.css');
      if (!fs.existsSync(file)) { console.warn(`  font style missing: ${pkg} ${st}`); continue; }
      const src = fs.readFileSync(file, 'utf8');
      for (const block of src.match(/@font-face\s*{[^}]*}/g) || []) {
        const m = block.match(/url\(\.?\/?files\/([^)]+?\.woff2)\)/);
        if (!m || !KEEP_SUBSETS.test(m[1])) continue;
        const data = fs.readFileSync(path.join(dir, 'files', m[1]));
        write(path.join(out, 'fonts', m[1]), data);
        bytes += data.length;
        css += block
          .replace(/font-family:\s*[^;]+;/, `font-family: '${family}';`)
          .replace(/src:[^;]+;/, `src: url(${m[1]}) format('woff2');`) + '\n';
      }
    }
  }
  if (missing.length) throw new Error('Font packages missing: ' + missing.join(', ') + '. Run "npm install".');
  write(path.join(out, 'fonts', 'fonts.css'), css);
  console.log('  fonts', kb(bytes));
}

async function buildApp() {
  const out = rel('www');
  fs.rmSync(out, { recursive: true, force: true });
  for (const [name, candidates] of VENDOR) {
    const found = candidates.map((c) => path.join(NM, c)).find((f) => fs.existsSync(f));
    if (!found) throw new Error(`Library file for ${name} not found. Looked for: ${candidates.join(', ')}`);
    fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
    fs.copyFileSync(found, path.join(out, 'vendor', name));
  }
  buildFonts(out);
  const js = await bundle('capacitor.js');
  write(path.join(out, 'app.js'), js);
  fs.copyFileSync(rel('styles/app.css'), path.join(out, 'app.css'));
  fs.cpSync(rel('web/icons'), path.join(out, 'icons'), { recursive: true });
  fs.copyFileSync(rel('web/manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
  fs.copyFileSync(rel('web/index.html'), path.join(out, 'index.html'));
  console.log('www/app.js', kb(js.length));
}

(artifact ? buildArtifact() : buildApp()).catch((e) => { console.error('\nBuild failed: ' + (e && e.message || e)); process.exit(1); });
