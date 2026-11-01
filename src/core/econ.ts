import { B, fortCost, generalUpkeep, recruitCost, sciMult } from './balance';
import type { Geo } from './geo';
import { S_AGRI, S_DENS, S_ECON, S_GROW, S_SCI, type Country, type GameState, type Orders } from './types';

/**
 * Хозяйство за год.
 * Крестьяне (население минус солдаты и учёные) платят деньги и выращивают зерно.
 * Каждый житель съедает 1 зерно. Излишки продаются, недостача докупается.
 */
export interface Econ {
  maxPop: number;
  civilians: number;
  harvest: number;
  consumption: number;
  surplus: number; // > 0 — излишек на продажу, < 0 — нужно докупить
  taxes: number;
  upkeepSoldiers: number;
  upkeepScientists: number;
  upkeepGenerals: number;
  upkeep: number;
  growth: number;
  sciencePts: number;
  fert: number;
  /** Скольких ещё людей можно забрать с полей, не уходя в недостачу зерна (< 0 — уже недостача). */
  foodRoom: number;
}

export function computeEcon(
  c: Country,
  cells: number,
  sumCap: number,
  sumFert: number,
  cpc: number,
  harvestMult = 1,
): Econ {
  const maxPop = sumCap * B.popPerCell * sciMult(c, S_DENS);
  const civilians = Math.max(0, c.population - c.soldiers - c.scientists);
  const fert = cells > 0 ? sumFert / cells : 1;
  const perCiv = B.grainPerCiv * sciMult(c, S_AGRI) * fert * harvestMult;
  const harvest = civilians * perCiv;
  const consumption = c.population * B.foodPerPerson;
  const taxes = civilians * B.taxPerCapita * sciMult(c, S_ECON);
  const upkeepSoldiers = c.soldiers * B.soldierUpkeep;
  const upkeepScientists = c.scientists * B.sciUpkeep;
  let upkeepGenerals = 0;
  for (const g of c.generals) {
    upkeepGenerals += generalUpkeep(g, cpc);
    if (g.task.type === 'study') upkeepGenerals += B.studyFee * (cpc / 170);
  }
  const p = c.population;
  // Растём на growthBase в год, пока не упрёмся в предел земли; сверх предела — убыль
  const growth = p < maxPop ? Math.min(maxPop - p, B.growthBase * sciMult(c, S_GROW) * p) : -(p - maxPop) * 0.2;
  const sciencePts = c.scientists * B.ptsPerSci * sciMult(c, S_SCI);
  const civNeeded = perCiv > 0 ? consumption / perCiv : Infinity;
  return {
    maxPop,
    civilians,
    harvest,
    consumption,
    surplus: harvest - consumption,
    taxes,
    upkeepSoldiers,
    upkeepScientists,
    upkeepGenerals,
    upkeep: upkeepSoldiers + upkeepScientists + upkeepGenerals,
    growth,
    sciencePts,
    fert,
    foodRoom: Math.floor(civilians - civNeeded),
  };
}

export function econOf(state: GameState, geo: Geo, c: Country, harvestMult = 1): Econ {
  return computeEcon(c, geo.cells[c.id], geo.sumCap[c.id], geo.sumFert[c.id], state.cellsPerCountry, harvestMult);
}

export function staffRoom(c: Country): number {
  return Math.max(0, Math.floor(c.population * B.maxStaffFrac - c.soldiers - c.scientists));
}

export interface Settlement {
  saleRevenue: number;
  grainBought: number;
  grainCost: number;
  unfed: number; // сколько людей осталось без еды
  unpaid: number; // сколько не хватило на жалованье
  money: number;
}

/** Расчёт в конце года: доход, продажа излишков, жалованье, докупка зерна. */
export function settle(money: number, e: Econ, price: number): Settlement {
  money += e.taxes;
  const saleRevenue = e.surplus > 0 ? e.surplus * price : 0;
  money += saleRevenue;
  money -= e.upkeep;
  let unpaid = 0;
  if (money < 0) {
    unpaid = -money;
    money = 0;
  }
  let grainBought = 0;
  let unfed = 0;
  if (e.surplus < 0) {
    const need = -e.surplus;
    const unit = price * B.buyMarkup;
    grainBought = Math.min(need, money / unit);
    money -= grainBought * unit;
    unfed = need - grainBought;
  }
  return { saleRevenue, grainBought, grainCost: grainBought * price * B.buyMarkup, unfed, unpaid, money };
}

/** Люди, умирающие от голода, если на них не хватило зерна. */
export function starvationDeaths(unfed: number): number {
  return unfed * 0.5;
}

export interface Forecast {
  price: number;
  taxes: number;
  saleRevenue: number;
  grainCost: number;
  hireCost: number;
  soldierCost: number;
  scientistCost: number;
  generalCost: number;
  fortCost: number;
  spend: number;
  upkeepSoldiers: number;
  upkeepScientists: number;
  upkeepGenerals: number;
  upkeep: number;
  moneyAfterPurchases: number;
  moneyEnd: number;
  unfed: number;
  unpaid: number;
  harvest: number;
  consumption: number;
  population: number;
  popEnd: number;
  maxPop: number;
  sciencePts: number;
  soldiers: number;
  scientists: number;
  staffRoom: number;
  foodRoom: number; // сколько ещё можно нанять без нехватки зерна
}

/** Прогноз на год при заданных приказах (по прошлогодней цене зерна, без войны и событий). */
export function forecast(state: GameState, geo: Geo, c: Country, o: Orders): Forecast {
  const price = state.market.price;
  const hs = Math.round(o.hireSoldiers);
  const hsc = Math.round(o.hireScientists);
  const soldierCost = recruitCost('soldier', c.soldiers, c.population, Math.max(0, hs));
  const scientistCost = recruitCost('scientist', c.scientists, c.population, Math.max(0, hsc));
  const hireCost = soldierCost + scientistCost;
  let generalCost = 0;
  for (const id of o.buyOffers) {
    const off = c.offers.find((x) => x.id === id);
    if (off) generalCost += off.price;
  }
  let fc = 0;
  for (const nb of new Set(o.buildForts)) fc += fortCost(c.forts[nb] ?? 0, state.cellsPerCountry);
  const spend = hireCost + generalCost + fc;
  const moneyAfterPurchases = c.money - spend;

  const sim: Country = {
    ...c,
    soldiers: Math.max(0, c.soldiers + hs),
    scientists: Math.max(0, c.scientists + hsc),
    generals: c.generals
      .filter((g) => !o.dismissGenerals.includes(g.id))
      .map((g) => ({ ...g, task: o.tasks[g.id] ?? g.task }))
      .concat(c.offers.filter((x) => o.buyOffers.includes(x.id)).map((x) => ({ ...x, task: { type: 'defend' as const } }))),
  };
  const e = econOf(state, geo, sim);
  const st = settle(Math.max(0, moneyAfterPurchases), e, price);
  const popEnd = st.unfed > 0 ? c.population - starvationDeaths(st.unfed) : c.population + e.growth;
  return {
    price,
    taxes: e.taxes,
    saleRevenue: st.saleRevenue,
    grainCost: st.grainCost,
    hireCost,
    soldierCost,
    scientistCost,
    generalCost,
    fortCost: fc,
    spend,
    upkeepSoldiers: e.upkeepSoldiers,
    upkeepScientists: e.upkeepScientists,
    upkeepGenerals: e.upkeepGenerals,
    upkeep: e.upkeep,
    moneyAfterPurchases,
    moneyEnd: st.money - st.unpaid,
    unfed: st.unfed,
    unpaid: st.unpaid,
    harvest: e.harvest,
    consumption: e.consumption,
    population: c.population,
    popEnd,
    maxPop: e.maxPop,
    sciencePts: e.sciencePts,
    soldiers: sim.soldiers,
    scientists: sim.scientists,
    staffRoom: staffRoom(c),
    foodRoom: e.foodRoom,
  };
}
