// Native integration for the Android (and future iOS) app built with Capacitor.
// In a normal browser or the Claude artifact every function here falls back to
// the web behaviour, so the same code runs everywhere.
import * as N from 'writex-native';

export const isNative = !!(N.Capacitor && N.Capacitor.isNativePlatform && N.Capacitor.isNativePlatform());
export const platform = isNative ? N.Capacitor.getPlatform() : 'web';

/* ---------- Android back button ----------
   Open sheets, dialogs and screens register a handler; the most recent one runs.
   Each handler returns true when it handled the press. */
const backStack = [];
let rootBack = null;
let layerBack = null;
// Closes open menus, sheets and dialogs first; always checked before screen handlers.
export function setLayerBack(fn) { layerBack = fn; }
export function onBack(fn) {
  const entry = { fn };
  backStack.push(entry);
  return () => { const i = backStack.indexOf(entry); if (i >= 0) backStack.splice(i, 1); };
}
export function setRootBack(fn) { rootBack = fn; }
export function handleBack() {
  if (layerBack && layerBack()) return true;
  for (let i = backStack.length - 1; i >= 0; i--) {
    try { if (backStack[i].fn() !== false) return true; } catch (e) { console.error(e); return true; }
  }
  if (rootBack && rootBack()) return true;
  return false;
}

/* ---------- lifecycle ---------- */
// Fired when the app goes to the background so open documents save immediately.
export const BACKGROUND_EVENT = 'writex:background';

let started = false;
export async function initNative({ theme } = {}) {
  if (!isNative || started) return;
  started = true;
  document.documentElement.classList.add('native', 'native-' + platform);
  try {
    N.App.addListener('backButton', () => {
      if (!handleBack()) N.App.exitApp();
    });
    N.App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) window.dispatchEvent(new Event(BACKGROUND_EVENT));
    });
    N.App.addListener('pause', () => window.dispatchEvent(new Event(BACKGROUND_EVENT)));
  } catch (e) { console.error('App plugin', e); }
  setSystemBars(theme || 'dark');
}

export async function setSystemBars(theme) {
  if (!isNative) return;
  const dark = theme !== 'light';
  try {
    await N.StatusBar.setStyle({ style: dark ? N.Style.Dark : N.Style.Light });
    if (platform === 'android') await N.StatusBar.setBackgroundColor({ color: dark ? '#000000' : '#F6F5F2' });
  } catch (e) { /* status bar plugin unavailable */ }
}

export async function hideSplash() {
  if (!isNative) return;
  try { await N.SplashScreen.hide({ fadeOutDuration: 180 }); } catch (e) { /* ignore */ }
}

/* ---------- files ---------- */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('The file could not be prepared.'));
    r.readAsDataURL(blob);
  });
}

// Writes a file into Documents/Writex on the device. Returns { uri, where }.
export async function nativeSave(filename, blob) {
  const data = await blobToBase64(blob);
  try {
    const res = await N.Filesystem.writeFile({ path: 'Writex/' + filename, data, directory: N.Directory.Documents, recursive: true });
    return { uri: res.uri, where: 'Documents/Writex' };
  } catch (e) {
    // Some Android versions refuse shared folders; keep a private copy and let the person share it.
    const res = await N.Filesystem.writeFile({ path: 'exports/' + filename, data, directory: N.Directory.Cache, recursive: true });
    return { uri: res.uri, where: null };
  }
}

// Opens the system share sheet for a file (or text). Returns 'shared' | 'cancelled'.
export async function nativeShare({ title, text, filename, blob }) {
  let files;
  if (blob) {
    const data = await blobToBase64(blob);
    const res = await N.Filesystem.writeFile({ path: 'share/' + filename, data, directory: N.Directory.Cache, recursive: true });
    files = [res.uri];
  }
  try {
    await N.Share.share({ title, text, files, dialogTitle: title });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(String(e && e.message))) return 'cancelled';
    throw e;
  }
}

export const canNativeShare = isNative;
