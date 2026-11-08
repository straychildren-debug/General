// Простые линейные иконки (24×24, цвет — currentColor), чтобы панель читалась с первого взгляда.
const PATHS = {
  coins: 'M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3-3.1-3-7-3-7 1.3-7 3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
  people: 'M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 11.6a2.6 2.6 0 1 0 0-5.2M16 14.2c2.9.3 5 2.5 5 5.8',
  wheat:
    'M12 22V9M12 13c-2.8 0-4.8-1.8-4.8-4.6 2.8 0 4.8 1.8 4.8 4.6zM12 13c2.8 0 4.8-1.8 4.8-4.6-2.8 0-4.8 1.8-4.8 4.6zM12 18c-2.8 0-4.8-1.8-4.8-4.6 2.8 0 4.8 1.8 4.8 4.6zM12 18c2.8 0 4.8-1.8 4.8-4.6-2.8 0-4.8 1.8-4.8 4.6zM12 8.5c-1.4-1.2-1.8-3-1-5 1.6 1 2 3 1 5z',
  swords: 'M4 4l9.5 9.5M4 4h4M4 4v4M20 4l-9.5 9.5M20 4h-4M20 4v4M6.5 14.5l3 3M4.5 19.5l3-3M17.5 14.5l-3 3M19.5 19.5l-3-3',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.6 15h8.8',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  house: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  scales: 'M12 3v18M8 21h8M5 7h14M5 7l-3 6.5a3 3 0 0 0 6 0zM19 7l-3 6.5a3 3 0 0 0 6 0z',
  advisor: 'M12 3a9 9 0 0 1 9 9c0 5-4 9-9 9a9 9 0 0 1-4.4-1.1L3 21l1.1-4.6A9 9 0 0 1 12 3zM12 8v4.5M12 15.5v.5',
  plus: 'M12 5v14M5 12h14',
  skull: 'M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3zM9 12.5a1.5 1.5 0 1 0 0-.01M15 12.5a1.5 1.5 0 1 0 0-.01M10 20v-2.5M14 20v-2.5',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  horse: 'M6 21l1-6-3-2 2-5 5-3 1-2 2 3 4 1 2 4-2 1-3-1-2 3 1 7M13 9.5h.01',
  bow: 'M5 3c8 3 11 8 11 9s-3 6-11 9M5 3v18M5 12h15M17 9l3 3-3 3',
  cannon: 'M3 15l13-6 2 4-13 6zM16 9l3-1.5 1 2-3 1.5M7 18a2.5 2.5 0 1 0 0 .01M12 21l-2-3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={'icon ' + (className ?? '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Иконки наук в порядке SCIENCE_INFO. */
export const SCIENCE_ICONS: IconName[] = ['coins', 'wheat', 'house', 'trend', 'swords', 'bulb'];
/** Короткие названия наук для плиток. */
export const SCIENCE_SHORT = ['Деньги', 'Урожай', 'Плотность', 'Рост', 'Войско', 'Учёность'];
