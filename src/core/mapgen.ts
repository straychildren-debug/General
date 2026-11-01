import { Rng } from './rng';
import { cellX, cellY, neighborTable } from './hex';
import { TER_FOREST, TER_HILLS, TER_MOUNT, TER_PLAINS, TER_WATER } from './types';

type Noise = (x: number, y: number) => number;

function valueNoise(rng: Rng, w: number, h: number, scale: number): Noise {
  const gw = Math.ceil(w / scale) + 3;
  const gh = Math.ceil(h / scale) + 3;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return (x, y) => {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * gw + x0];
    const b = g[y0 * gw + x0 + 1];
    const c = g[(y0 + 1) * gw + x0];
    const d = g[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(rng: Rng, w: number, h: number, scale: number, octaves: number): Noise {
  const layers: [Noise, number][] = [];
  let s = scale;
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push([valueNoise(rng, w, h, Math.max(1.5, s)), amp]);
    total += amp;
    s /= 2;
    amp *= 0.5;
  }
  return (x, y) => {
    let v = 0;
    for (const [f, a] of layers) v += f(x, y) * a;
    return v / total;
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

class Heap {
  k: number[] = [];
  v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

export interface GeneratedMap {
  w: number;
  h: number;
  terrain: number[];
  owner: number[];
  capitals: number[];
  landCells: number;
}

export function generateMap(rng: Rng, n: number, cpc: number): GeneratedMap {
  const landTarget = n * cpc;
  const total = landTarget / 0.72;
  const h = Math.max(20, Math.round(Math.sqrt(total / 1.55)));
  const w = Math.max(30, Math.round(total / h));
  const N = w * h;
  const nb = neighborTable(w, h);

  const elevN = fbm(rng, w + 4, h + 4, 16, 4);
  const moistN = fbm(rng, w + 4, h + 4, 10, 3);
  const roughN = fbm(rng, w + 4, h + 4, 5, 2);

  const elev = new Float32Array(N);
  const moist = new Float32Array(N);
  const rough = new Float32Array(N);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = cellX(i, w);
    const y = cellY(i, w);
    px[i] = x;
    py[i] = y;
    const nx = (x / (w + 0.5)) * 2 - 1;
    const ny = (y / (h * 0.866)) * 2 - 1;
    const d = Math.max(Math.abs(nx), Math.abs(ny));
    elev[i] = elevN(x, y) - smoothstep(0.55, 1.0, d) * 0.55;
    moist[i] = moistN(x, y);
    rough[i] = roughN(x, y);
  }

  // Вода: нижние 28% высот
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const thr = sorted[Math.floor(N * 0.28)];
  const terrain: number[] = new Array(N).fill(TER_WATER);
  for (let i = 0; i < N; i++) if (elev[i] > thr) terrain[i] = TER_PLAINS;

  // Оставляем только самый большой связный материк
  const comp = new Int32Array(N).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  let compId = 0;
  for (let i = 0; i < N; i++) {
    if (terrain[i] === TER_WATER || comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = compId;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (let d = 0; d < 6; d++) {
        const j = nb[c * 6 + d];
        if (j >= 0 && terrain[j] !== TER_WATER && comp[j] < 0) {
          comp[j] = compId;
          stack.push(j);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = compId;
    }
    compId++;
  }
  for (let i = 0; i < N; i++) if (terrain[i] !== TER_WATER && comp[i] !== bestComp) terrain[i] = TER_WATER;

  const land: number[] = [];
  for (let i = 0; i < N; i++) if (terrain[i] !== TER_WATER) land.push(i);

  // Рельеф по квантилям, чтобы доли были стабильными
  const byElev = [...land].sort((a, b) => elev[b] - elev[a]);
  const nMount = Math.floor(land.length * 0.07);
  const nHills = Math.floor(land.length * 0.13);
  for (let k = 0; k < byElev.length; k++) {
    if (k < nMount) terrain[byElev[k]] = TER_MOUNT;
    else if (k < nMount + nHills) terrain[byElev[k]] = TER_HILLS;
  }
  const lowland = land.filter((i) => terrain[i] === TER_PLAINS).sort((a, b) => moist[b] - moist[a]);
  const nForest = Math.floor(lowland.length * 0.32);
  for (let k = 0; k < nForest; k++) terrain[lowland[k]] = TER_FOREST;

  // Нарезка на страны равной площади
  let best: { owner: Int16Array; deficit: number; targets: number[] } | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = partition(rng, n, land, terrain, nb, px, py, rough, N);
    if (!best || res.deficit < best.deficit) best = res;
    if (res.deficit === 0) break;
  }
  const owner = best!.owner;
  if (best!.deficit > 0) rebalance(rng, owner, best!.targets, land, nb, n);
  smoothBorders(rng, owner, land, nb);

  // Столица — клетка, ближайшая к центру масс страны
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const cnt = new Float64Array(n);
  for (const i of land) {
    const o = owner[i];
    sx[o] += px[i];
    sy[o] += py[i];
    cnt[o]++;
  }
  const capitals = new Array(n).fill(-1);
  const capD = new Array(n).fill(Infinity);
  for (const i of land) {
    const o = owner[i];
    const dx = px[i] - sx[o] / cnt[o];
    const dy = py[i] - sy[o] / cnt[o];
    const d = dx * dx + dy * dy;
    if (d < capD[o]) {
      capD[o] = d;
      capitals[o] = i;
    }
  }

  return { w, h, terrain, owner: Array.from(owner), capitals, landCells: land.length };
}

function partition(
  rng: Rng,
  n: number,
  land: number[],
  terrain: number[],
  nb: Int32Array,
  px: Float32Array,
  py: Float32Array,
  rough: Float32Array,
  N: number,
): { owner: Int16Array; deficit: number; targets: number[] } {
  const L = land.length;
  const base = Math.floor(L / n);
  const targets = new Array(n).fill(base);
  const extra = rng.shuffle([...Array(n).keys()]).slice(0, L - base * n);
  for (const k of extra) targets[k]++;

  // Столицы: «лучший кандидат» — подальше друг от друга
  const seeds: number[] = [rng.pick(land)];
  while (seeds.length < n) {
    let bestCell = -1;
    let bestD = -1;
    for (let t = 0; t < 30; t++) {
      const c = rng.pick(land);
      if (terrain[c] === TER_MOUNT) continue;
      let m = Infinity;
      for (const s of seeds) {
        const dx = px[c] - px[s];
        const dy = py[c] - py[s];
        m = Math.min(m, dx * dx + dy * dy);
      }
      if (m > bestD) {
        bestD = m;
        bestCell = c;
      }
    }
    if (bestCell >= 0) seeds.push(bestCell);
  }

  const owner = new Int16Array(N).fill(-1);
  const size = new Array(n).fill(0);
  const active = new Array(n).fill(true);
  const heaps = Array.from({ length: n }, () => new Heap());

  const pushNeighbors = (k: number, cell: number) => {
    const s = seeds[k];
    for (let d = 0; d < 6; d++) {
      const j = nb[cell * 6 + d];
      if (j < 0 || terrain[j] === TER_WATER || owner[j] !== -1) continue;
      const dx = px[j] - px[s];
      const dy = py[j] - py[s];
      let cost = Math.sqrt(dx * dx + dy * dy) * (0.6 + rough[j] * 0.8);
      if (terrain[j] === TER_MOUNT) cost *= 1.35;
      cost += rng.next() * 0.15;
      heaps[k].push(cost, j);
    }
  };

  for (let k = 0; k < n; k++) {
    owner[seeds[k]] = k;
    size[k] = 1;
  }
  for (let k = 0; k < n; k++) pushNeighbors(k, seeds[k]);

  for (;;) {
    let pick = -1;
    let bestR = Infinity;
    for (let k = 0; k < n; k++) {
      if (!active[k] || size[k] >= targets[k]) continue;
      const r = size[k] / targets[k];
      if (r < bestR) {
        bestR = r;
        pick = k;
      }
    }
    if (pick < 0) break;
    const hp = heaps[pick];
    let cell = -1;
    while (hp.size) {
      const c = hp.pop();
      if (owner[c] === -1) {
        cell = c;
        break;
      }
    }
    if (cell < 0) {
      active[pick] = false;
      continue;
    }
    owner[cell] = pick;
    size[pick]++;
    pushNeighbors(pick, cell);
  }

  let deficit = 0;
  for (let k = 0; k < n; k++) deficit += targets[k] - size[k];
  return { owner, deficit, targets };
}

// Порядок соседей по кругу: В, ЮВ, ЮЗ, З, СЗ, СВ
const RING = [0, 4, 5, 1, 3, 2];

/** Можно ли отдать клетку, не разрезав страну (локальная проверка по кольцу соседей). */
function isSimple(owner: Int16Array, nb: Int32Array, cell: number, k: number): boolean {
  let runs = 0;
  let any = false;
  for (let r = 0; r < 6; r++) {
    const j = nb[cell * 6 + RING[r]];
    const prev = nb[cell * 6 + RING[(r + 5) % 6]];
    const cur = j >= 0 && owner[j] === k;
    const was = prev >= 0 && owner[prev] === k;
    if (cur) any = true;
    if (cur && !was) runs++;
  }
  return any && runs <= 1;
}

/**
 * Досчитывает равенство площадей: незанятая клетка отдаётся соседней стране,
 * а излишек передаётся по цепочке соседей до страны с недостачей.
 */
function rebalance(rng: Rng, owner: Int16Array, targets: number[], land: number[], nb: Int32Array, n: number): void {
  const size = new Array(n).fill(0);
  for (const i of land) if (owner[i] >= 0) size[owner[i]]++;

  for (let iter = 0; iter < land.length; iter++) {
    // Незанятая клетка рядом с чьей-то территорией
    let u = -1;
    let F = -1;
    for (const i of land) {
      if (owner[i] !== -1) continue;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j >= 0 && owner[j] >= 0) {
          u = i;
          F = owner[j];
          break;
        }
      }
      if (u >= 0) break;
    }
    if (u < 0) break;
    owner[u] = F;
    size[F]++;
    if (size[F] <= targets[F]) continue;

    // Граф «можно безопасно передать клетку A → B» и путь от F до страны с недостачей
    const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    for (const i of land) {
      const a = owner[i];
      if (a < 0) continue;
      let simple: boolean | null = null;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j < 0 || owner[j] < 0 || owner[j] === a || adj[a].has(owner[j])) continue;
        if (simple === null) simple = isSimple(owner, nb, i, a);
        if (simple) adj[a].add(owner[j]);
      }
    }
    const prev = new Array(n).fill(-2);
    prev[F] = -1;
    const queue = [F];
    let D = -1;
    for (let qi = 0; qi < queue.length; qi++) {
      const a = queue[qi];
      if (size[a] < targets[a]) {
        D = a;
        break;
      }
      for (const b of adj[a]) {
        if (prev[b] === -2) {
          prev[b] = a;
          queue.push(b);
        }
      }
    }
    if (D < 0) continue;
    const path: number[] = [];
    for (let x = D; x !== -1; x = prev[x]) path.push(x);
    path.reverse(); // F → ... → D
    for (let p = 0; p + 1 < path.length; p++) {
      const A = path[p];
      const Bc = path[p + 1];
      const cand: number[] = [];
      for (const i of land) {
        if (owner[i] !== A) continue;
        let touches = false;
        for (let d = 0; d < 6; d++) {
          const j = nb[i * 6 + d];
          if (j >= 0 && owner[j] === Bc) {
            touches = true;
            break;
          }
        }
        if (!touches) continue;
        if (isSimple(owner, nb, i, A)) cand.push(i);
      }
      if (!cand.length) break;
      const cell = rng.pick(cand);
      owner[cell] = Bc;
      size[A]--;
      size[Bc]++;
    }
  }
}

/**
 * Сглаживание границ без изменения площадей: клетки меняются парами между двумя странами.
 * Отдаётся клетка, почти окружённая соседом (выступ), взамен на такую же у соседа.
 */
function smoothBorders(rng: Rng, owner: Int16Array, land: number[], nb: Int32Array): void {
  const count = new Map<number, number>();
  for (let round = 0; round < 12; round++) {
    const need = round < 6 ? 4 : 3;
    const give = new Map<number, number[]>(); // A*1024+B → клетки A, которые лучше отдать B
    for (const i of land) {
      const A = owner[i];
      if (A < 0) continue;
      count.clear();
      let own = 0;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j < 0 || owner[j] < 0) continue;
        if (owner[j] === A) own++;
        else count.set(owner[j], (count.get(owner[j]) ?? 0) + 1);
      }
      let B = -1;
      let bc = 0;
      for (const [k, v] of count) if (v > bc) [B, bc] = [k, v];
      if (B >= 0 && bc >= need && own <= 6 - need) {
        const key = A * 1024 + B;
        const arr = give.get(key);
        if (arr) arr.push(i);
        else give.set(key, [i]);
      }
    }
    let swapped = 0;
    for (const [key, fromA] of give) {
      const A = Math.floor(key / 1024);
      const B = key % 1024;
      if (A > B) continue;
      const fromB = give.get(B * 1024 + A);
      if (!fromB) continue;
      rng.shuffle(fromA);
      rng.shuffle(fromB);
      let ia = 0;
      let ib = 0;
      while (ia < fromA.length && ib < fromB.length) {
        const a = fromA[ia];
        const b = fromB[ib];
        if (owner[a] !== A || !isSimple(owner, nb, a, A)) {
          ia++;
          continue;
        }
        if (owner[b] !== B || !isSimple(owner, nb, b, B)) {
          ib++;
          continue;
        }
        owner[a] = B;
        owner[b] = A;
        swapped++;
        ia++;
        ib++;
      }
    }
    if (!swapped && round >= 6) break;
  }
}
