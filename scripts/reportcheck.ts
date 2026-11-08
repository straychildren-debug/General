// Печатает полное донесение о нескольких сражениях — для проверки текста.
import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { battleChronicle } from '../src/ui/battleReport';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 9, humans: [] });
let shown = 0;
for (let y = 0; y < 90 && shown < 2; y++) {
  s = advanceYear(s, {});
  const r = s.reports[s.reports.length - 1];
  for (const b of r.battles) {
    if (shown >= 2 || (shown === 0 && (!b.attackerWon || b.field || !b.capitalTaken)) || (shown === 1 && (b.attackerWon || b.field))) continue;
    const ch = battleChronicle(s, b, b.attacker);
    shown++;
    console.log('════', r.year, s.countries[b.attacker].name, '→', s.countries[b.defender].name, b.attackerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ');
    for (const side of [ch.a, ch.d])
      console.log(side.role, side.general, side.age, side.exp, 'lvl', side.level, 'gain', side.expGain?.toFixed(1), side.units.map((u) => `${u.name} ${u.count}/-${u.lost}`).join(', '));
    ch.intro.forEach((l) => console.log('  ', l.text));
    ch.days.forEach((d) => { console.log(' ', d.title, d.weather ?? ''); d.lines.forEach((l) => console.log('    ', l.text)); console.log('     потери', d.aLoss, d.dLoss, 'дух', d.aMorale, d.dMorale); });
    ch.outcome.forEach((l) => console.log('  =>', l.text));
  }
}
