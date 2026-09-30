import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <span>{title}</span>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="row" title={hint}>
      <span className="row-label">{label}</span>
      <span className="row-ctl">{children}</span>
    </label>
  );
}

/** Number input that commits on blur/enter and supports ↑/↓ (shift ×10) + drag-scrub on the label. */
export function Num({
  value,
  onChange,
  step = 1,
  min,
  max,
  digits = 2,
  suffix,
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  suffix?: string;
  width?: number;
}) {
  const [text, setText] = useState(fmt(value, digits));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value, digits));
  }, [value, digits]);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (s: string) => {
    const v = Number(s);
    if (Number.isFinite(v)) onChange(clampV(v));
    else setText(fmt(value, digits));
  };
  return (
    <span className={`num ${suffix ? 'has-suffix' : ''}`} style={width ? { width } : undefined}>
      <input
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = clampV(Number((value + d).toFixed(6)));
            onChange(v);
            setText(fmt(v, digits));
          }
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

const fmt = (v: number, d: number) => (Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));

export function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
      <span />
    </button>
  );
}

export function Btn({
  children,
  onClick,
  kind = 'default',
  disabled,
  title,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  small?: boolean;
}) {
  return (
    <button type="button" className={`btn ${kind} ${small ? 'small' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return <input className="slider" type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}
