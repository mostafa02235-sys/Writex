import React, { useState, useEffect, useRef, useLayoutEffect } from '../react.js';
import { Icon } from '../icons.jsx';

const portal = (node) => window.ReactDOM.createPortal(node, document.body);

// Toolbar button that never steals focus from the editor.
export function TB({ icon, label, onClick, active, disabled, wide, children, className, title, kbd }) {
  return (
    <button type="button" className={'tb' + (active ? ' on' : '') + (wide ? ' wide' : '') + (className ? ' ' + className : '')}
      aria-label={label} aria-pressed={active === undefined ? undefined : !!active} title={(title || label) + (kbd ? ` (${kbd})` : '')}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon && <Icon name={icon} size={wide ? 20 : 18} />}
      {children}
    </button>
  );
}

export function Group({ label, children, className }) {
  return (
    <div className={'rg ' + (className || '')} role="group" aria-label={label}>
      <div className="rg-body">{children}</div>
      <div className="rg-label">{label}</div>
    </div>
  );
}

// A dropdown anchored to its trigger, rendered in a portal so ribbons can scroll.
export function Drop({ trigger, children, width, align = 'start', className, label, disabled, onOpen }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const place = () => {
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width || 220, vw - 16);
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.bottom + 6;
    const ph = pop.current ? pop.current.offsetHeight : 300;
    if (top + ph > vh - 8 && r.top - ph - 6 > 8) top = r.top - ph - 6;
    setPos({ left, top, width: w, maxHeight: Math.max(160, vh - top - 12) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (pop.current && pop.current.contains(e.target)) return;
      if (btn.current && btn.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    const re = () => place();
    window.addEventListener('mousedown', down, true);
    window.addEventListener('touchstart', down, true);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', re);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('touchstart', down, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', re);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" ref={btn} className={'tb drop-trigger ' + (className || '') + (open ? ' on' : '')} aria-haspopup="true" aria-expanded={open}
        aria-label={label} title={label} disabled={disabled}
        onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen((o) => !o); if (!open && onOpen) onOpen(); }}>
        {trigger}
      </button>
      {open && portal(
        <div ref={pop} className="pop" role="menu" style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
          onMouseDown={(e) => { if (!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) e.preventDefault(); }}>
          {typeof children === 'function' ? children(close) : children}
        </div>,
      )}
    </>
  );
}

export function MenuItem({ icon, children, onClick, hint, danger, active, disabled }) {
  return (
    <button type="button" className={'mi' + (danger ? ' danger' : '') + (active ? ' on' : '')} role="menuitem" disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="mi-ico">{icon ? <Icon name={icon} size={16} /> : active ? <Icon name="Check" size={16} /> : null}</span>
      <span className="mi-text">{children}</span>
      {hint && <span className="mi-hint">{hint}</span>}
    </button>
  );
}

export function Modal({ title, children, onClose, footer, width = 440, className }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return portal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={'modal ' + (className || '')} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button type="button" className="tb" aria-label="Close" onClick={onClose}><Icon name="X" size={18} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={400} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className={'btn ' + (danger ? 'danger' : 'primary')} autoFocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>
    }>
      <p className="muted-p">{message}</p>
    </Modal>
  );
}

export function PromptDialog({ title, label, initial = '', confirmLabel = 'Save', onSubmit, onClose, placeholder }) {
  const [v, setV] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, 30); return () => clearTimeout(t); }, []);
  const submit = (e) => { e && e.preventDefault(); if (!v.trim()) return; onSubmit(v.trim()); onClose(); };
  return (
    <Modal title={title} onClose={onClose} width={420} footer={
      <>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!v.trim()} onClick={submit}>{confirmLabel}</button>
      </>
    }>
      <form onSubmit={submit}>
        <label className="field">
          <span>{label}</span>
          <input id="prompt-input" ref={ref} dir="auto" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} maxLength={160} />
        </label>
      </form>
    </Modal>
  );
}

export function Toasts({ items, dismiss }) {
  return portal(
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + (t.kind || '')}>
          {t.kind === 'error' ? <Icon name="CircleAlert" size={16} /> : t.kind === 'busy' ? <span className="spin" /> : <Icon name="Check" size={16} />}
          <span>{t.text}</span>
          {t.kind !== 'busy' && <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="X" size={14} /></button>}
        </div>
      ))}
    </div>,
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(o.value)} title={o.title || o.label}>
          {o.icon ? <Icon name={o.icon} size={16} /> : null}{o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

// Bottom sheet for phones. Stays mounted briefly so it can animate out.
export function Sheet({ open, onClose, title, children, className, actions }) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return undefined; }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setShown(false); setLeaving(false); setDrag(0); }, 200);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!shown) return null;
  const onStart = (e) => { start.current = e.touches ? e.touches[0].clientY : e.clientY; };
  const onMove = (e) => {
    if (start.current == null) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - start.current;
    setDrag(Math.max(0, y));
  };
  const onEnd = () => {
    if (start.current == null) return;
    start.current = null;
    if (drag > 80) onClose(); else setDrag(0);
  };
  return portal(
    <div className={'sheet-scrim' + (leaving ? ' out' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'bsheet ' + (className || '') + (leaving ? ' out' : '')} role="dialog" aria-modal="true" aria-label={title}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onMouseDown={(e) => { if (!/INPUT|TEXTAREA|SELECT|LABEL/.test(e.target.tagName)) e.preventDefault(); }}>
        <div className="bs-grab" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
          <span className="bs-handle" />
          <div className="bs-head">
            <h2>{title}</h2>
            <div className="bs-actions">
              {actions}
              <button type="button" className="tb" aria-label="Close" onClick={onClose}><Icon name="X" size={20} /></button>
            </div>
          </div>
        </div>
        <div className="bs-body">{children}</div>
      </div>
    </div>,
  );
}
