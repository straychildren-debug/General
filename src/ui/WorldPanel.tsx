import { PERSONALITY_NAMES } from '../ai/ai';
import { fmtShort, pct, years } from '../core/format';
import { areNeighbors, type Geo } from '../core/geo';
import { battleVisible, estimate, scoutReport } from '../core/intel';
import type { GameState } from '../core/types';
import { Card, Mood, Row, Swatch } from './common';
import { rel, treatyBetween } from '../core/diplomacy';
import { BattleLine } from './NewsPanel';

interface Props {
  game: GameState;
  geo: Geo;
  viewer: number | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
  /** Куда разведчик идёт в этом году (черновик приказа) */
  scoutTarget?: number | null;
  onScout?: (id: number) => void;
}

export function WorldPanel({ game, geo, viewer, selected, onSelect, scoutTarget, onScout }: Props) {
  const land = game.map.landCells;
  // Сначала своя страна, затем соседи, затем остальные — по размеру территории
  const rank = (id: number) => (id === viewer ? 0 : viewer != null && areNeighbors(geo, viewer, id) ? 1 : 2);
  const alive = game.countries
    .filter((c) => c.alive)
    .sort((a, b) => rank(a.id) - rank(b.id) || b.cells - a.cells);
  const dead = game.countries.filter((c) => !c.alive).sort((a, b) => (b.eliminatedYear ?? 0) - (a.eliminatedYear ?? 0));
  // Наблюдатель видит всё; игрок — себя и соседей
  const est = (id: number) => estimate(game, viewer ?? id, id, viewer == null || areNeighbors(geo, viewer, id));
  const sel = selected != null ? game.countries[selected] : null;
  const selEst = sel && sel.alive ? est(sel.id) : null;
  const approx = (exact: boolean) => (exact ? '' : '~');

  return (
    <div className="panel-body">
      {sel && (
        <Card
          title={
            <>
              <Swatch color={sel.color} /> {sel.name}
            </>
          }
          right={
            <button className="link" onClick={() => onSelect(null)}>
              закрыть
            </button>
          }
        >
          {sel.playerName && <Row label="Правитель" value={sel.playerName} />}
          {viewer == null && sel.controller === 'ai' && <Row label="Характер" value={PERSONALITY_NAMES[sel.personality]} />}
          {!sel.alive || !selEst ? (
            <Row label="Судьба" value={`уничтожено в ${sel.eliminatedYear} году (${game.countries[sel.eliminatedBy!].name})`} tone="neg" />
          ) : (
            <>
              <Row label="Территория" value={`${sel.cells} клеток · ${pct(sel.cells / land, 1)}`} />
              <Row label="Население" value={fmtShort(selEst.population)} />
              {viewer == null || viewer === sel.id ? (
                <>
                  <Row label="Солдаты" value={fmtShort(selEst.soldiers)} />
                  <Row label="Учёные" value={fmtShort(selEst.scientists)} />
                  <Row label="Казна" value={fmtShort(selEst.money)} />
                  <Row label="Генералы" value={`${selEst.generals}, лучший опыт ${Math.round(selEst.bestExp)}`} />
                  <Row label="Уровни наук" value={selEst.levels.join(' · ')} hint="Деньги · Сельск. хоз. · Плотность · Рост · Военная мощь · Наука" />
                </>
              ) : (
                <ScoutInfo game={game} viewer={viewer} id={sel.id} going={scoutTarget === sel.id} onScout={onScout} />
              )}
            </>
          )}
          <RecentBattles game={game} geo={geo} id={sel.id} viewer={viewer} />
        </Card>
      )}

      <Card title={`Державы · ${alive.length} из ${game.countries.length}`}>
        <table className="world">
          <thead>
            <tr>
              <th>Страна</th>
              <th>Земля</th>
              <th>Население</th>
              <th>Солдаты</th>
            </tr>
          </thead>
          <tbody>
            {alive.map((c) => {
              const e = est(c.id);
              const nb = viewer != null && viewer !== c.id && areNeighbors(geo, viewer, c.id);
              return (
                <tr
                  key={c.id}
                  className={(c.id === selected ? 'sel ' : '') + (c.id === viewer ? 'me' : '')}
                  onClick={() => onSelect(c.id === selected ? null : c.id)}
                >
                  <td>
                    {viewer != null && c.id !== viewer ? <Mood value={rel(game, c.id, viewer)} size={15} /> : <Swatch color={c.color} />} {c.name}
                    {c.playerName && <span className="tag">{c.playerName}</span>}
                    {nb && <span className="tag nb">сосед</span>}
                    {viewer != null && treatyBetween(game, viewer, c.id) && <span className="tag">мир</span>}
                  </td>
                  <td>
                    <div className="terr">
                      <div style={{ width: Math.min(100, (c.cells / land) * 100 * 3) + '%', background: c.color }} />
                    </div>
                    <span className="small">{pct(c.cells / land, 1)}</span>
                  </td>
                  <td>{fmtShort(e.population)}</td>
                  <td>{e.visible ? approx(e.exact) + fmtShort(e.soldiers) : <span className="muted">?</span>}{e.age ? <span className="muted small"> · {years(e.age)} назад</span> : null}</td>
                </tr>
              );
            })}
            {dead.map((c) => (
              <tr key={c.id} className="dead" onClick={() => onSelect(c.id)}>
                <td>
                  <Swatch color={c.color} /> {c.name}
                </td>
                <td colSpan={3} className="muted small">
                  уничтожено в {c.eliminatedYear} г. — {game.countries[c.eliminatedBy!].name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint">
          О чужих странах известны только территория и население. Армию узнаёт разведчик: «~» — примерные сведения, «?» — разведки не было.
        </div>
      </Card>
    </div>
  );
}

function RecentBattles({ game, geo, id, viewer }: { game: GameState; geo: Geo; id: number; viewer: number | null }) {
  const nbs = viewer != null ? geo.neighbors[viewer] : [];
  const rows = game.reports
    .slice(-5)
    .reverse()
    .flatMap((r) =>
      r.battles
        .filter((b) => (b.attacker === id || b.defender === id) && battleVisible(viewer, nbs, b.attacker, b.defender))
        .map((b) => ({ b, year: r.year })),
    );
  if (!rows.length) return <div className="muted small">Известных вам сражений за последние годы нет.</div>;
  return (
    <div className="recent">
      <div className="muted small">Сражения последних лет:</div>
      {rows.slice(0, 8).map(({ b, year }, k) => (
        <BattleLine key={k} game={game} b={b} viewer={viewer} year={year} />
      ))}
    </div>
  );
}

function ScoutInfo({ game, viewer, id, going, onScout }: { game: GameState; viewer: number; id: number; going: boolean; onScout?: (id: number) => void }) {
  const rep = scoutReport(game, viewer, id);
  const it = estimate(game, viewer, id);
  const btn = onScout && !going && (
    <button className="link" onClick={() => onScout(id)}>
      {game.countries[viewer].hasScout ? 'послать разведчика' : 'нанять разведчика'}
    </button>
  );
  const goingNote = going && <span className="muted small">разведчик отправится туда в этом году</span>;
  if (!rep)
    return (
      <div className="fog">
        Армия неизвестна — разведки не было. {btn}
        {goingNote}
      </div>
    );
  const full = rep.quality === 'full';
  const a = full ? '' : '~';
  return (
    <>
      <Row
        label="Разведка"
        value={`донесение ${rep.year}-го года · ${full ? 'полные сведения' : 'частичные сведения'}${it.age ? ` · ${years(it.age)} назад` : ''}`}
        tone="muted"
      />
      <Row label="Солдаты" value={a + fmtShort(rep.soldiers)} />
      <Row label="Военная мощь" value={`${a}${rep.milLevel} ур.`} />
      <Row
        label="Генералы"
        value={
          rep.generals.length === 0
            ? 'нет'
            : full
              ? rep.generals.map((g) => Math.round(g.exp)).join(', ') + ' (опыт)'
              : `лучший — опыт ~${Math.round(rep.generals[0].exp)}`
        }
      />
      <div className="small">
        {btn ? <>Сведения устаревают — {btn}</> : goingNote}
      </div>
    </>
  );
}