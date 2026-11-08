import { useState } from 'react';
import { fmt } from '../core/format';
import { battleVisible } from '../core/intel';
import type { BattleReport, GameState, YearReport } from '../core/types';
import { battleStory, type Story } from './battleStory';
import { Card, Swatch } from './common';

function resultText(game: GameState, b: BattleReport): string {
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  if (b.field) return `победа ${b.attackerWon ? A.name : D.name} во встречном бою`;
  if (!b.attackerWon) return 'атака отбита';
  let s = `захвачено ${b.cellsTaken} кл.`;
  if (b.capitalTaken) s += ', взята столица';
  if (b.eliminated) s += ` — государство ${D.name} уничтожено!`;
  return s;
}

export function BattleLine({ game, b, viewer, year }: { game: GameState; b: BattleReport; viewer: number | null; year?: number }) {
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const mine = viewer != null && (b.attacker === viewer || b.defender === viewer);
  const good = viewer == null ? null : (b.attacker === viewer) === b.attackerWon;
  return (
    <div className={'battle' + (mine ? (good ? ' good' : ' bad') : '')}>
      {year !== undefined && <span className="muted small">{year} г. </span>}
      <Swatch color={A.color} />
      <b>{A.name}</b> {b.field ? '⚔' : '→'} <Swatch color={D.color} />
      <b>{D.name}</b>: {resultText(game, b)}
    </div>
  );
}

const W = 260;
const H = 110;

function Chart({ title, story, kind, colors }: { title: string; story: Story; kind: 'army' | 'morale'; colors: [string, string] }) {
  const pts = [story.start, ...story.rounds];
  const a = pts.map((p) => (kind === 'army' ? p.aArmy : p.aMorale));
  const d = pts.map((p) => (kind === 'army' ? p.dArmy : p.dMorale));
  const max = Math.max(1, ...a, ...d) * 1.05;
  const line = (vals: number[]) =>
    vals.map((v, i) => `${((i / (vals.length - 1)) * (W - 8) + 4).toFixed(1)},${(H - 6 - (v / max) * (H - 14)).toFixed(1)}`).join(' ');
  return (
    <div className="chart">
      <div className="chart-title">{title}</div>
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

export function BattleDetail({ game, b, viewer }: { game: GameState; b: BattleReport; viewer: number | null }) {
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const mine = viewer == null || b.attacker === viewer || b.defender === viewer;
  const det = b.details;
  const good = viewer == null ? null : (b.attacker === viewer) === b.attackerWon;

  if (!mine) {
    return (
      <div className="bdetail">
        <BattleLine game={game} b={b} viewer={viewer} />
        <div className="hint">Это сражение между соседями — подробностей ваша разведка не знает.</div>
      </div>
    );
  }
  const story = battleStory(game, b);
  const x = (v: number) => '×' + v.toFixed(2);

  return (
    <div className="bdetail">
      <div className={'bresult ' + (good === null ? '' : good ? 'good' : 'bad')}>
        {good === null ? '' : good ? 'Победа: ' : 'Поражение: '}
        {resultText(game, b)}
      </div>
      <div className="story-intro">
        {story.intro.map((l, k) => (
          <div key={k} className={'sline ' + (l.tone ?? '')}>
            {l.text}
          </div>
        ))}
      </div>

      {det && (
        <table className="forces">
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
                {det.def.militia > 0 && <span className="muted"> + ополчение {fmt(det.def.militia)}</span>}
              </td>
            </tr>
            <tr>
              <td>Генерал</td>
              <td>
                {b.attackerGeneral} {x(det.atk.gen)}
              </td>
              <td>
                {b.defenderGeneral ? (
                  <>
                    {b.defenderGeneral} {x(det.def.gen)}
                  </>
                ) : (
                  <span className="neg">нет ×0.50</span>
                )}
              </td>
            </tr>
            <tr>
              <td>Военная мощь</td>
              <td>{x(det.atk.mil)}</td>
              <td>{x(det.def.mil)}</td>
            </tr>
            {!b.field && (
              <>
                <tr>
                  <td>Местность</td>
                  <td>—</td>
                  <td>{x(det.def.terrain)}</td>
                </tr>
              </>
            )}
            <tr className="total">
              <td>Итоговая сила</td>
              <td className={b.attackerWon ? 'pos' : ''}>{fmt(b.attackerStrength)}</td>
              <td className={!b.attackerWon ? 'pos' : ''}>{fmt(b.defenderStrength)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="charts">
        <Chart title="Армия" story={story} kind="army" colors={[A.color, D.color]} />
        <Chart title="Мораль" story={story} kind="morale" colors={[A.color, D.color]} />
      </div>

      <div className="story">
        <div className="story-head">Ход боевых действий</div>
        {story.rounds.map((r, k) => (
          <div key={k} className="round">
            {r.lines.map((l, j) => (
              <div key={j} className={'sline ' + (l.tone ?? '')}>
                {l.text}
              </div>
            ))}
            <div className="sline muted small">
              Мораль: {A.name} {r.aMorale}%, {D.name} {r.dMorale}%
            </div>
          </div>
        ))}
      </div>

      <div className="bsum">
        <div>
          Потери: {A.name} — <b>{fmt(b.attackerLosses)}</b>, {D.name} — <b>{fmt(b.defenderLosses)}</b>
        </div>
        {b.cellsTaken > 0 && <div>Захвачено клеток: {b.cellsTaken}</div>}
        {b.capitalTaken && <div className="neg">Столица государства {D.name} взята!</div>}
        {b.generalLost && (
          <div className="neg">Генерал {b.generalLost === 'attacker' ? b.attackerGeneral : b.defenderGeneral} погиб в бою.</div>
        )}
      </div>
    </div>
  );
}

/** Окно итогов года: слева — что произошло со страной, справа — военные действия. */
export function YearView({
  game,
  rep,
  viewer,
  nbs,
  narrow,
  onOpenBattle,
}: {
  game: GameState;
  rep: YearReport;
  viewer: number | null;
  nbs: number[];
  narrow?: boolean;
  onOpenBattle?: (b: BattleReport, year: number) => void;
}) {
  const battles = rep.battles
    .filter((b) => battleVisible(viewer, nbs, b.attacker, b.defender))
    .sort((x, y) => {
      const mx = viewer != null && (x.attacker === viewer || x.defender === viewer) ? 0 : 1;
      const my = viewer != null && (y.attacker === viewer || y.defender === viewer) ? 0 : 1;
      return mx - my;
    });
  const [sel, setSel] = useState(0);
  const selected = battles[Math.min(sel, battles.length - 1)];
  const myEvents = rep.events.filter((e) => e.country === viewer);
  const world = rep.events.filter((e) => e.country === -1);

  return (
    <div className={'yearview' + (narrow ? ' narrow' : '')}>
      <div className="yv-col">
        {viewer != null && (
          <Card title="Ваша страна за год">
            {myEvents.length === 0 && battles.length === 0 && <div className="muted">Ничего не произошло.</div>}
            <div className="events">
              {battles
                .filter((b) => b.attacker === viewer || b.defender === viewer)
                .map((b, k) => {
                  const weAttack = b.attacker === viewer;
                  const other = game.countries[weAttack ? b.defender : b.attacker].name;
                  const won = weAttack === b.attackerWon;
                  let text: string;
                  if (b.field) text = `Встречный бой с армией государства ${other}: ${won ? 'победа' : 'поражение'}`;
                  else if (weAttack)
                    text = won
                      ? `Наши войска разбили государство ${other} и заняли ${b.cellsTaken} кл.` + (b.eliminated ? ' Государство уничтожено!' : '')
                      : `Наше наступление на государство ${other} отбито`;
                  else
                    text = won
                      ? `На нас напало государство ${other} — нападение отбито, враг потерял ${fmt(b.attackerLosses)} солдат!`
                      : `На нас напало государство ${other} и захватило ${b.cellsTaken} кл.` + (b.capitalTaken ? ' Столица пала!' : '');
                  return (
                    <div key={'b' + k} className={'ev ' + (won ? 'good' : 'bad')}>
                      ⚔ {text}
                      {onOpenBattle && (
                        <button className="link ev-report" onClick={() => onOpenBattle(b, rep.year)}>
                          донесение →
                        </button>
                      )}
                    </div>
                  );
                })}
              {myEvents.map((e, k) => (
                <div key={k} className={'ev ' + (e.good === true ? 'good' : e.good === false ? 'bad' : '')}>
                  {e.text}
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card title="В мире">
          <div className="events">
            <div className="ev">Цена зерна: {rep.price.toFixed(2)}</div>
            {world.map((e, k) => (
              <div key={k} className="ev">
                {e.text}
              </div>
            ))}
            {rep.eliminated.map((id) => (
              <div key={id} className="ev bad">
                Государство <Swatch color={game.countries[id].color} />
                {game.countries[id].name} прекратило существование
              </div>
            ))}
            {viewer == null &&
              rep.events
                .filter((e) => e.country >= 0)
                .map((e, k) => (
                  <div key={'e' + k} className={'ev ' + (e.good ? 'good' : 'bad')}>
                    {game.countries[e.country].name}: {e.text}
                  </div>
                ))}
          </div>
        </Card>
      </div>
      <div className="yv-col">
        <Card title="Военные действия">
          {battles.length === 0 && (
            <div className="muted">{viewer == null ? 'Сражений не было.' : 'Ни вы, ни ваши соседи не воевали.'}</div>
          )}
          <div className="blist">
            {battles.map((b, k) => {
              const A = game.countries[b.attacker];
              const D = game.countries[b.defender];
              const mine = viewer != null && (b.attacker === viewer || b.defender === viewer);
              const good = (b.attacker === viewer) === b.attackerWon;
              return (
                <button
                  key={k}
                  className={'brow' + (selected === b ? ' on' : '') + (mine ? (good ? ' good' : ' bad') : '')}
                  onClick={() => setSel(k)}
                >
                  <Swatch color={A.color} />
                  {A.name} {b.field ? '⚔' : '→'} <Swatch color={D.color} />
                  {D.name}
                  <span className="muted small"> · {resultText(game, b)}</span>
                </button>
              );
            })}
          </div>
          {viewer != null && <div className="hint">О войнах дальних стран вы узнаёте только по изменению границ.</div>}
        </Card>
        {selected && (
          <Card
            title="Битва"
            right={
              onOpenBattle && (viewer == null || selected.attacker === viewer || selected.defender === viewer) ? (
                <button className="btn small primary" onClick={() => onOpenBattle(selected, rep.year)}>
                  Полное донесение
                </button>
              ) : undefined
            }
          >
            <BattleDetail key={rep.year + ':' + sel} game={game} b={selected} viewer={viewer} />
          </Card>
        )}
      </div>
    </div>
  );
}

export function NewsPanel({
  game,
  viewer,
  nbs,
  onOpenBattle,
}: {
  game: GameState;
  viewer: number | null;
  nbs: number[];
  onOpenBattle?: (b: BattleReport, year: number) => void;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const reps = game.reports;
  if (!reps.length) return <div className="panel-body muted">Пока ничего не произошло. Завершите первый год.</div>;
  const i = idx ?? reps.length - 1;
  const rep = reps[Math.min(i, reps.length - 1)];
  return (
    <div className="panel-body">
      <div className="year-nav">
        <button className="btn small" disabled={i <= 0} onClick={() => setIdx(i - 1)}>
          ←
        </button>
        <b>{rep.year} год</b>
        <button className="btn small" disabled={i >= reps.length - 1} onClick={() => setIdx(i + 1)}>
          →
        </button>
      </div>
      <YearView key={rep.year} game={game} rep={rep} viewer={viewer} nbs={nbs} narrow onOpenBattle={onOpenBattle} />
    </div>
  );
}
