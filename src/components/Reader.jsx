import React, { useState, useEffect, useRef, useMemo } from '../react.js';
import { Icon } from '../icons.jsx';
import { storage, AR_RE, firstStrongDir } from '../util.js';

// Distraction-free reading with adjustable type, search, text-to-speech and
// a remembered reading position.
const THEMES = [
  { id: 'night', label: 'Black' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'day', label: 'Paper' },
];

export function Reader({ html, title, docId, dir, font, onClose }) {
  const prefs = storage.get('qalam.reader', { size: 19, lh: 1.7, theme: 'night', rate: 1 });
  const [size, setSize] = useState(prefs.size);
  const [lh, setLh] = useState(prefs.lh);
  const [theme, setTheme] = useState(prefs.theme);
  const [rate, setRate] = useState(prefs.rate || 1);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState(null); // 'type' | 'search'
  const [q, setQ] = useState('');
  const [hits, setHits] = useState({ n: 0, cur: -1 });
  const [speaking, setSpeaking] = useState(null); // null | 'playing' | 'paused'
  const [progress, setProgress] = useState(0);
  const scroller = useRef(null);
  const body = useRef(null);
  const speakIdx = useRef(0);
  const tts = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';

  useEffect(() => { storage.set('qalam.reader', { size, lh, theme, rate }); }, [size, lh, theme, rate]);

  // restore & remember reading position
  useEffect(() => {
    const el = scroller.current;
    const pos = storage.get('qalam.readPos.' + docId, 0);
    const t = setTimeout(() => { el.scrollTop = pos * (el.scrollHeight - el.clientHeight); }, 60);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = el.scrollHeight - el.clientHeight;
        const p = max > 0 ? el.scrollTop / max : 0;
        setProgress(p);
        storage.set('qalam.readPos.' + docId, Math.round(p * 1000) / 1000);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(t); cancelAnimationFrame(raf); el.removeEventListener('scroll', onScroll); };
  }, [docId]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { if (panel) setPanel(null); else onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [panel, onClose]);

  // search highlighting with <mark>, done on the reader's own copy of the text
  useEffect(() => {
    const root = body.current;
    if (!root) return undefined;
    root.querySelectorAll('mark.rhit').forEach((m) => { const t = document.createTextNode(m.textContent); m.replaceWith(t); });
    root.normalize();
    const term = q.trim();
    if (!term) { setHits({ n: 0, cur: -1 }); return undefined; }
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let n = 0;
    for (const node of nodes) {
      const text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0; let m;
      while ((m = re.exec(text)) && n < 2000) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mk = document.createElement('mark'); mk.className = 'rhit'; mk.textContent = m[0]; frag.appendChild(mk);
        last = m.index + m[0].length; n++;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
    setHits({ n, cur: n ? 0 : -1 });
    return undefined;
  }, [q, html]);
  useEffect(() => {
    const marks = body.current ? body.current.querySelectorAll('mark.rhit') : [];
    marks.forEach((m, i) => m.classList.toggle('cur', i === hits.cur));
    if (hits.cur >= 0 && marks[hits.cur]) marks[hits.cur].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [hits]);

  /* ---------- text to speech ---------- */
  const blocks = () => Array.from(body.current ? body.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, .toc-row, .bib-item, .notes-list li') : [])
    .filter((el) => (el.textContent || '').trim() && !el.closest('li p'));
  const voiceFor = (text) => {
    const ar = firstStrongDir(text) === 'rtl' || AR_RE.test(text.slice(0, 40));
    const voices = window.speechSynthesis.getVoices();
    const want = ar ? 'ar' : (document.documentElement.lang || 'en').slice(0, 2);
    return { lang: ar ? 'ar-SA' : 'en-US', voice: voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(want)) || null };
  };
  const speakFrom = (i) => {
    const list = blocks();
    body.current && body.current.querySelectorAll('.speaking').forEach((e) => e.classList.remove('speaking'));
    if (i >= list.length) { setSpeaking(null); return; }
    speakIdx.current = i;
    const el = list[i];
    const text = (el.textContent || '').replace(/﻿/g, '').trim();
    const u = new SpeechSynthesisUtterance(text);
    const { lang, voice } = voiceFor(text);
    u.lang = lang; if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => { if (speakIdx.current === i) speakFrom(i + 1); };
    u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') setSpeaking(null); };
    el.classList.add('speaking');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.speechSynthesis.speak(u);
  };
  const play = () => {
    if (!tts) return;
    if (speaking === 'paused') { window.speechSynthesis.resume(); setSpeaking('playing'); return; }
    window.speechSynthesis.cancel();
    // start from the first block that is visible
    const list = blocks();
    const top = scroller.current.getBoundingClientRect().top;
    let start = list.findIndex((el) => el.getBoundingClientRect().bottom > top + 40);
    if (start < 0) start = 0;
    setSpeaking('playing');
    speakFrom(start);
  };
  const pause = () => { window.speechSynthesis.pause(); setSpeaking('paused'); };
  const stopSpeak = () => { speakIdx.current = -1; window.speechSynthesis.cancel(); setSpeaking(null); body.current && body.current.querySelectorAll('.speaking').forEach((e) => e.classList.remove('speaking')); };
  useEffect(() => () => { if (tts) window.speechSynthesis.cancel(); }, []);

  const words = useMemo(() => {
    const d = document.createElement('div'); d.innerHTML = html;
    return ((d.textContent || '').match(/[^\s]+/g) || []).length;
  }, [html]);
  const minutesLeft = Math.max(1, Math.round((words * (1 - progress)) / 200));

  return (
    <div className={'reader theme-' + theme + (chrome ? '' : ' bare')} role="dialog" aria-label={'Reading ' + title}>
      <header className="r-bar">
        <button type="button" className="tb lg" aria-label="Close reading mode" onClick={onClose}><Icon name="X" size={22} /></button>
        <div className="r-title"><span dir="auto">{title}</span><small>{words.toLocaleString()} words · {minutesLeft} min left</small></div>
        <button type="button" className={'tb lg' + (panel === 'search' ? ' on' : '')} aria-label="Search in document" onClick={() => setPanel(panel === 'search' ? null : 'search')}><Icon name="Search" size={20} /></button>
        <button type="button" className={'tb lg' + (panel === 'type' ? ' on' : '')} aria-label="Text settings" onClick={() => setPanel(panel === 'type' ? null : 'type')}><Icon name="ALargeSmall" size={21} /></button>
      </header>
      <div className="r-progress" style={{ transform: `scaleX(${progress})` }} />
      {panel === 'search' && (
        <div className="r-panel">
          <label className="search">
            <Icon name="Search" size={18} />
            <input id="reader-search" autoFocus dir="auto" type="search" placeholder="Search in document" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && hits.n) setHits((h) => ({ ...h, cur: (h.cur + (e.shiftKey ? -1 : 1) + h.n) % h.n })); }} />
            <span className="fp-count tnum">{q ? (hits.n ? `${hits.cur + 1}/${hits.n}` : '0') : ''}</span>
          </label>
          <button type="button" className="tb lg" aria-label="Previous result" disabled={!hits.n} onClick={() => setHits((h) => ({ ...h, cur: (h.cur - 1 + h.n) % h.n }))}><Icon name="ChevronUp" size={20} /></button>
          <button type="button" className="tb lg" aria-label="Next result" disabled={!hits.n} onClick={() => setHits((h) => ({ ...h, cur: (h.cur + 1) % h.n }))}><Icon name="ChevronDown" size={20} /></button>
        </div>
      )}
      {panel === 'type' && (
        <div className="r-panel col">
          <div className="r-row"><span>Size</span>
            <div className="mstep"><button type="button" aria-label="Smaller text" onClick={() => setSize((v) => Math.max(13, v - 1))}><Icon name="Minus" size={18} /></button><span className="tnum">{size}</span><button type="button" aria-label="Larger text" onClick={() => setSize((v) => Math.min(34, v + 1))}><Icon name="Plus" size={18} /></button></div>
          </div>
          <div className="r-row"><span>Line spacing</span>
            <div className="mchips">{[1.4, 1.6, 1.8, 2.1].map((v) => <button type="button" key={v} className={'mchip' + (lh === v ? ' on' : '')} onClick={() => setLh(v)}>{v}</button>)}</div>
          </div>
          <div className="r-row"><span>Background</span>
            <div className="mchips">{THEMES.map((t) => <button type="button" key={t.id} className={'mchip' + (theme === t.id ? ' on' : '')} onClick={() => setTheme(t.id)}>{t.label}</button>)}</div>
          </div>
          {tts && <div className="r-row"><span>Reading speed</span>
            <div className="mchips">{[0.8, 1, 1.25, 1.5].map((v) => <button type="button" key={v} className={'mchip' + (rate === v ? ' on' : '')} onClick={() => setRate(v)}>{v}×</button>)}</div>
          </div>}
        </div>
      )}
      <div className="r-scroll" ref={scroller} onClick={(e) => { if (!panel && !e.target.closest('a, button, mark')) setChrome((c) => !c); else if (panel) setPanel(null); }}>
        <article className="r-page">
          <h1 className="r-doc-title" dir="auto">{title}</h1>
          <div ref={body} className="ql-editor r-body" dir={dir} style={{ fontSize: size + 'px', lineHeight: lh, fontFamily: font }} dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
      <footer className="r-foot">
        {tts ? (
          <div className="r-tts">
            {speaking === 'playing'
              ? <button type="button" className="btn" onClick={pause}><Icon name="Pause" size={18} />Pause</button>
              : <button type="button" className="btn primary" onClick={play}><Icon name="Play" size={18} />{speaking === 'paused' ? 'Resume' : 'Read aloud'}</button>}
            {speaking && <button type="button" className="tb lg" aria-label="Stop reading" onClick={stopSpeak}><Icon name="Square" size={18} /></button>}
          </div>
        ) : <span className="r-note">Read aloud is not supported in this browser.</span>}
        <span className="r-pct tnum">{Math.round(progress * 100)}%</span>
      </footer>
    </div>
  );
}
