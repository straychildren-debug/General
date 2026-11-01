import type { Rng } from './rng';

export const COUNTRY_NAMES = [
  'Россия', 'Франция', 'Германия', 'Англия', 'Испания', 'Италия', 'Португалия', 'Швеция',
  'Норвегия', 'Дания', 'Польша', 'Австрия', 'Венгрия', 'Турция', 'Греция', 'Египет',
  'Персия', 'Индия', 'Китай', 'Япония', 'Корея', 'Монголия', 'Аргентина', 'Бразилия',
  'Мексика', 'Канада', 'США', 'Чили', 'Перу', 'Колумбия', 'Венесуэла', 'Куба',
  'Голландия', 'Бельгия', 'Швейцария', 'Финляндия', 'Румыния', 'Болгария', 'Сербия', 'Украина',
  'Казахстан', 'Афганистан', 'Ирак', 'Сирия', 'Марокко', 'Эфиопия', 'Австралия', 'Индонезия',
  'Таиланд', 'Вьетнам',
];

const FIRST = [
  'Аркадий', 'Борис', 'Вадим', 'Глеб', 'Демид', 'Евгений', 'Захар', 'Игнат', 'Кирилл', 'Лев',
  'Мирон', 'Назар', 'Олег', 'Павел', 'Родион', 'Савелий', 'Тимофей', 'Фёдор', 'Эмиль', 'Ярослав',
  'Андрей', 'Всеволод', 'Григорий', 'Даниил', 'Елисей', 'Илья', 'Константин', 'Леонид', 'Матвей',
  'Никита', 'Остап', 'Пётр', 'Роман', 'Семён', 'Тарас', 'Филипп', 'Яков', 'Архип', 'Богдан', 'Степан',
];

const LAST = [
  'Стрельцов', 'Громов', 'Орлов', 'Волков', 'Соколов', 'Белозёров', 'Тихомиров', 'Ястребов', 'Буров',
  'Зорин', 'Ветров', 'Лебедев', 'Сабуров', 'Дубровин', 'Полозов', 'Рябинин', 'Черкасов', 'Гранин',
  'Кречетов', 'Барсуков', 'Мещеряков', 'Огнев', 'Ратников', 'Стругов', 'Туманов', 'Удальцов',
  'Федотов', 'Хмелёв', 'Сокольский', 'Бронников', 'Вольский', 'Грозин', 'Калинин', 'Ладогин',
  'Метелин', 'Невзоров', 'Обухов', 'Пересветов', 'Рокотов', 'Суворин', 'Твердохлебов', 'Шатров',
];

export function generalName(rng: Rng): string {
  return rng.pick(FIRST) + ' ' + rng.pick(LAST);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Подбирает различимые цвета так, чтобы соседи не были похожи. */
export function assignColors(n: number, neighbors: number[][], rng: Rng): string[] {
  const palette: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const hue = (i * 137.508 + 20) % 360;
    const sat = 48 + (i % 3) * 10;
    const light = 50 + ((i % 4) - 1.5) * 6;
    palette.push(hslToRgb(hue, sat, light));
  }
  const dist = (a: [number, number, number], b: [number, number, number]) => {
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  };
  const order = rng.shuffle([...Array(n).keys()]).sort((a, b) => neighbors[b].length - neighbors[a].length);
  const assigned: ([number, number, number] | null)[] = Array(n).fill(null);
  const free = new Set(palette.keys());
  for (const c of order) {
    let best = -1;
    let bestScore = -1;
    for (const p of free) {
      let m = 1e9;
      for (const nb of neighbors[c]) {
        const col = assigned[nb];
        if (col) m = Math.min(m, dist(col, palette[p]));
      }
      const score = m + rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    free.delete(best);
    assigned[c] = palette[best];
  }
  return assigned.map((c) => toHex(c!));
}
