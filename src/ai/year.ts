// Один год игры целиком: договорённости → приказы компьютеров → обработка года → дипломатия компьютеров.
import { applyDiplomacy } from '../core/diplomacy';
import { computeGeo } from '../core/geo';
import { resolveTurn } from '../core/turn';
import type { GameState, Orders } from '../core/types';
import { allAiOrders } from './ai';
import { aiDiplomacy } from './diplomacyAi';

export function advanceYear(state: GameState, humanOrders: Record<number, Orders>): GameState {
  // Договоры вступают в силу сразу — компьютер учитывает их при выборе атак в этом же году
  const s1 = applyDiplomacy(state, humanOrders);
  const orders = { ...allAiOrders(s1, computeGeo(s1)), ...humanOrders };
  const s2 = resolveTurn(s1, orders);
  return aiDiplomacy(s2);
}