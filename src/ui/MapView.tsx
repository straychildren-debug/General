import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TERRAIN_INFO } from '../core/balance';
import { TER_FOREST, TER_HILLS, TER_MOUNT, TER_PLAINS, type GameState } from '../core/types';
import {
  borderPaths,
  cellAtPoint,
  countryFills,
  HEX,
  labelInfo,
  mapPixelSize,
  outlinePath,
  px,
  terrainGeom,
} from './mapGeometry';

export interface Arrow {
  from: [number, number];
  to: [number, number];
  color: string;
  width: number;
  dashed?: boolean;
}

interface Props {
  game: GameState;
  owner: number[];
  myId: number | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
  arrows: Arrow[];
  mode: 'political' | 'terrain';
}

const TERRAIN_COLORS: Record<number, string> = {
  [TER_PLAINS]: '#93a86c',
  [TER_FOREST]: '#557d4c',
  [TER_HILLS]: '#a99a6b',
  [TER_MOUNT]: '#8d8780',
};

export function MapView({ game, owner, myId, selected, onSelect, arrows, mode }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // touched — игрок сам двигал или масштабировал карту; до этого карта вписывается в окно при любом изменении размера
  const view = useRef({ k: 1, x: 0, y: 0, touched: false });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const [hover, setHover] = useState<{ sx: number; sy: number; cell: number } | null>(null);
  const n = game.countries.length;
  const map = game.map;

  const terrain = useMemo(() => terrainGeom(map), [map]);
  const geom = useMemo(
    () => ({ fills: countryFills(map, owner, n + 1), ...borderPaths(map, owner), labels: labelInfo(map, owner, n + 1) }),
    [map, owner, n],
  );
  const mine = useMemo(() => (myId != null ? outlinePath(map, owner, myId) : null), [map, owner, myId]);
  const fogPattern = useMemo(() => makeFogPattern(), []);
  const sel = useMemo(
    () => (selected != null && selected !== myId && owner.includes(selected) ? outlinePath(map, owner, selected) : null),
    [map, owner, selected, myId],
  );
  const capitals = useMemo(() => {
    // столица — текущая, если страна жива; для хроники берём точку подписи
    return game.countries.map((c) => (c.alive && owner[c.capital] === c.id ? px(c.capital, map.w) : null));
  }, [game.countries, owner, map.w]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = size.current;
    const v = view.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#13253a');
    bg.addColorStop(1, '#0a1520');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    const px1 = 1 / v.k; // один экранный пиксель в координатах карты

    // Мелководье вокруг суши
    ctx.strokeStyle = 'rgba(70, 120, 160, 0.18)';
    ctx.lineWidth = HEX * 0.9;
    ctx.lineJoin = 'round';
    ctx.stroke(terrain.land);

    if (mode === 'political') {
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = game.countries[c].color;
        ctx.fill(geom.fills[c]);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fill(terrain.byType[TER_HILLS]);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fill(terrain.byType[TER_MOUNT]);
      ctx.fillStyle = 'rgba(0,30,0,0.08)';
      ctx.fill(terrain.byType[TER_FOREST]);
    } else {
      for (const t of [TER_PLAINS, TER_FOREST, TER_HILLS, TER_MOUNT]) {
        ctx.fillStyle = TERRAIN_COLORS[t];
        ctx.fill(terrain.byType[t]);
      }
      ctx.globalAlpha = 0.28;
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = game.countries[c].color;
        ctx.fill(geom.fills[c]);
      }
      ctx.globalAlpha = 1;
    }

    if (v.k * HEX > 9) {
      ctx.lineWidth = Math.max(px1 * 1.1, HEX * 0.06);
      ctx.strokeStyle = 'rgba(20,20,20,0.35)';
      ctx.stroke(terrain.glyphMount);
      ctx.strokeStyle = 'rgba(20,20,20,0.22)';
      ctx.stroke(terrain.glyphHills);
      ctx.fillStyle = 'rgba(10,40,10,0.25)';
      ctx.fill(terrain.glyphForest);
    }

    // Туман: земли за пределами видимости закрыты полностью
    ctx.fillStyle = '#26303b';
    ctx.fill(geom.fills[n]);
    if (fogPattern) {
      ctx.save();
      ctx.fillStyle = fogPattern;
      ctx.fill(geom.fills[n]);
      ctx.restore();
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(190, 220, 240, 0.55)';
    ctx.lineWidth = Math.max(px1 * 1.2, HEX * 0.08);
    ctx.stroke(geom.coast);
    ctx.strokeStyle = 'rgba(12, 16, 24, 0.9)';
    ctx.lineWidth = Math.max(px1 * 1.3, HEX * 0.1);
    ctx.stroke(geom.borders);

    if (sel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = px1 * 2.5;
      ctx.setLineDash([px1 * 6, px1 * 4]);
      ctx.stroke(sel);
      ctx.setLineDash([]);
    }
    if (mine) {
      ctx.strokeStyle = 'rgba(255, 214, 102, 0.35)';
      ctx.lineWidth = px1 * 4.5;
      ctx.stroke(mine);
      ctx.strokeStyle = '#ffd666';
      ctx.lineWidth = px1 * 2.6;
      ctx.stroke(mine);
    }

    // Столицы
    for (const p of capitals) {
      if (!p) continue;
      const r = Math.max(HEX * 0.22, px1 * 3.5);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6dd';
      ctx.fill();
      ctx.lineWidth = px1 * 1.5;
      ctx.strokeStyle = '#1a1a1a';
      ctx.stroke();
    }

    // Стрелки
    for (const a of arrows) drawArrow(ctx, a, px1);

    // Подписи
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let c = 0; c < n; c++) {
      const L = geom.labels[c];
      if (!L) continue;
      const fs = Math.max(9, Math.min(30, L.r * HEX * 0.55));
      if (fs * v.k < 9) continue;
      const name = game.countries[c].name;
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      const ly = capitals[c] && Math.hypot(capitals[c]![0] - L.x, capitals[c]![1] - L.y) < fs ? L.y - fs * 0.9 : L.y;
      ctx.lineWidth = Math.max(px1 * 3, fs * 0.18);
      ctx.strokeStyle = 'rgba(10, 14, 20, 0.75)';
      ctx.strokeText(name, L.x, ly);
      ctx.fillStyle = c === myId ? '#ffe9a8' : '#f4f6f8';
      ctx.fillText(name, L.x, ly);
    }
  }, [arrows, capitals, fogPattern, game.countries, geom, mine, mode, myId, n, sel, terrain]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const raf = useRef(0);
  const requestDraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  useEffect(() => {
    requestDraw();
  }, [draw, requestDraw]);

  const fit = useCallback(() => {
    const { w, h } = size.current;
    if (w < 20 || h < 20) return; // окно ещё не получило размер — впишем карту позже
    const { width, height } = mapPixelSize(map);
    const k = Math.min(w / width, h / height) * 0.97;
    view.current = { k, x: (w - width * k) / 2, y: (h - height * k) / 2, touched: false };
    requestDraw();
  }, [map, requestDraw]);

  // Размер холста
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
      if (!view.current.touched) fit();
      else requestDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, requestDraw]);

  // Колесо — масштаб вокруг курсора (неп пассивный обработчик)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  });

  const zoomAt = (sx: number, sy: number, f: number) => {
    const v = view.current;
    const { width, height } = mapPixelSize(map);
    const minK = Math.min(size.current.w / width, size.current.h / height) * 0.6;
    const k = Math.max(minK, Math.min(5, v.k * f));
    v.x = sx - ((sx - v.x) * k) / v.k;
    v.y = sy - ((sy - v.y) * k) / v.k;
    v.k = k;
    v.touched = true;
    requestDraw();
  };

  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  const toCell = (sx: number, sy: number) => {
    const v = view.current;
    return cellAtPoint(map, (sx - v.x) / v.k, (sy - v.y) / v.k);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.moved || Math.abs(dx) + Math.abs(dy) > 4) {
        d.moved = true;
        view.current.x += dx;
        view.current.y += dy;
        view.current.touched = true;
        d.x = e.clientX;
        d.y = e.clientY;
        requestDraw();
        setHover(null);
        return;
      }
    }
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = toCell(sx, sy);
    setHover(cell >= 0 && game.map.terrain[cell] !== 0 ? { sx, sy, cell } : null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cell = toCell(e.clientX - rect.left, e.clientY - rect.top);
      const o = cell >= 0 ? owner[cell] : -1;
      onSelect(o >= 0 && o < n ? o : null);
    }
  };

  const hc = hover ? owner[hover.cell] : -1;
  const hFog = hc === n;
  const hCountry = hc >= 0 && hc < n ? game.countries[hc] : null;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
      />
      {hover && (
        <div className="map-tip" style={{ left: hover.sx + 14, top: hover.sy + 14 }}>
          {hCountry && (
            <div className="map-tip-title">
              <span className="swatch" style={{ background: hCountry.color }} />
              {hCountry.name}
              {hc === myId && <span className="muted"> (вы)</span>}
            </div>
          )}
          {hFog ? (
            <div className="map-tip-title muted">Неизвестные земли</div>
          ) : (
            <div className="muted">{TERRAIN_INFO[game.map.terrain[hover.cell]].name}</div>
          )}
        </div>
      )}
      <div className="map-zoom">
        <button onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1.3)} title="Приблизить">
          +
        </button>
        <button onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.3)} title="Отдалить">
          −
        </button>
        <button onClick={fit} title="Вся карта">
          ⤢
        </button>
      </div>
    </div>
  );
}

function drawArrow(ctx: CanvasRenderingContext2D, a: Arrow, px1: number): void {
  const [x0, y0] = a.from;
  const [x1, y1] = a.to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const lw = Math.max(a.width * px1, HEX * 0.12 * (a.width / 3));
  const head = Math.min(len * 0.5, lw * 3.2);
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = lw + px1 * 2.5;
  if (a.dashed) ctx.setLineDash([lw * 1.6, lw * 1.4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = a.color;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx - uy * head * 0.75, by + ux * head * 0.75);
  ctx.lineTo(bx + uy * head * 0.75, by - ux * head * 0.75);
  ctx.closePath();
  ctx.fillStyle = a.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = px1 * 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Штриховка «неизвестных земель». */
function makeFogPattern(): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = c.height = 10;
  const g = c.getContext('2d');
  if (!g) return null;
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-2, 12);
  g.lineTo(12, -2);
  g.stroke();
  return g.createPattern(c, 'repeat');
}
