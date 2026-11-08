import { useMemo } from 'react';
import { genFactor } from '../core/balance';
import { fmt, pct } from '../core/format';
import type { BattleReport, GameState } from '../core/types';
import { battleChronicle, cellWord, dayWord, type Chronicle, type SideInfo } from './battleReport';
import { Swatch } from './common';
import { Icon } from './icons';

function stars(exp: number): number {
  return Math.max(0, Math.min(5, Math.round(((genFactor(exp) - 0.55) / 2.2) * 5)));
}

function SideCard({ game, s, viewer }: { game: GameState; s: SideInfo; viewer: number | null }) {
  const c = game.countries[s.id];
  const max = Math.max(1, ...s.units.map((u) => u.count));
  const n = s.exp != null ? stars(s.exp) : 0;
  return (
    <div className={'br-side ' + s.role} style={{ ['--c' as string]: c.color }}>
      <div className="br-side-role">
        <Icon name={s.role === 'attack' ? 'swords' : 'shield'} size={14} /> {s.role === 'attack' ? 'Нападение' : 'Оборона'}
        {viewer === s.id && <span className="br-we">мы</span>}
      </div>
      <div className="br-side-name">
        <Swatch color={c.color} /> {c.name}
      </div>
      <div className="br-gen">
        <span className="br-ava">{s.general ? s.general.split(' ').map((w) => w[0]).join('').slice(0, 2) : '—'}</span>
        {s.general ? (
          <div>
            <b>{s.general}</b>
            {s.died && <span className="neg"> † пал в бою</span>}
            <div className="muted small">
              {s.age ? `${s.age} лет · ` : ''}
              <span className="op-stars">
                {'★'.repeat(n)}
                <span className="dim">{'★'.repeat(5 - n)}</span>
              </span>
              {s.exp != null && ` опыт ${s.exp}`}
              {s.speed != null && ` · скорость ${s.speed}`}
            </div>
          </div>
        ) : (
          <div className="neg small">Без командира — гарнизон воюет вполсилы</div>
        )}
      </div>
      <div className="br-army">
        <span>
          Войско <b>{fmt(s.total)}</b>
        </span>
        {s.level != null && (
          <span className="muted small">
            <Icon name="swords" size={13} /> военная мощь ур. {s.level}
          </span>
        )}
      </div>
      <div className="br-units">
        {s.units.map((u) => (
          <div className="br-unit" key={u.key}>
            <Icon name={u.icon} size={15} />
            <span className="br-unit-name">{u.name}</span>
            <span className="br-unit-bar">
              <i style={{ width: (u.count / max) * 100 + '%' }} />
              <i className="lost" style={{ width: (u.lost / max) * 100 + '%' }} />
            </span>
            <span className="br-unit-n">{fmt(u.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const W = 300;
const H = 90;

function MiniChart({ title, ch, kind, colors }: { title: string; ch: Chronicle; kind: 'army' | 'morale'; colors: [string, string] }) {
  const first = ch.days[0];
  const a0 = kind === 'army' ? (first ? first.aArmy + first.aLoss : ch.a.total) : ch.a.morale0;
  const d0 = kind === 'army' ? (first ? first.dArmy + first.dLoss : ch.d.total) : ch.d.morale0;
  const a = [a0, ...ch.days.map((x) => (kind === 'army' ? x.aArmy : x.aMorale))];
  const d = [d0, ...ch.days.map((x) => (kind === 'army' ? x.dArmy : x.dMorale))];
  const max = Math.max(1, ...a, ...d) * 1.05;
  const line = (vals: number[]) =>
    vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * (W - 8) + 4).toFixed(1)},${(H - 6 - (v / max) * (H - 14)).toFixed(1)}`).join(' ');
  return (
    <div className="br-chart">
      <div className="br-chart-title">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.06)" />
        ))}
        {[a, d].map((vals, k) => (
          <g key={k}>
            <polyline points={line(vals)} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="5" strokeLinejoin="round" />
            <polyline points={line(vals)} fill="none" stroke={colors[k]} strokeWidth="2.6" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Полное донесение о сражении: стороны, состав войск, ход боя по дням и итог. */
export function BattleReportView({ game, b, viewer, year }: { game: GameState; b: BattleReport; viewer: number | null; year: number }) {
  const ch = useMemo(() => battleChronicle(game, b, viewer), [game, b, viewer]);
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const verdict = ch.good === null ? (b.attackerWon ? `Победа: ${A.name}` : `Победа: ${D.name}`) : ch.good ? 'Победа' : 'Поражение';
  const sA = b.attackerStrength;
  const sD = b.defenderStrength;
  const share = sA / Math.max(1, sA + sD);
  const lossPct = (s: SideInfo) => pct(s.lost / Math.max(1, s.total));

  return (
    <div className="br">
      <div className={'br-banner ' + (ch.good === null ? '' : ch.good ? 'good' : 'bad')}>
        <div className="br-verdict">{verdict}</div>
        <div className="br-title">
          <Swatch color={A.color} /> {A.name} {b.field ? '⚔' : '→'} <Swatch color={D.color} /> {D.name}
        </div>
        <div className="br-sub">
          {year}-й год · {ch.days.length} {dayWord(ch.days.length)} боёв · {ch.terrain}
        </div>
      </div>

      <div className="br-sides">
        <SideCard game={game} s={ch.a} viewer={viewer} />
        <div className="br-vs">
          <div className="br-vs-word">против</div>
          <div className="br-tug" title="Соотношение сил с учётом генералов, вооружения, местности и боевого духа">
            <i style={{ width: share * 100 + '%', background: A.color }} />
            <i style={{ width: (1 - share) * 100 + '%', background: D.color }} />
          </div>
          <div className="muted small">соотношение сил</div>
        </div>
        <SideCard game={game} s={ch.d} viewer={viewer} />
      </div>

      {b.details && <ForceTable game={game} b={b} />}

      <div className="br-body">
        <div className="br-story">
          <div className="br-h">Как шло сражение</div>
          <div className="br-intro">
            {ch.intro.map((l, k) => (
              <p key={k} className={'br-line ' + (l.tone ?? '')}>
                {l.text}
              </p>
            ))}
          </div>
          {ch.days.map((d, k) => (
            <div className="br-day" key={k}>
              <div className="br-day-badge">
                <Icon name="hourglass" size={14} /> {d.title}
              </div>
              <div className="br-day-body">
                {d.weather && <p className="br-line note">{d.weather}</p>}
                {d.lines.map((l, j) => (
                  <p key={j} className={'br-line ' + (l.tone ?? '')}>
                    {l.text}
                  </p>
                ))}
                <div className="br-day-foot">
                  <span>
                    <Icon name="skull" size={13} /> потери: <Swatch color={A.color} /> {fmt(d.aLoss)} · <Swatch color={D.color} /> {fmt(d.dLoss)}
                  </span>
                  <span className="br-morale" title="Боевой дух">
                    дух <i style={{ width: d.aMorale * 0.5 + 'px', background: A.color }} /> {d.aMorale}% · <i style={{ width: d.dMorale * 0.5 + 'px', background: D.color }} /> {d.dMorale}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="br-aside">
          <MiniChart title="Численность войск по дням" ch={ch} kind="army" colors={[A.color, D.color]} />
          <MiniChart title="Боевой дух по дням" ch={ch} kind="morale" colors={[A.color, D.color]} />
          <div className="br-legend">
            <span>
              <Swatch color={A.color} /> {A.name}
            </span>
            <span>
              <Swatch color={D.color} /> {D.name}
            </span>
          </div>
        </div>
      </div>

      <div className="br-result">
        <div className="br-h">Итог боя</div>
        <div className="br-outcome">
          {ch.outcome.map((l, k) => (
            <p key={k} className={'br-line ' + (l.tone ?? '')}>
              {l.text}
            </p>
          ))}
        </div>
        <div className="br-stats">
          <div className="br-stat">
            <Icon name="map" size={18} />
            <div>
              <div className="br-stat-v">{b.field ? '—' : b.cellsTaken > 0 ? `${b.cellsTaken} ${cellWord(b.cellsTaken)}` : '0'}</div>
              <div className="muted small">захвачено земли</div>
            </div>
          </div>
          {[ch.a, ch.d].map((s) => (
            <div className="br-stat" key={s.id} style={{ ['--c' as string]: game.countries[s.id].color }}>
              <Icon name="skull" size={18} />
              <div>
                <div className="br-stat-v">
                  {fmt(s.lost)} <span className="muted small">({lossPct(s)})</span>
                </div>
                <div className="muted small">
                  погибло и ранено · {game.countries[s.id].name}
                </div>
              </div>
            </div>
          ))}
          {[ch.a, ch.d]
            .filter((s) => s.general)
            .map((s) => (
              <div className="br-stat" key={'g' + s.id}>
                <Icon name="crown" size={18} />
                <div>
                  <div className={'br-stat-v ' + (s.died ? 'neg' : '')}>{s.died ? 'пал в бою' : s.expGain != null ? `+${s.expGain.toFixed(1)} опыта` : 'жив'}</div>
                  <div className="muted small">генерал {s.general}</div>
                </div>
              </div>
            ))}
        </div>
        <table className="br-losses">
          <thead>
            <tr>
              <th>Потери по родам войск</th>
              <th>
                <Swatch color={A.color} /> {A.name}
              </th>
              <th>
                <Swatch color={D.color} /> {D.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {(['inf', 'rng', 'cav', 'art', 'mil'] as const).map((key) => {
              const ua = ch.a.units.find((u) => u.key === key);
              const ud = ch.d.units.find((u) => u.key === key);
              if (!ua && !ud) return null;
              const cell = (u?: { lost: number; count: number }) => (u ? <>{fmt(u.lost)} <span className="muted">из {fmt(u.count)}</span></> : <span className="muted">—</span>);
              return (
                <tr key={key}>
                  <td>{[ua?.name, ud?.name].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' / ')}</td>
                  <td>{cell(ua)}</td>
                  <td>{cell(ud)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Из чего сложилась сила сторон: каждый множитель отдельно и итог. */
function ForceTable({ game, b }: { game: GameState; b: BattleReport }) {
  const det = b.details!;
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const x = (v: number) => '×' + v.toFixed(2);
  const tone = (v: number) => (v > 1.02 ? 'pos' : v < 0.98 ? 'neg' : '');
  const militia = det.def.militia ?? 0;
  const terrain = b.field ? 1 : det.def.terrain;
  const aBase = b.attackerSoldiers * det.atk.mil * det.atk.gen * det.atk.morale;
  const dBase = (b.defenderSoldiers + militia) * det.def.mil * det.def.gen * terrain * det.def.morale;
  const aLuck = b.attackerStrength / Math.max(1, aBase);
  const dLuck = b.defenderStrength / Math.max(1, dBase);
  const lvl = (l?: number) => (l != null ? ` (ур. ${l})` : '');
  return (
    <div className="br-calc">
      <div className="br-h">Расчёт силы</div>
      <table className="forces br-forces">
        <thead>
          <tr>
            <th />
            <th>
              <Swatch color={A.color} /> {A.name}
            </th>
            <th>
              <Swatch color={D.color} /> {D.name}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Солдат в бою</td>
            <td>{fmt(b.attackerSoldiers)}</td>
            <td>
              {fmt(b.defenderSoldiers)}
              {militia > 0 && <span className="muted"> + ополчение {fmt(militia)}</span>}
            </td>
          </tr>
          {!b.field && det.def.front < 0.999 && det.def.total > 0 && (
            <tr>
              <td>Гарнизон на этом участке</td>
              <td className="muted">—</td>
              <td>
                {Math.round(det.def.front * 100)}% <span className="muted">из {fmt(det.def.total)}</span>
              </td>
            </tr>
          )}
          <tr>
            <td>Генерал (опыт)</td>
            <td>
              {b.attackerGeneral}
              {det.atk.exp != null && <span className="muted"> · {det.atk.exp}</span>} <b className={tone(det.atk.gen)}>{x(det.atk.gen)}</b>
            </td>
            <td>
              {b.defenderGeneral ? (
                <>
                  {b.defenderGeneral}
                  {det.def.exp != null && <span className="muted"> · {det.def.exp}</span>} <b className={tone(det.def.gen)}>{x(det.def.gen)}</b>
                </>
              ) : (
                <span className="neg">без командира {x(det.def.gen)}</span>
              )}
            </td>
          </tr>
          <tr>
            <td>Военная мощь</td>
            <td>
              <b className={tone(det.atk.mil)}>{x(det.atk.mil)}</b>
              <span className="muted">{lvl(det.atk.level)}</span>
            </td>
            <td>
              <b className={tone(det.def.mil)}>{x(det.def.mil)}</b>
              <span className="muted">{lvl(det.def.level)}</span>
            </td>
          </tr>
          <tr>
            <td>Местность</td>
            <td className="muted">—</td>
            <td>
              {b.field ? <span className="muted">открытое поле</span> : <b className={tone(terrain)}>{x(terrain)}</b>}
              {!b.field && <span className="muted"> · {terrain >= 1.3 ? 'горы и холмы' : terrain >= 1.12 ? 'леса' : 'равнина'}</span>}
            </td>
          </tr>
          <tr>
            <td>Боевой дух</td>
            <td>
              <b className={tone(det.atk.morale)}>{x(det.atk.morale)}</b>
            </td>
            <td>
              <b className={tone(det.def.morale)}>{x(det.def.morale)}</b>
            </td>
          </tr>
          <tr>
            <td>Удача в бою</td>
            <td>
              <b className={tone(aLuck)}>{x(aLuck)}</b>
            </td>
            <td>
              <b className={tone(dLuck)}>{x(dLuck)}</b>
            </td>
          </tr>
          <tr className="total">
            <td>Итоговая сила</td>
            <td className={b.attackerWon ? 'pos' : ''}>{fmt(b.attackerStrength)}</td>
            <td className={!b.attackerWon ? 'pos' : ''}>{fmt(b.defenderStrength)}</td>
          </tr>
        </tbody>
      </table>
      <div className="muted small">Сила = солдаты × генерал × военная мощь × местность × боевой дух × удача. Местность помогает только обороне.</div>
    </div>
  );
}
