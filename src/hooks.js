import { useState, useEffect } from './react.js';

// Phones (portrait or landscape) and small tablets get the mobile UI.
export const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 520px)';

export function matches(q) {
  try { return window.matchMedia(q).matches; } catch (e) { return false; }
}

export function useMedia(q) {
  const [m, setM] = useState(() => matches(q));
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(q); } catch (e) { return undefined; }
    const on = () => setM(mq.matches);
    on();
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, [q]);
  return m;
}

export const useIsMobile = () => useMedia(MOBILE_QUERY);
