import { useEffect, useRef, useState, type ReactNode } from 'react';
import { themes, codeThemes, type Theme } from '@md2/core';

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const ICONS = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  github: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
  check: <path d="m5 12 5 5L20 7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
};

export function Button({
  children, onClick, variant = 'ghost', icon, title, disabled, href,
}: {
  children?: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'soft'; icon?: keyof typeof ICONS;
  title?: string; disabled?: boolean; href?: string;
}) {
  const cls = `btn btn-${variant}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={15} />}
      {children && <span>{children}</span>}
    </>
  );
  if (href)
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer" title={title}>
        {inner}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick} title={title} disabled={disabled}>
      {inner}
    </button>
  );
}

export function Select<T extends string | number>({
  label, value, options, onChange,
}: {
  label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <span className="select">
        <select
          value={String(value)}
          onChange={(e) => {
            const opt = options.find((o) => String(o.value) === e.target.value);
            if (opt) onChange(opt.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={14} />
      </span>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span>{label}</span>
    </label>
  );
}

export function ColorField({ label, value, fallback, onChange }: { label?: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const current = value || fallback;
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <span className="color">
        <input type="color" value={current} onChange={(e) => onChange(e.target.value)} />
        <span className="color-hex">{current}</span>
        {value && (
          <button type="button" className="icon-btn" title="恢复主题默认色" onClick={(e) => (e.preventDefault(), onChange(''))}>
            <Icon name="reset" size={13} />
          </button>
        )}
      </span>
    </label>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [ref, onOutside, active]);
}

/** Theme gallery popover: swatch + name + description for each article theme. */
export function ThemePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false), open);
  const cur = themes.find((t) => t.id === value) ?? themes[0];
  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Swatch theme={cur} />
        <span className="picker-name">{cur.name}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="popover theme-grid" role="listbox">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === value}
              className={`theme-card${t.id === value ? ' is-active' : ''}`}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <ThemeThumb theme={t} />
              <span className="theme-card-name">
                {t.name}
                <em>{t.nameEn !== t.name ? t.nameEn : ''}</em>
              </span>
              <span className="theme-card-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Swatch({ theme }: { theme: Theme }) {
  return <span className="swatch" style={{ background: theme.primary }} />;
}

/** A tiny abstract preview of a theme: heading bar, text lines, code block. */
function ThemeThumb({ theme }: { theme: Theme }) {
  const code = codeThemes.find((c) => c.id === theme.codeTheme)!;
  const dark = theme.id === 'midnight';
  return (
    <span className="theme-thumb" style={{ background: dark ? '#13141c' : '#fff' }}>
      <span className="tt-h" style={{ background: theme.primary }} />
      <span className="tt-l" style={{ background: dark ? '#3a3f5c' : '#e6e6e6' }} />
      <span className="tt-l short" style={{ background: dark ? '#3a3f5c' : '#e6e6e6' }} />
      <span className="tt-code" style={{ background: code.bg, borderColor: dark ? '#2a2e45' : 'rgba(0,0,0,.06)' }}>
        <i style={{ background: theme.primary }} />
        <i style={{ background: code.text, opacity: 0.5 }} />
      </span>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// ───── toast ─────
type ToastFn = (msg: string, kind?: 'ok' | 'err') => void;
let pushToast: ToastFn = () => {};
export const toast: ToastFn = (m, k) => pushToast(m, k);

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([]);
  useEffect(() => {
    pushToast = (msg, kind = 'ok') => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l, { id, msg, kind }]);
      setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 2600);
    };
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast toast-${i.kind}`}>
          <Icon name={i.kind === 'ok' ? 'check' : 'alert'} size={15} />
          {i.msg}
        </div>
      ))}
    </div>
  );
}

export function Warnings({ items }: { items: { message: string }[] }) {
  if (!items.length) return null;
  const uniq = Array.from(new Set(items.map((i) => i.message)));
  return (
    <div className="warnings">
      {uniq.slice(0, 4).map((m) => (
        <div key={m} className="warning">
          <Icon name="alert" size={14} /> {m}
        </div>
      ))}
    </div>
  );
}
