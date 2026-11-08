import { useState } from 'react';
import { battleLosses, captureAmount, scoutPrice } from '../core/balance';
import { treatyBetween } from '../core/diplomacy';
import { battleOdds } from '../core/estimate';
import { fmtShort, years } from '../core/format';
import type { Geo } from '../core/geo';
import { estimate } from '../core/intel';
import type { Country, GameState, General, GeneralTask, Orders } from '../core/types';
import { autoTasks, pickAttacker } from './autoGenerals';
import { Icon } from './icons';
import { Amount, chanceWord, Meter, Stars } from './opParts';

/**
 * Поход на соседа: сколько солдат отправить, шанс победы, кнопка «В поход!».
 * Общая для «Приказов» и карточки страны на карте.
 */
export function AttackForm({
  game,
  geo,
  me,
  draft,
  setDraft,
  tgt,
  onSent,
  onDiplomacy,
}: {
  game: GameState;
  geo: Geo;
  me: Country;
  draft: Orders;
  setDraft: (f: (o: Orders) => Orders) => void;
  tgt: number;
  onSent?: () => void;
  onDiplomacy?: (id: number) => void;
}) {
  const generals = me.generals.filter((g) => !draft.dismissGenerals.includes(g.id));
  const taskOf = (g: General): GeneralTask => draft.tasks[g.id] ?? g.task;
  const sent = generals.reduce((a, g) => {
    const t = taskOf(g);
    return a + (t.type === 'attack' ? t.soldiers : 0);
  }, 0);
  const avail = Math.max(0, me.soldiers - sent);
  const gen = pickAttacker(me, draft.tasks);
  const [pick, setPick] = useState<number | null>(null);
  const army = Math.min(avail, pick ?? Math.floor((avail * 0.5) / 100) * 100);
  const odds = gen && army > 0 ? battleOdds(game, geo, me.id, tgt, gen, army) : null;
  const intel = estimate(game, me.id, tgt, true);
  const expectCells = (() => {
    if (!odds || !gen) return 0;
    const tc = game.countries[tgt];
    const surv = army * (1 - battleLosses(Math.min(odds.ratio, 1 / Math.max(0.01, odds.ratio))).win);
    return captureAmount(game.cellsPerCountry, tc.cells, gen, odds.ratio, 0.5, surv, tc.population / Math.max(1, tc.cells));
  })();
  const scoutDraft = draft.scout ?? { hire: false, target: me.scoutTarget ?? null };
  const hasScoutNow = me.hasScout || scoutDraft.hire;
  const scoutIt = () =>
    setDraft((o) => ({
      ...o,
      scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget ?? null }), ...(me.hasScout ? { target: tgt } : { hire: true, target: tgt }) },
    }));
  const treaty = treatyBetween(game, me.id, tgt);

  const send = () => {
    if (!gen || army <= 0) return;
    setDraft((o) => ({
      ...o,
      tasks: autoTasks(me, { ...o.tasks, [gen.id]: { type: 'attack', target: tgt, soldiers: army } }, o.dismissGenerals),
    }));
    setPick(null);
    onSent?.();
  };

  if (!gen) return <div className="warn-box">Нет свободного генерала — купите генерала в «Приказах».</div>;
  return (
    <div className="op-attack">
      <div className="op-attack-head">
        <span>
          Ведёт <b>{gen.name}</b> <Stars exp={gen.exp} />
        </span>
        <span className="op-big">{fmtShort(army)}</span>
      </div>
      <Amount max={avail} value={army} onChange={setPick} />
      {treaty && <div className="warn-box">У нас договор — нападение будет предательством.</div>}
      <div className="op-chance">
        {!intel.known ? (
          <>
            <span className="op-chance-label">
              Шанс: <b className="muted">?</b>
            </span>
            {hasScoutNow && scoutDraft.target === tgt ? (
              <span className="muted small">разведчик идёт туда</span>
            ) : (
              <button className="btn small" onClick={scoutIt}>
                <Icon name="eye" size={14} /> {hasScoutNow ? 'Разведать' : `Разведчик · ${fmtShort(scoutPrice(game.cellsPerCountry, game.year))}`}
              </button>
            )}
          </>
        ) : (
          odds && (
            <>
              <span className="op-chance-label">
                Шанс: <b className={chanceWord(odds.p).tone}>{chanceWord(odds.p).text}</b>
              </span>
              <Meter value={odds.p} tone={chanceWord(odds.p).tone} />
              <span className="muted small">
                {expectCells > 0 ? `≈${expectCells} кл.` : ''}
                {intel.age ? ` · данные ${years(intel.age)} назад` : ''}
              </span>
            </>
          )
        )}
      </div>
      <div className="op-attack-buttons">
        <button className="btn primary op-go" onClick={send} disabled={army <= 0}>
          <Icon name="swords" size={16} /> {treaty ? 'Нарушить договор' : 'В поход!'}
        </button>
        {onDiplomacy && (
          <button className="btn" onClick={() => onDiplomacy(tgt)}>
            Договориться
          </button>
        )}
      </div>
    </div>
  );
}
