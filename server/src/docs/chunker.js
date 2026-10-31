// Splits long text into chunks on paragraph and sentence boundaries.
export function chunkText(text, maxChars = 20000, overlap = 400) {
  const s = String(text || '');
  if (s.length <= maxChars) return s.trim() ? [s] : [];
  const chunks = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(s.length, start + maxChars);
    if (end < s.length) {
      const window = s.slice(start + Math.floor(maxChars * 0.6), end);
      const para = window.lastIndexOf('\n\n');
      const sent = Math.max(window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf('؟ '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf('\n'));
      const cut = para >= 0 ? para : sent;
      if (cut >= 0) end = start + Math.floor(maxChars * 0.6) + cut + 1;
    }
    chunks.push(s.slice(start, end));
    if (end >= s.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
