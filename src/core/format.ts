const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function fmt(n: number): string {
  return nf.format(Math.round(n));
}

export function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + ' млрд';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace('.', ',') + ' млн';
  if (a >= 1e4) return (n / 1e3).toFixed(0) + ' тыс.';
  return fmt(n);
}

export function fmtSigned(n: number): string {
  return (n >= 0 ? '+' : '−') + fmtShort(Math.abs(n));
}

export function pct(x: number, digits = 0): string {
  return (x * 100).toFixed(digits).replace('.', ',') + '%';
}

/** «1 год», «2 года», «5 лет» */
export function years(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return n + ' лет';
  if (b === 1) return n + ' год';
  if (b >= 2 && b <= 4) return n + ' года';
  return n + ' лет';
}
