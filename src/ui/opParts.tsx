// Общие элементы графических панелей: кольца, полоски, выбор количества, звёзды опыта.
import { genFactor } from '../core/balance';
import type { Intel } from '../core/intel';
import { Slider } from './common';
import { Icon, type IconName } from './icons';

export type Tone = 'pos' | 'warn' | 'neg' | 'muted';

export function Box({ icon, title, right, children, className }: { icon: IconName; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={'op-box ' + (className ?? '')}>
      <header className="op-box-head">
        <span className="op-box-title">
          <Icon name={icon} size={17} /> {title}
        </span>
        {right && <span className="op-box-right">{right}</span>}
      </header>
      {children}
    </section>
  );
}

/** Полоска с заливкой (0..1) и, по желанию, «призрачной» частью — прогнозом. */
export function Meter({ value, ghost, tone }: { value: number; ghost?: number; tone: Tone }) {
  const v = Math.max(0, Math.min(1, value));
  const g = Math.max(v, Math.min(1, ghost ?? v));
  return (
    <div className="op-meter">
      {g > v && <div className={'op-meter-ghost ' + tone} style={{ width: g * 100 + '%' }} />}
      <div className={'op-meter-fill ' + tone} style={{ width: v * 100 + '%' }} />
    </div>
  );
}

/** Кнопки 25% / 50% / 100% от максимума и ползунок для точного числа. */
export function Amount({ max, value, onChange, action }: { max: number; value: number; onChange: (v: number) => void; action?: React.ReactNode }) {
  const v = Math.max(0, Math.min(max, value));
  const step = max >= 20000 ? 1000 : 100;
  const at = (f: number) => (f === 1 ? max : Math.floor((max * f) / step) * step);
  return (
    <div className="op-amount">
      <div className="op-pcts">
        {[0.25, 0.5, 1].map((f) => (
          <button key={f} className={'op-pct ' + (v > 0 && v === at(f) ? 'on' : '')} onClick={() => onChange(at(f))} disabled={max <= 0}>
            {f * 100}%
          </button>
        ))}
      </div>
      <div className="op-amount-slider">
        <Slider value={v} min={0} max={Math.max(1, max)} step={step} onChange={onChange} />
      </div>
      {action && <div className="op-amount-action">{action}</div>}
    </div>
  );
}

/** Сила соседа: сравниваем его армию (по донесению разведки) с нашей. */
export function strengthWord(it: Intel, ours: number): { text: string; tone: Tone } {
  if (!it.known) return { text: 'неизвестно', tone: 'muted' };
  const r = it.soldiers / Math.max(1, ours);
  if (r < 0.75) return { text: 'слабее', tone: 'pos' };
  if (r <= 1.33) return { text: 'как мы', tone: 'warn' };
  return { text: 'сильнее', tone: 'neg' };
}

export function chanceWord(p: number): { text: string; tone: 'pos' | 'warn' | 'neg' } {
  if (p >= 0.7) return { text: 'высокий', tone: 'pos' };
  if (p >= 0.4) return { text: 'средний', tone: 'warn' };
  return { text: 'низкий', tone: 'neg' };
}

/** Опыт генерала звёздами (0–5). */
export function stars(exp: number): number {
  return Math.max(0, Math.min(5, Math.round(((genFactor(exp) - 0.55) / 2.2) * 5)));
}

export function Stars({ exp }: { exp: number }) {
  const n = stars(exp);
  return (
    <span className="op-stars" title={`опыт ${Math.round(exp)}`}>
      {'★'.repeat(n)}
      <span className="dim">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** Круговой индикатор (0..1) с иконкой в центре; «призрак» — прогноз на этот год. */
export function Ring({ value, ghost, tone, size = 44, children, title }: { value: number; ghost?: number; tone: Tone | 'gold'; size?: number; children: React.ReactNode; title?: string }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const g = Math.max(v, Math.min(1, ghost ?? v));
  const arc = (f: number) => `${(c * f).toFixed(1)} ${c.toFixed(1)}`;
  return (
    <span className={'op-ring ' + tone} style={{ width: size, height: size }} title={title}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="op-ring-track" cx={size / 2} cy={size / 2} r={r} />
        {g > v && <circle className="op-ring-ghost" cx={size / 2} cy={size / 2} r={r} strokeDasharray={arc(g)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        {v > 0 && <circle className="op-ring-fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={arc(v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      </svg>
      <span className="op-ring-in">{children}</span>
    </span>
  );
}

