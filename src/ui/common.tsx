import type { ReactNode } from 'react';
import type { Forecast } from '../core/econ';
import type { Geo } from '../core/geo';
import type { Country, GameState, Orders } from '../core/types';

export interface PanelProps {
  game: GameState;
  geo: Geo;
  me: Country;
  draft: Orders;
  setDraft: (f: (o: Orders) => Orders) => void;
  fc: Forecast;
  onSelect: (id: number | null) => void;
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'card ' + (className ?? '')}>
      {(title || right) && (
        <header className="card-head">
          <h3>{title}</h3>
          {right && <div className="card-right">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: 'pos' | 'neg' | 'muted' | 'warn'; hint?: string }) {
  return (
    <div className="row" title={hint}>
      <span className="row-label">{label}</span>
      <span className={'row-value ' + (tone ?? '')}>{value}</span>
    </div>
  );
}

export function Bar({ value, max, color, thin }: { value: number; max: number; color?: string; thin?: boolean }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={'bar' + (thin ? ' thin' : '')}>
      <div className="bar-fill" style={{ width: p * 100 + '%', background: color }} />
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      className="slider"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--p' as string]: max > min ? ((value - min) / (max - min)) * 100 + '%' : '0%' }}
    />
  );
}

export function NumInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  width = 110,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
}) {
  return (
    <input
      type="number"
      className="num"
      style={{ width }}
      value={Math.round(value)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        let v = Number(e.target.value);
        if (!Number.isFinite(v)) v = 0;
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onChange(v);
      }}
    />
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} />;
}

export function happyColor(h: number): string {
  if (h >= 60) return 'var(--good)';
  if (h >= 40) return 'var(--warn)';
  return 'var(--bad)';
}

export function Spark({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="spark">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  );
}
