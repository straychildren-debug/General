// Гексагональная сетка «pointy-top», нечётные ряды сдвинуты вправо (odd-r).
// Порядок направлений: В, З, СВ, СЗ, ЮВ, ЮЗ.
export const DIR_E = 0;
export const DIR_W = 1;
export const DIR_NE = 2;
export const DIR_NW = 3;
export const DIR_SE = 4;
export const DIR_SW = 5;

const EVEN: [number, number][] = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
const ODD: [number, number][] = [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

const cache = new Map<string, Int32Array>();

/** Таблица соседей: t[i*6 + d] — индекс соседа или -1. */
export function neighborTable(w: number, h: number): Int32Array {
  const key = w + 'x' + h;
  const cached = cache.get(key);
  if (cached) return cached;
  const t = new Int32Array(w * h * 6).fill(-1);
  for (let r = 0; r < h; r++) {
    const dirs = r & 1 ? ODD : EVEN;
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      for (let d = 0; d < 6; d++) {
        const nc = c + dirs[d][0];
        const nr = r + dirs[d][1];
        if (nc >= 0 && nc < w && nr >= 0 && nr < h) t[i * 6 + d] = nr * w + nc;
      }
    }
  }
  cache.set(key, t);
  return t;
}

export const ROW_H = Math.sqrt(3) / 2;

/** Центр клетки в единицах, где расстояние между соседями по горизонтали = 1. */
export function cellX(i: number, w: number): number {
  const r = (i / w) | 0;
  return i - r * w + 0.5 * (r & 1) + 0.5;
}

export function cellY(i: number, w: number): number {
  return ((i / w) | 0) * ROW_H + 0.5774;
}

/** Радиус гекса (центр–вершина) в тех же единицах. */
export const HEX_R = 1 / Math.sqrt(3);

/** Вершины: k=0 — правая верхняя (-30°), далее по часовой стрелке. */
export const CORNERS: [number, number][] = Array.from({ length: 6 }, (_, k) => {
  const a = ((60 * k - 30) * Math.PI) / 180;
  return [HEX_R * Math.cos(a), HEX_R * Math.sin(a)];
});

/** Для каждого направления — пара вершин общей стороны. */
export const EDGE_CORNERS: [number, number][] = [
  [0, 1], // В
  [3, 4], // З
  [5, 0], // СВ
  [4, 5], // СЗ
  [1, 2], // ЮВ
  [2, 3], // ЮЗ
];
