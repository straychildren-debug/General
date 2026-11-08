// Правители стран: имя с титулом, портрет и нрав (насколько страна воинственна).
// Всё выводится детерминированно из номера партии и страны — без хранения в сохранении.
import { hash01 } from '../core/rng';
import { cultureOf } from '../core/cultures';
import type { GameState } from '../core/types';

export interface Ruler {
  title: string;
  name: string;
  female: boolean;
  seed: number;
  /** Какие головные уборы бывают у правителей этой страны */
  hats?: string[];
}

const HATS: Record<string, string[]> = {
  Турция: ['turban'], Египет: ['turban'], Ирак: ['turban'], Сирия: ['turban'], Марокко: ['turban'], Персия: ['turban', 'crown'],
  Афганистан: ['turban'], Индия: ['turban'], Индонезия: ['turban', 'none'],
  Монголия: ['fur', 'helmet'], Казахстан: ['fur', 'helmet'], Россия: ['crown', 'fur'], Украина: ['fur', 'none'], Польша: ['crown', 'fur'],
  США: ['none'], Канада: ['none'], Австралия: ['none'], Финляндия: ['none'], Швейцария: ['none'],
  Мексика: ['none'], Аргентина: ['none'], Чили: ['none'], Перу: ['none'], Колумбия: ['none'], Венесуэла: ['none'], Куба: ['none'],
  Япония: ['helmet', 'none'], Китай: ['crown', 'none'], Корея: ['crown', 'none'], Вьетнам: ['crown', 'none'],
};

const ROMAN = ['', ' I', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX'];

export function rulerOf(game: GameState, id: number): Ruler {
  const c = game.countries[id];
  const s = game.settings.seed ?? 1;
  const seed = Math.floor(hash01(s, id, 77) * 1e9);
  if (c.controller === 'human') return { title: 'Правитель', name: c.playerName ?? 'Игрок', female: false, seed };
  const cu = cultureOf(c.name);
  const female = hash01(s, id, 1) < 0.15;
  const pick = <T,>(arr: T[], k: number) => arr[Math.floor(hash01(s, id, k) * arr.length) % arr.length];
  const title = female ? cu.titleF : cu.titleM;
  let name = female ? pick(cu.female, 3) : pick(cu.male, 3);
  if (cu.ordinal) name += ROMAN[1 + (Math.floor(hash01(s, id, 4) * (ROMAN.length - 1)) % (ROMAN.length - 1))];
  else if (!cu.noLast && cu.last.length) {
    const last = pick(cu.last, 5);
    name = cu.lastFirst ? `${last} ${name}` : `${name} ${last}`;
  }
  return { title, name, female, seed, hats: HATS[c.name] };
}

// ── Нрав ──

const BASE: Record<string, number> = { aggressor: 0.85, cunning: 0.6, balanced: 0.45, merchant: 0.3, scientist: 0.22 };
export const WAR_LABELS = ['Миролюбивая', 'Спокойная', 'Непредсказуемая', 'Воинственная', 'Очень воинственная'];

/** Насколько страна воинственна: нрав правителя (слухи) и её нападения за последние 10 лет. */
export function warlike(game: GameState, id: number): { level: number; label: string; attacks: number } {
  const c = game.countries[id];
  let attacks = 0;
  for (const r of game.reports.slice(-10)) for (const b of r.battles) if (b.attacker === id) attacks++;
  const base = c.controller === 'human' ? 0.4 : (BASE[c.personality] ?? 0.45);
  const score = Math.max(0, Math.min(1, base * 0.65 + Math.min(0.4, attacks * 0.07)));
  const level = score < 0.22 ? 0 : score < 0.36 ? 1 : score < 0.48 ? 2 : score < 0.62 ? 3 : 4;
  return { level, label: WAR_LABELS[level], attacks };
}

export const WAR_COLORS = ['#5fd37a', '#9bcf6a', '#e3b341', '#f0883e', '#ff6a5c'];

// ── Портрет ──

const SKIN = ['#f1c9a5', '#e2b48b', '#c48d5f', '#9a6640'];
const HAIR = ['#2b2018', '#4e3220', '#8a5a2e', '#c9a86a', '#8f8f8f', '#dcdcdc'];

/** Портрет правителя: лицо, волосы, борода и головной убор — по «зерну» правителя. */
export function Portrait({ ruler, color, size = 56 }: { ruler: Ruler; color: string; size?: number }) {
  const h = (k: number) => hash01(ruler.seed, k);
  const skin = SKIN[Math.floor(h(1) * SKIN.length)];
  const old = h(2) < 0.3;
  const hair = old ? HAIR[4 + Math.floor(h(3) * 2)] : HAIR[Math.floor(h(3) * 4)];
  const beard = ruler.female ? 0 : Math.floor(h(4) * 3); // 0 — нет, 1 — короткая, 2 — длинная
  const mustache = !ruler.female && (beard > 0 || h(5) < 0.5);
  const hats = ruler.female
    ? ruler.hats?.[0] === 'none' ? ['none'] : ['tiara', 'crown', 'none']
    : (ruler.hats ?? ['crown', 'crown', 'none']);
  const hat = hats[Math.floor(h(6) * hats.length)];
  const robe = ['#7b2d3a', '#2d4e7b', '#3d6b3a', '#5b3d7b', '#7b5a2d'][Math.floor(h(7) * 5)];
  const id = 'pt' + ruler.seed;
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <circle cx="32" cy="32" r="31" />
        </clipPath>
        <radialGradient id={id + 'g'} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f151c" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={`url(#${id}g)`} />
        {ruler.female && <path d="M19 30 Q19 13 32 13 Q45 13 45 30 L46 47 Q40 45 38 40 L26 40 Q24 45 18 47 Z" fill={hair} />}
        <path d="M8 64 Q10 47 32 46 Q54 47 56 64 Z" fill={robe} />
        <path d="M24 47 L32 56 L40 47" fill="none" stroke="#e6b450" strokeWidth="2" />
        <rect x="28" y="39" width="8" height="9" fill={skin} />
        <ellipse cx="32" cy="30" rx="11" ry="13" fill={skin} />
        {!ruler.female && hat === 'none' && <path d="M21 28 Q21 15 32 15 Q43 15 43 28 Q40 21 32 21 Q24 21 21 28 Z" fill={hair} />}
        {beard === 1 && <path d="M21 31 Q22 44 32 46 Q42 44 43 31 Q40 40 32 40 Q24 40 21 31 Z" fill={hair} />}
        {beard === 2 && <path d="M21 31 Q21 50 32 55 Q43 50 43 31 Q40 41 32 41 Q24 41 21 31 Z" fill={hair} />}
        {mustache && <path d="M26.5 36.5 Q32 33 37.5 36.5 Q32 35.2 26.5 36.5 Z" fill={hair} stroke={hair} strokeWidth="1.2" />}
        <circle cx="28" cy="30" r="1.4" fill="#1b1b1b" />
        <circle cx="36" cy="30" r="1.4" fill="#1b1b1b" />
        <path d="M25.5 26.8 L30 26.2 M34 26.2 L38.5 26.8" stroke={old ? '#cfcfcf' : '#2b2018'} strokeWidth="1.2" strokeLinecap="round" />
        {beard !== 2 && <path d="M29.5 38.6 Q32 39.8 34.5 38.6" fill="none" stroke="#7a3b2e" strokeWidth="1.2" strokeLinecap="round" />}
        {hat === 'crown' && (
          <g>
            <path d="M21 21 L22.5 11 L27.5 16 L32 8.5 L36.5 16 L41.5 11 L43 21 Z" fill="#e6b450" stroke="#8a6420" strokeWidth="0.8" />
            <circle cx="32" cy="17" r="1.6" fill="#d33b3b" />
            <circle cx="26" cy="18.5" r="1.1" fill="#3b7bd3" />
            <circle cx="38" cy="18.5" r="1.1" fill="#3b7bd3" />
          </g>
        )}
        {hat === 'tiara' && <path d="M22.5 19.5 L26 14 L29 17.5 L32 11.5 L35 17.5 L38 14 L41.5 19.5 Q32 17 22.5 19.5 Z" fill="#e6b450" stroke="#8a6420" strokeWidth="0.7" />}
        {hat === 'turban' && (
          <g>
            <ellipse cx="32" cy="18" rx="13.5" ry="8" fill="#efe6d2" />
            <path d="M19 19 Q32 12 45 18 M20 22 Q32 15 44 21" fill="none" stroke="#c9bb9a" strokeWidth="1.2" />
            <circle cx="32" cy="15.5" r="2" fill="#2e9e6a" />
          </g>
        )}
        {hat === 'helmet' && (
          <g>
            <path d="M20 26 Q20 10.5 32 10.5 Q44 10.5 44 26 Z" fill="#9aa4ae" stroke="#5d666f" strokeWidth="0.8" />
            <rect x="31" y="22" width="2" height="10" fill="#7c858e" />
            <path d="M32 10.5 L32 5" stroke="#5d666f" strokeWidth="1.6" />
          </g>
        )}
        {hat === 'fur' && (
          <g>
            <path d="M19 23 Q19 11 32 11 Q45 11 45 23 Q32 26 19 23 Z" fill="#5a3d26" />
            <path d="M19 23 Q32 26 45 23 L45 20 Q32 23 19 20 Z" fill="#d8c8a8" />
          </g>
        )}
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
