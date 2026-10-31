#!/usr/bin/env node
// Installs the Writex APK on a connected Android device or emulator and checks the
// real app: start-up, icon/label, document creation, typing, automatic saving,
// persistence across restarts, exports, Arabic interface and the back button.
// Used by .github/workflows/build-android.yml. Usage:
//   node scripts/device-test.mjs <path/to/app.apk> <results-folder>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _android as android } from 'playwright';

const [apk, outDir = 'device-results'] = process.argv.slice(2);
const PKG = 'com.writex.app';
fs.mkdirSync(outDir, { recursive: true });
const results = [];
const consoleLines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const log = (m) => { console.log(m); fs.appendFileSync(path.join(outDir, 'test-log.txt'), m + '\n'); };

async function check(name, fn, { critical = true } = {}) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, critical, ms: Date.now() - t, detail: detail || '' });
    log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    results.push({ name, ok: false, critical, ms: Date.now() - t, error: String(e && e.stack || e) });
    log(`FAIL  ${name} — ${e && e.message || e}`);
  }
}

let device, page;
async function shot(name) {
  try { fs.writeFileSync(path.join(outDir, name + '.png'), await device.screenshot()); } catch (e) { log('screenshot failed: ' + e.message); }
}
async function attach() {
  const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
  page = await webview.page();
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
  return page;
}
async function launch() {
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  await sleep(2500);
  return attach();
}
const back = async () => { adb('shell', 'input', 'keyevent', '4'); await sleep(900); };

(async () => {
  [device] = await android.devices();
  if (!device) throw new Error('No Android device found');
  log('Device: ' + device.model() + ' ' + device.serial());

  await check('Install the APK', async () => {
    adb('install', '-r', apk);
    const p = adb('shell', 'pm', 'list', 'packages', PKG);
    if (!p.includes(PKG)) throw new Error('package not installed');
    const dump = adb('shell', 'dumpsys', 'package', PKG);
    return (dump.match(/versionName=\S+/) || [''])[0];
  });

  await check('App starts and shows the home screen', async () => {
    await launch();
    await page.waitForSelector('.shell, .ed-error', { timeout: 45000 });
    if (await page.$('.ed-error')) throw new Error(await page.textContent('.ed-error'));
    await sleep(1200);
    await shot('01-home');
    const title = await page.title();
    if (title !== 'Writex') throw new Error('title is ' + title);
    return 'title ' + title;
  });

  await check('Writex branding (no old name)', async () => {
    const text = await page.evaluate(() => document.body.innerText);
    if (/qalam/i.test(text)) throw new Error('old name visible');
    const brand = await page.$$eval('.brand-name', (els) => els.map((e) => e.textContent));
    return 'brand: ' + brand.join(', ');
  });

  await check('AMOLED black background', async () => {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (bg !== 'rgb(0, 0, 0)') throw new Error('body background is ' + bg);
    return bg;
  });

  await check('Native bridge is active', async () => {
    const native = await page.evaluate(() => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
    if (!native) throw new Error('Capacitor bridge missing');
    const cls = await page.evaluate(() => document.documentElement.className);
    return cls;
  });

  const STAMP = 'Writex device test ' + Date.now();
  await check('Create a document and type in it', async () => {
    await page.click('[data-test="new-doc"]');
    await page.waitForSelector('.qwrap .ql-editor', { timeout: 20000 });
    await sleep(800);
    // A finger tap lands on the page sheet, which focuses the editor; do the same directly.
    await page.evaluate(() => { const ed = document.querySelector('.qwrap .ql-editor'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    // insertText goes through the same input path as the on-screen keyboard's text commit
    await page.keyboard.insertText(STAMP + '. ');
    await sleep(300);
    await page.keyboard.insertText('مرحبا بالعالم');
    await sleep(1500);
    await shot('02-editor');
    const txt = await page.textContent('.qwrap .ql-editor');
    if (!txt.includes(STAMP)) throw new Error('typed text not found');
    return 'typed ' + txt.length + ' chars';
  });

  await check('Automatic saving', async () => {
    await page.waitForFunction(() => !document.querySelector('.save-state.saving'), null, { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    const saved = await page.evaluate((stamp) => new Promise((resolve) => {
      const req = indexedDB.open('qalam-docs');
      req.onsuccess = () => {
        const tx = req.result.transaction('docs', 'readonly');
        const all = tx.objectStore('docs').getAll();
        all.onsuccess = () => resolve(all.result.some((d) => (d.text || '').includes(stamp) || JSON.stringify(d.delta || '').includes(stamp)));
        all.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    }), STAMP);
    if (!saved) throw new Error('document not found in storage');
    return 'stored in IndexedDB';
  });

  await check('Android back button leaves the editor', async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await back();
    if (await page.$('.qwrap .ql-editor')) await back(); // first press may close the keyboard
    await page.waitForSelector('.shell', { timeout: 10000 });
    await shot('03-after-back');
    return 'back on home';
  });

  await check('Documents survive an app restart', async () => {
    adb('shell', 'am', 'force-stop', PKG);
    await sleep(1500);
    await launch();
    await page.waitForSelector('.shell', { timeout: 45000 });
    await sleep(1500);
    const body = await page.evaluate(() => document.body.innerText);
    const found = await page.evaluate((stamp) => new Promise((resolve) => {
      const req = indexedDB.open('qalam-docs');
      req.onsuccess = () => { const all = req.result.transaction('docs').objectStore('docs').getAll(); all.onsuccess = () => resolve(all.result.some((d) => JSON.stringify(d.delta || '').includes(stamp))); };
      req.onerror = () => resolve(false);
    }), STAMP);
    if (!found) throw new Error('document lost after restart');
    return body.includes('Writex device test') ? 'listed on home' : 'stored';
  });

  await check('Placeholder hides while typing with the Android keyboard', async () => {
    await page.locator('.snav-item').nth(0).click(); await sleep(500);
    await page.locator('.subtab').first().click(); await sleep(400);
    await page.click('[data-test="new-doc"]');
    await page.waitForSelector('.qwrap .ql-editor', { timeout: 20000 });
    await sleep(800);
    const shown = () => page.evaluate(() => { const e = document.querySelector('.ed-placeholder'); return !!e && !e.hidden; });
    const text = () => page.evaluate(() => document.querySelector('.qwrap .ql-editor').textContent);
    if (!(await shown())) throw new Error('hint not shown on an empty document');
    await page.evaluate(() => { const ed = document.querySelector('.qwrap .ql-editor'); ed.focus(); });
    await sleep(800);
    // Real key input through the on-screen keyboard (IME composition on Android)
    adb('shell', 'input', 'text', 'Hello');
    await sleep(600);
    const midShown = await shown(); const mid = await text();
    await shot('08-placeholder-typing');
    if (midShown) throw new Error('hint still visible while typing: "' + mid + '"');
    if (!mid.includes('Hello')) throw new Error('typed text missing: "' + mid + '"');
    for (let i = 0; i < 8; i++) adb('shell', 'input', 'keyevent', '67');
    await sleep(900);
    const after = await text();
    if (after.trim()) throw new Error('text not deleted: "' + after + '"');
    if (!(await shown())) throw new Error('hint did not come back after deleting everything');
    await shot('09-placeholder-empty-again');
    const saved = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('qalam-docs'); q.onsuccess = () => { const a = q.result.transaction('docs').objectStore('docs').getAll(); a.onsuccess = () => r(a.result.some((d) => /Start writing|ابدأ الكتابة/.test(JSON.stringify(d.delta || '')))); }; }));
    if (saved) throw new Error('placeholder text was saved into a document');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await back(); if (await page.$('.qwrap .ql-editor')) await back();
    return 'shown → hidden while typing → shown after deleting';
  });

  await check('Writex AI: connect to the server', async () => {
    adb('reverse', 'tcp:8787', 'tcp:8787');
    await page.evaluate(() => window.__writex.setAIServer('http://localhost:8787'));
    await page.locator('.snav-item').nth(3).click(); await sleep(800);
    await page.locator('.think-tabs .subtab').nth(0).click(); await sleep(1500);
    const ok = await page.waitForSelector('.wx-dot.ok', { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) throw new Error(await page.evaluate(() => (document.querySelector('.ai-status') || {}).textContent || 'not connected'));
    return 'connected through localhost:8787';
  });

  await check('Writex AI: conversation streams and completes', async () => {
    await page.fill('#wx-input', 'Hello from Android, write two lines about rain');
    await page.click('.wx-composer .tb.accent');
    await page.waitForSelector('.wx-msg.bot.completed', { timeout: 60000 });
    const t = await page.locator('.wx-msg.bot.completed .wx-md').last().innerText();
    return t.slice(0, 80);
  });

  await check('Writex AI: cancel a running task', async () => {
    await page.fill('#wx-input', '[slow] write a very long essay about the sea and the mountains and the rivers');
    await page.click('.wx-composer .tb.accent');
    await page.waitForSelector('.wx-task .btn', { timeout: 30000 });
    await sleep(1500);
    await page.click('.wx-task .btn');
    await page.waitForSelector('.wx-msg.bot.cancelled', { timeout: 30000 });
    return 'cancelled';
  });

  await check('Writex AI: summarise an attached document and insert the result', async () => {
    await page.click('.wx-composer .tb.lg');
    await page.waitForSelector('.bsheet .spick .mrow', { timeout: 15000 });
    await page.locator('.bsheet .spick .mrow').first().click();
    await sleep(600);
    await page.click('[data-action="summarize"]');
    await page.waitForFunction(() => { const m = [...document.querySelectorAll('.wx-msg.bot')].pop(); return m && /completed|failed/.test(m.className); }, null, { timeout: 90000 });
    const cls = await page.locator('.wx-msg.bot').last().getAttribute('class');
    if (!/completed/.test(cls)) throw new Error(await page.locator('.wx-msg.bot').last().innerText());
    await shot('10-writex-ai');
    await page.locator('.wx-msg.bot.completed .wx-actions .btn').nth(1).click();
    await page.waitForSelector('.bsheet .mlist .mrow', { timeout: 10000 });
    const title = await page.locator('.bsheet .mlist .mrow').first().innerText();
    await page.locator('.bsheet .mlist .mrow').first().click();
    await page.waitForSelector('.modal .btn.primary', { timeout: 5000 });
    await page.click('.modal .btn.primary');
    await sleep(1200);
    const inserted = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('qalam-docs'); q.onsuccess = () => { const a = q.result.transaction('docs').objectStore('docs').getAll(); a.onsuccess = () => r(a.result.some((d) => JSON.stringify(d.delta || '').includes('TEST MODEL'))); }; }));
    if (!inserted) throw new Error('result not found in the document');
    return 'inserted into ' + title.split('\n')[0];
  });

  await check('Writex AI button in the editor', async () => {
    await page.locator('.snav-item').nth(0).click(); await sleep(500);
    await page.locator('.subtab').first().click(); await sleep(400);
    await page.click('[data-test="new-doc"]');
    await page.waitForSelector('[data-test="wx-fab"]', { timeout: 20000 });
    await page.click('[data-test="wx-fab"]');
    await page.waitForSelector('.bsheet .ai-tool', { timeout: 10000 });
    await shot('11-editor-ai');
    await back(); await sleep(400); await back(); await sleep(400);
    if (await page.$('.qwrap .ql-editor')) await back();
    return 'opens the assistant';
  });

  await check('Switch the interface to Arabic', async () => {
    const ok = await page.evaluate(() => {
      if (!window.__writex || !window.__writex.setLang) return false;
      window.__writex.setLang('ar');
      return true;
    });
    if (!ok) throw new Error('language switcher not available');
    await sleep(2500);
    await attach();
    await page.waitForSelector('.shell', { timeout: 30000 });
    await sleep(1000);
    const dir = await page.evaluate(() => document.documentElement.dir);
    await shot('04-arabic-home');
    if (dir !== 'rtl') throw new Error('dir is ' + dir);
    for (const [i, name] of [[2, '06-arabic-create'], [1, '07-arabic-read']]) {
      await page.locator('.snav-item').nth(i).click(); await sleep(900); await shot(name);
    }
    await page.locator('.snav-item').nth(0).click(); await sleep(700);
    return 'dir=rtl';
  }, { critical: false });

  await check('Export a PDF to Documents/Writex', async () => {
    const ok = await page.evaluate(() => !!(window.__writex && window.__writex.exportLatest));
    if (!ok) throw new Error('export hook not available');
    await page.evaluate(() => window.__writex.exportLatest('pdf'));
    await sleep(6000);
    const ls = adb('shell', 'ls', '/sdcard/Documents/Writex/');
    if (!/\.pdf/.test(ls)) throw new Error('no PDF in Documents/Writex: ' + ls);
    return ls.trim().split('\n').join(', ');
  }, { critical: false });

  await check('Export a Word (DOCX) file', async () => {
    await page.evaluate(() => window.__writex.exportLatest('docx'));
    await sleep(5000);
    const ls = adb('shell', 'ls', '-l', '/sdcard/Documents/Writex/');
    if (!/\.docx/.test(ls)) throw new Error('no DOCX: ' + ls);
    return ls.trim().split('\n').filter((l) => /docx/.test(l)).join(', ');
  }, { critical: false });

  await check('Landscape layout has no sideways scrolling', async () => {
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
    await sleep(2500);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    await shot('05-landscape');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
    await sleep(1500);
    if (w[0] > w[1] + 2) throw new Error('content wider than screen: ' + w.join(' > '));
    return w.join(' / ');
  }, { critical: false });

  await check('No JavaScript errors', async () => {
    const errs = consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l) && !/favicon|ERR_INTERNET_DISCONNECTED|net::/.test(l));
    if (errs.length) throw new Error(errs.slice(0, 8).join('\n'));
    return consoleLines.length + ' console lines';
  }, { critical: false });
})()
  .catch((e) => { results.push({ name: 'test runner', ok: false, critical: true, error: String(e && e.stack || e) }); log('RUNNER ERROR ' + (e && e.stack || e)); })
  .finally(async () => {
    try { fs.writeFileSync(path.join(outDir, 'logcat.txt'), adb('logcat', '-d', '-v', 'brief', 'Capacitor:V', 'Capacitor/Console:V', 'chromium:V', 'AndroidRuntime:E', '*:S').slice(-200000)); } catch (e) { /* ignore */ }
    fs.writeFileSync(path.join(outDir, 'console.txt'), consoleLines.join('\n'));
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok && r.critical);
    log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
    try { if (device) await device.close(); } catch (e) { /* ignore */ }
    process.exit(failed.length ? 1 : 0);
  });
