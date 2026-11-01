import { cellX, cellY, CORNERS, EDGE_CORNERS, neighborTable, ROW_H } from '../core/hex';
import { TER_FOREST, TER_HILLS, TER_MOUNT, TER_PLAINS, TER_WATER, type GameState, type MapState } from '../core/types';

/** Пикселей карты на единицу сетки (расстояние между центрами соседних гексов). */
export const HEX = 14;

export function px(i: number, w: number): [number, number] {
  return [cellX(i, w) * HEX, cellY(i, w) * HEX];
}

function hexPath(p: Path2D, i: number, w: number): void {
  const [x, y] = px(i, w);
  p.moveTo(x + CORNERS[0][0] * HEX, y + CORNERS[0][1] * HEX);
  for (let k = 1; k < 6; k++) p.lineTo(x + CORNERS[k][0] * HEX, y + CORNERS[k][1] * HEX);
  p.closePath();
}

export function mapPixelSize(map: MapState): { width: number; height: number } {
  return { width: (map.w + 1) * HEX, height: ((map.h - 1) * ROW_H + 1.16) * HEX };
}

export function countryFills(map: MapState, owner: number[], n: number): Path2D[] {
  const paths = Array.from({ length: n }, () => new Path2D());
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) hexPath(paths[owner[i]], i, map.w);
  return paths;
}

export interface TerrainGeom {
  land: Path2D;
  byType: Record<number, Path2D>;
  glyphMount: Path2D;
  glyphHills: Path2D;
  glyphForest: Path2D;
}

export function terrainGeom(map: MapState): TerrainGeom {
  const land = new Path2D();
  const byType: Record<number, Path2D> = {
    [TER_PLAINS]: new Path2D(),
    [TER_FOREST]: new Path2D(),
    [TER_HILLS]: new Path2D(),
    [TER_MOUNT]: new Path2D(),
  };
  const glyphMount = new Path2D();
  const glyphHills = new Path2D();
  const glyphForest = new Path2D();
  const H = HEX;
  for (let i = 0; i < map.terrain.length; i++) {
    const t = map.terrain[i];
    if (t === TER_WATER) continue;
    hexPath(land, i, map.w);
    hexPath(byType[t], i, map.w);
    const [x, y] = px(i, map.w);
    if (t === TER_MOUNT) {
      glyphMount.moveTo(x - 0.3 * H, y + 0.2 * H);
      glyphMount.lineTo(x - 0.02 * H, y - 0.24 * H);
      glyphMount.lineTo(x + 0.3 * H, y + 0.2 * H);
    } else if (t === TER_HILLS) {
      glyphHills.moveTo(x - 0.26 * H, y + 0.12 * H);
      glyphHills.quadraticCurveTo(x, y - 0.22 * H, x + 0.26 * H, y + 0.12 * H);
    } else if (t === TER_FOREST) {
      glyphForest.moveTo(x + 0.11 * H, y);
      glyphForest.arc(x, y, 0.11 * H, 0, Math.PI * 2);
    }
  }
  return { land, byType, glyphMount, glyphHills, glyphForest };
}

export function borderPaths(map: MapState, owner: number[]): { borders: Path2D; coast: Path2D } {
  const nb = neighborTable(map.w, map.h);
  const borders = new Path2D();
  const coast = new Path2D();
  for (let i = 0; i < owner.length; i++) {
    if (map.terrain[i] === TER_WATER) continue;
    const [x, y] = px(i, map.w);
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      const [c0, c1] = EDGE_CORNERS[d];
      let target: Path2D | null = null;
      if (j < 0 || map.terrain[j] === TER_WATER) target = coast;
      else if (owner[j] !== owner[i] && j > i) target = borders;
      if (!target) continue;
      target.moveTo(x + CORNERS[c0][0] * HEX, y + CORNERS[c0][1] * HEX);
      target.lineTo(x + CORNERS[c1][0] * HEX, y + CORNERS[c1][1] * HEX);
    }
  }
  return { borders, coast };
}

export function outlinePath(map: MapState, owner: number[], id: number): Path2D {
  const nb = neighborTable(map.w, map.h);
  const p = new Path2D();
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== id) continue;
    const [x, y] = px(i, map.w);
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && owner[j] === id) continue;
      const [c0, c1] = EDGE_CORNERS[d];
      p.moveTo(x + CORNERS[c0][0] * HEX, y + CORNERS[c0][1] * HEX);
      p.lineTo(x + CORNERS[c1][0] * HEX, y + CORNERS[c1][1] * HEX);
    }
  }
  return p;
}

export interface Label {
  x: number;
  y: number;
  r: number;
}

/** Точка подписи — клетка, самая удалённая от границ страны. */
export function labelInfo(map: MapState, owner: number[], n: number): (Label | null)[] {
  const nb = neighborTable(map.w, map.h);
  const N = owner.length;
  const dist = new Int32Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (owner[i] < 0) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j < 0 || owner[j] !== owner[i]) {
        dist[i] = 0;
        queue.push(i);
        break;
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (let d = 0; d < 6; d++) {
      const j = nb[c * 6 + d];
      if (j >= 0 && owner[j] === owner[c] && dist[j] < 0) {
        dist[j] = dist[c] + 1;
        queue.push(j);
      }
    }
  }
  const best: (Label | null)[] = Array(n).fill(null);
  const bestD = new Array(n).fill(-1);
  for (let i = 0; i < N; i++) {
    const o = owner[i];
    if (o < 0) continue;
    if (dist[i] > bestD[o]) {
      bestD[o] = dist[i];
      const [x, y] = px(i, map.w);
      best[o] = { x, y, r: dist[i] + 1 };
    }
  }
  return best;
}

export function centroids(map: MapState, owner: number[], n: number): ([number, number] | null)[] {
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const cnt = new Float64Array(n);
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i];
    if (o < 0) continue;
    const [x, y] = px(i, map.w);
    sx[o] += x;
    sy[o] += y;
    cnt[o]++;
  }
  return Array.from({ length: n }, (_, o) => (cnt[o] ? [sx[o] / cnt[o], sy[o] / cnt[o]] : null));
}

/** Середина участка границы: клетки страны a, соприкасающиеся со страной b. */
export function borderMid(map: MapState, owner: number[], a: number, b: number): [number, number] | null {
  const nb = neighborTable(map.w, map.h);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== a) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && owner[j] === b) {
        const [x, y] = px(i, map.w);
        sx += x;
        sy += y;
        n++;
        break;
      }
    }
  }
  return n ? [sx / n, sy / n] : null;
}

/** Стрелка через границу из a в b. */
export function attackArrow(
  map: MapState,
  owner: number[],
  cents: ([number, number] | null)[],
  a: number,
  b: number,
): [[number, number], [number, number]] | null {
  const ma = borderMid(map, owner, a, b);
  const mb = borderMid(map, owner, b, a);
  const ca = cents[a];
  const cb = cents[b];
  if (!ma || !mb) {
    if (!ca || !cb) return null;
    return [ca, cb];
  }
  const mx = (ma[0] + mb[0]) / 2;
  const my = (ma[1] + mb[1]) / 2;
  let dx = (cb ? cb[0] : mb[0]) - (ca ? ca[0] : ma[0]);
  let dy = (cb ? cb[1] : mb[1]) - (ca ? ca[1] : ma[1]);
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const L = HEX * 3;
  return [
    [mx - dx * L, my - dy * L],
    [mx + dx * L, my + dy * L],
  ];
}

/** Владельцы клеток на начало указанного года (для хроники). */
export function ownerAtYear(game: GameState, year: number): number[] {
  const o = game.chronicle.initialOwner.slice();
  for (const ch of game.chronicle.changes) {
    if (ch.year >= year) break;
    for (let k = 0; k < ch.cells.length; k++) o[ch.cells[k]] = ch.owners[k];
  }
  return o;
}

export function cellAtPoint(map: MapState, mx: number, my: number): number {
  const ux = mx / HEX;
  const uy = my / HEX;
  const r0 = Math.round((uy - 0.5774) / ROW_H);
  let best = -1;
  let bd = Infinity;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= map.h) continue;
    const c0 = Math.round(ux - 0.5 - 0.5 * (r & 1));
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (c < 0 || c >= map.w) continue;
      const i = r * map.w + c;
      const dx = cellX(i, map.w) - ux;
      const dy = cellY(i, map.w) - uy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return bd < 0.36 ? best : -1;
}
