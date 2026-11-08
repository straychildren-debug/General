const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function fmt(n: number): string {
  return nf.format(Math.round(n));
}

const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/**
 * Крупные числа в игре — в тысячах, без подписи «тыс.»:
 * 474 000 → «474», 15 300 → «15,3», 2 785 → «2,8», 3 960 000 → «3 960».
 */
export function fmtShort(n: number): string {
  const k = n / 1000;
  const a = Math.abs(k);
  if (a >= 100) return nf.format(Math.round(k));
  if (a >= 1) return nf1.format(k);
  if (a === 0) return '0';
  return nf2.format(k) === '0' ? (k > 0 ? '<0,01' : '0') : nf2.format(k);
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
