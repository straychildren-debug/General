// Принимаем предложения компьютера и смотрим, появляется ли договор и не повторяется ли предложение.
import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS, defaultOrders } from '../src/core/game';
import { dealText, treatyBetween } from '../src/core/diplomacy';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 21, humans: ['Игрок'] });
const me = s.countries.find((c) => c.controller === 'human')!.id;
let shown = 0;
for (let y = 0; y < 60 && shown < 8 && !s.over; y++) {
  const offers = s.offers.filter((d) => d.to === me && d.year === s.year);
  const o = defaultOrders(s.countries[me]);
  o.hireSoldiers = 0;
  o.diplomacy = { deals: [], accept: offers.map((d) => d.id), cancel: [] };
  const moneyBefore = s.countries[me].money;
  for (const d of offers) console.log(`${s.year}: ${s.countries[d.from].name} → нам: ${d.ultimatum ? 'УЛЬТИМАТУМ ' : ''}${dealText(s, d, me)} [kind=${d.kind} payer=${d.payer} once=${d.once} yearly=${d.yearly}]`);
  s = advanceYear(s, { [me]: o });
  for (const d of offers) {
    const t = treatyBetween(s, me, d.from);
    if (!t) console.log("   бои с нами:", s.reports[s.reports.length - 1].battles.filter((b) => b.attacker === me || b.defender === me).map((b) => s.countries[b.attacker].name + "→" + s.countries[b.defender].name), "предательства:", s.reports[s.reports.length - 1].events.filter((e) => /нарушил/.test(e.text)).map((e) => s.countries[e.country]?.name + ": " + e.text));
    if (!t) console.log("   все договоры с нами:", s.treaties.filter((x) => x.a === me || x.b === me), "события:", s.reports[s.reports.length - 1].events.filter((e) => e.country === me).map((e) => e.text).slice(0, 6));
    console.log(`   принято → договор: ${t ? `${t.kind} ${t.start}-${t.until} payer=${t.payer} yearly=${t.yearly}` : 'НЕТ'}; деньги ${Math.round(moneyBefore)} → ${Math.round(s.countries[me].money)}`);
    shown++;
  }
}
