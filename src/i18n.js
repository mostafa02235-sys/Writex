// Interface language (English / العربية).
//
// Strings are written in English in the code and wrapped in t(); the Arabic
// catalogue in locales/ar.js maps each English string to its translation.
// Placeholders {0}, {1}… are filled from the extra arguments:
//   t('Page {0} of {1}', page, total)
// "npm run i18n:check" lists any string that still needs an Arabic translation.
//
// Document content is never translated or re-ordered: only the interface follows
// the chosen language. Changing the language reloads the interface (documents are
// saved first), so every screen, menu and message switches at once.
import { AR } from './locales/ar.js';

export const LANGS = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
];
const KEY = 'writex.lang';

function stored() {
  try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'ar' ? v : null; } catch (e) { return null; }
}
function deviceLang() {
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    return String(list[0] || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch (e) { return 'en'; }
}

export const lang = stored() || deviceLang();
export const isArabic = lang === 'ar';
export const dir = isArabic ? 'rtl' : 'ltr';
// Locale for dates and numbers; Western digits keep tables and page numbers consistent.
export const locale = isArabic ? 'ar-u-nu-latn' : 'en';

// 'system' when the person never chose, so Settings can show "Same as device".
export const langPref = () => stored() || 'system';

export function t(s, ...args) {
  let out = isArabic && Object.prototype.hasOwnProperty.call(AR, s) ? AR[s] : s;
  if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (args[i] == null ? '' : String(args[i])));
  return out;
}

export function applyLang() {
  const el = document.documentElement;
  el.lang = isArabic ? 'ar' : 'en';
  el.dir = dir;
  el.classList.toggle('ui-ar', isArabic);
}

// pref: 'en' | 'ar' | 'system'. Saves, then reloads the interface in the new language.
export function setLang(pref, beforeReload) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref);
  } catch (e) { /* storage unavailable: the choice lasts for this session only */ }
  const next = pref === 'system' ? deviceLang() : pref;
  if (next === lang) return;
  Promise.resolve(beforeReload && beforeReload()).finally(() => window.location.reload());
}
