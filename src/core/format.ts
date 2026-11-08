const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function fmt(n: number): string {
  return nf.format(Math.round(n));
}

/**
 * Крупные числа в игре — в тысячах, без подписи «тыс.» и без дробей:
 * 474 000 → «474», 15 300 → «15», 3 960 000 → «3 960», 300 → «<1».
 */
export function fmtShort(n: number): string {
  const k = Math.round(n / 1000);
  if (k === 0) return n === 0 ? '0' : n > 0 ? '<1' : '>−1';
  return nf.format(k);
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
