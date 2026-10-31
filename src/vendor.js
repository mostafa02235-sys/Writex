// Where third-party libraries come from. The app build bundles them under vendor/
// (works offline); the single-file artifact loads them from public CDNs.
const BASE = typeof window !== 'undefined' && window.__WRITEX_VENDOR;
export const bundled = !!BASE;
export const libUrls = (file, cdn) => (BASE ? [BASE + file, ...cdn] : cdn);
export const vendorUrl = (file) => (BASE ? BASE + file : null);
