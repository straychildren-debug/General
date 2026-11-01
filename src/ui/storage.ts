import { ensureDiplomacy } from '../core/diplomacy';
import type { GameState } from '../core/types';

const KEY = 'polkovodets.save.v1';

export function saveGame(g: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const g = JSON.parse(s) as GameState;
    return g && g.version === 1 ? ensureDiplomacy(g) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно */
  }
}
