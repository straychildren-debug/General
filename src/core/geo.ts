import { TERRAIN_INFO } from './balance';
import { neighborTable } from './hex';
import type { GameState, MapState } from './types';

export interface BorderInfo {
  count: number; // клетки защитника, граничащие с атакующим
  defSum: number;
}

export interface Geo {
  cells: number[];
  sumCap: number[];
  sumFert: number[];
  /** ключ attacker*1024+defender → клетки защитника на границе с атакующим */
  border: Map<number, BorderInfo>;
  neighbors: number[][];
  /** клетки страны, граничащие с любой другой страной (вся сухопутная граница) */
  frontier: number[];
}

export const bkey = (attacker: number, defender: number) => attacker * 1024 + defender;

export function computeGeo(state: GameState): Geo {
  return computeGeoFor(state.map, state.countries.length);
}

export function computeGeoFor(map: MapState, n: number, owner: number[] = map.owner): Geo {
  const { w, h, terrain } = map;
  const nb = neighborTable(w, h);
  const cells = new Array(n).fill(0);
  const sumCap = new Array(n).fill(0);
  const sumFert = new Array(n).fill(0);
  const border = new Map<number, BorderInfo>();
  const frontier = new Array(n).fill(0);
  const seen: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const o = owner[i];
    if (o < 0) continue;
    const t = TERRAIN_INFO[terrain[i]];
    cells[o]++;
    sumCap[o] += t.cap;
    sumFert[o] += t.fert;
    seen.length = 0;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j < 0) continue;
      const p = owner[j];
      if (p < 0 || p === o || seen.includes(p)) continue;
      seen.push(p);
      const k = bkey(p, o);
      const b = border.get(k);
      if (b) {
        b.count++;
        b.defSum += t.def;
      } else border.set(k, { count: 1, defSum: t.def });
    }
    if (seen.length) frontier[o]++;
  }
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  for (const k of border.keys()) {
    const a = Math.floor(k / 1024);
    const b = k % 1024;
    neighbors[b].push(a);
  }
  for (const l of neighbors) l.sort((x, y) => x - y);
  return { cells, sumCap, sumFert, border, neighbors, frontier };
}

/** Средняя оборона местности на клетках защитника, обращённых к атакующему. */
export function borderDefense(geo: Geo, attacker: number, defender: number): number {
  const b = geo.border.get(bkey(attacker, defender));
  return b && b.count > 0 ? b.defSum / b.count : 1;
}

export function areNeighbors(geo: Geo, a: number, b: number): boolean {
  return geo.border.has(bkey(a, b));
}

/**
 * Армия растянута по всей границе: против конкретного соседа обороняется лишь часть гарнизона.
 * Если сосед один — вся армия; при многих соседях — около половины.
 */
export function frontFactor(borderWithAttacker: number, frontier: number): number {
  const share = frontier > 0 ? Math.min(1, borderWithAttacker / frontier) : 1;
  return 0.5 + 0.5 * share;
}

export function frontFactorGeo(geo: Geo, attacker: number, defender: number): number {
  const b = geo.border.get(bkey(attacker, defender));
  return frontFactor(b ? b.count : 0, geo.frontier[defender]);
}