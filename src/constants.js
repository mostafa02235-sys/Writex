// Document geometry and typography presets. Units: CSS px at 96 dpi.

export const PAGE_SIZES = {
  A4: { label: 'A4', note: '21 × 29.7 cm', w: 794, h: 1123 },
  Letter: { label: 'Letter', note: '8.5 × 11 in', w: 816, h: 1056 },
  Legal: { label: 'Legal', note: '8.5 × 14 in', w: 816, h: 1344 },
  A5: { label: 'A5', note: '14.8 × 21 cm', w: 559, h: 794 },
};

export const MARGIN_PRESETS = {
  normal: { label: 'Normal', note: '2.54 cm all sides', t: 96, b: 96, l: 96, r: 96 },
  narrow: { label: 'Narrow', note: '1.27 cm all sides', t: 48, b: 48, l: 48, r: 48 },
  moderate: { label: 'Moderate', note: '2.54 cm · 1.91 cm sides', t: 96, b: 96, l: 72, r: 72 },
  wide: { label: 'Wide', note: '2.54 cm · 5.08 cm sides', t: 96, b: 96, l: 192, r: 192 },
};

export const PX_PER_CM = 96 / 2.54;
export const PAGE_GAP = 28;

export const AR_FALLBACK = "'Noto Naskh Arabic'";

export const FONTS = [
  { name: 'Carlito', stack: "'Carlito', 'Noto Naskh Arabic', Calibri, sans-serif", group: 'Latin' },
  { name: 'Source Serif 4', stack: "'Source Serif 4', 'Noto Naskh Arabic', Georgia, serif", group: 'Latin' },
  { name: 'Lora', stack: "'Lora', 'Noto Naskh Arabic', Georgia, serif", group: 'Latin' },
  { name: 'Merriweather', stack: "'Merriweather', 'Noto Naskh Arabic', Georgia, serif", group: 'Latin' },
  { name: 'EB Garamond', stack: "'EB Garamond', 'Amiri', Garamond, serif", group: 'Latin' },
  { name: 'Roboto', stack: "'Roboto', 'Noto Naskh Arabic', Arial, sans-serif", group: 'Latin' },
  { name: 'Open Sans', stack: "'Open Sans', 'Noto Naskh Arabic', Arial, sans-serif", group: 'Latin' },
  { name: 'Lato', stack: "'Lato', 'Noto Naskh Arabic', Arial, sans-serif", group: 'Latin' },
  { name: 'Courier Prime', stack: "'Courier Prime', 'Noto Naskh Arabic', 'Courier New', monospace", group: 'Latin' },
  { name: 'Arial', stack: "Arial, 'Noto Naskh Arabic', Helvetica, sans-serif", group: 'System' },
  { name: 'Times New Roman', stack: "'Times New Roman', 'Amiri', Times, serif", group: 'System' },
  { name: 'Georgia', stack: "Georgia, 'Amiri', serif", group: 'System' },
  { name: 'Noto Naskh Arabic', stack: "'Noto Naskh Arabic', 'Carlito', serif", group: 'Arabic', ar: 'نسخ' },
  { name: 'Amiri', stack: "'Amiri', 'Source Serif 4', serif", group: 'Arabic', ar: 'أميري' },
  { name: 'Scheherazade New', stack: "'Scheherazade New', 'Source Serif 4', serif", group: 'Arabic', ar: 'شهرزاد' },
  { name: 'Cairo', stack: "'Cairo', 'Open Sans', sans-serif", group: 'Arabic', ar: 'القاهرة' },
  { name: 'Tajawal', stack: "'Tajawal', 'Roboto', sans-serif", group: 'Arabic', ar: 'تجوال' },
  { name: 'IBM Plex Sans Arabic', stack: "'IBM Plex Sans Arabic', 'Roboto', sans-serif", group: 'Arabic', ar: 'بلكس' },
  { name: 'Noto Kufi Arabic', stack: "'Noto Kufi Arabic', 'Roboto', sans-serif", group: 'Arabic', ar: 'كوفي' },
];

export function fontByStack(stack) {
  if (!stack) return null;
  const first = String(stack).split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  return FONTS.find((f) => f.name.toLowerCase() === first) || { name: String(stack).split(',')[0].replace(/["']/g, '').trim(), stack };
}

export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

export const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
export const PARA_SPACINGS = [
  { label: 'None', before: 0, after: 0 },
  { label: 'Compact', before: 0, after: 4 },
  { label: 'Normal', before: 0, after: 8 },
  { label: 'Open', before: 6, after: 12 },
  { label: 'Relaxed', before: 12, after: 18 },
];

export const TEXT_COLORS = [
  '#000000', '#3A3F4B', '#6B7280', '#9CA3AF', '#FFFFFF',
  '#B42318', '#C4320A', '#B54708', '#027A48', '#0E7090',
  '#1D4ED8', '#3E1C96', '#86198F', '#9F1239', '#1F2937',
];
export const HIGHLIGHTS = [
  '#FFF3A3', '#FFD8A8', '#FFC9C9', '#C3FAE8', '#D0EBFF', '#E5DBFF', '#FCC2D7', '#E9ECEF',
];

export const DEFAULT_SETTINGS = {
  size: 'A4',
  orientation: 'portrait',
  margins: { ...MARGIN_PRESETS.normal },
  marginPreset: 'normal',
  dir: 'ltr',
  font: FONTS[0].stack,
  fontSize: 12,
  lineHeight: 1.15,
  header: { text: '', align: 'center' },
  footer: { text: '', align: 'center' },
  pageNumbers: { on: false, where: 'footer', align: 'center', format: 'n' },
  firstPageDifferent: false,
  lang: 'auto',
  spellcheck: true,
};

export function pageGeometry(s) {
  const base = PAGE_SIZES[s.size] || PAGE_SIZES.A4;
  const land = s.orientation === 'landscape';
  const W = land ? base.h : base.w;
  const H = land ? base.w : base.h;
  const m = s.margins;
  const C = Math.max(120, H - m.t - m.b);
  return { W, H, m, C, stride: H + PAGE_GAP, contentW: Math.max(160, W - m.l - m.r) };
}
