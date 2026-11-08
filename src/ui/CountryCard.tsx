import { scoutPrice } from '../core/balance';
import { allianceAgainst, disgraced, honorOf, rel, treatyBetween } from '../core/diplomacy';
import { fmtShort, pct, years } from '../core/format';
import type { Geo } from '../core/geo';
import { estimate, scoutReport } from '../core/intel';
import type { Country, GameState, General, Orders } from '../core/types';
import { AttackForm } from './AttackForm';
import { autoTasks } from './autoGenerals';
import { Honor, Mood, MOOD, moodLevel, Swatch } from './common';
import { Icon } from './icons';
import { chanceWord, Stars } from './opParts';
import { battleOdds } from '../core/estimate';

/**
 * Карточка страны по щелчку на карте: что о ней знает разведка, наши отношения
 * и поход на неё — всё в одном месте.
 */
export function CountryCard({
  game,
  geo,
  me,
  draft,
  setDraft,
  id,
  onClose,
  onDiplomacy,
}: {
  game: GameState;
  geo: Geo;
  me: Country;
  draft: Orders;
  setDraft: (f: (o: Orders) => Orders) => void;
  id: number;
  onClose: () => void;
  onDiplomacy: (id: number) => void;
}) {
  const c = game.countries[id];
  const neighbor = geo.neighbors[me.id].includes(id);
  const rep = scoutReport(game, me.id, id);
  const it = estimate(game, me.id, id, neighbor);
  const r = rel(game, id, me.id);
  const treaty = treatyBetween(game, me.id, id);
  const ally = treaty?.kind === 'alliance';
  const truce = game.settings.truceYears ?? 0;
  const inTruce = game.year <= truce;
  const scoutDraft = draft.scout ?? { hire: false, target: me.scoutTarget ?? null };
  const hasScoutNow = me.hasScout || scoutDraft.hire;
  const scoutGoing = hasScoutNow && scoutDraft.target === id;
  const price = scoutPrice(game.cellsPerCountry, game.year);
  const scout = () =>
    setDraft((o) => ({
      ...o,
      scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget ?? null }), ...(me.hasScout ? { target: id } : { hire: true, target: id }) },
    }));
  // Уже отданный приказ о походе на эту страну
  const taskOf = (g: General) => draft.tasks[g.id] ?? g.task;
  const planned = me.generals.filter((g) => !draft.dismissGenerals.includes(g.id)).filter((g) => {
    const t = taskOf(g);
    return t.type === 'attack' && t.target === id;
  });
  const cancel = (g: General) => setDraft((o) => ({ ...o, tasks: autoTasks(me, { ...o.tasks, [g.id]: { type: 'defend' } }, o.dismissGenerals) }));
  const ratio = it.known ? it.soldiers / Math.max(1, it.soldiers + me.soldiers) : null;

  if (!c.alive) {
    return (
      <div className="ccard" style={{ ['--c' as string]: c.color }}>
        <div className="ccard-head">
          <span className="ccard-name">
            <Swatch color={c.color} /> {c.name}
          </span>
          <button className="ccard-x" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="muted">
          Уничтожено в {c.eliminatedYear} году{c.eliminatedBy != null ? ` (${game.countries[c.eliminatedBy].name})` : ''}.
        </div>
      </div>
    );
  }

  return (
    <div className="ccard" style={{ ['--c' as string]: c.color }}>
      <div className="ccard-head">
        <span className="ccard-name">
          <Swatch color={c.color} /> {c.name}
        </span>
        {neighbor && <span className="tag nb">сосед</span>}
        <button className="ccard-x" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>
      <div className="ccard-facts">
        <span title="Территория">
          <Icon name="map" size={15} /> {pct(c.cells / game.map.landCells, 1)}
        </span>
        <span title="Население, тыс.">
          <Icon name="people" size={15} /> {fmtShort(c.population)}
        </span>
      </div>

      {/* Разведка */}
      <section className="ccard-sec">
        <div className="ccard-h">
          <Icon name="eye" size={15} /> Разведка
          {rep && (
            <span className="ccard-h-note">
              {rep.quality === 'full' ? 'полные' : 'примерные'} · {it.age ? `${years(it.age)} назад` : 'свежие'}
            </span>
          )}
        </div>
        {rep ? (
          <>
            <div className="ccard-intel">
              <div className="ccard-stat">
                <Icon name="shield" size={18} />
                <div>
                  <b>
                    {rep.quality === 'full' ? '' : '~'}
                    {fmtShort(rep.soldiers)}
                  </b>
                  <span>солдат</span>
                </div>
              </div>
              <div className="ccard-stat">
                <Icon name="swords" size={18} />
                <div>
                  <b>
                    {rep.quality === 'full' ? '' : '~'}
                    {rep.milLevel}
                  </b>
                  <span>военная мощь</span>
                </div>
              </div>
              <div className="ccard-stat">
                <Icon name="crown" size={18} />
                <div>
                  <b>{rep.generals.length ? <Stars exp={Math.max(...rep.generals.map((g) => g.exp))} /> : '—'}</b>
                  <span>{rep.quality === 'full' ? `генералов: ${rep.generals.length}` : 'лучший генерал'}</span>
                </div>
              </div>
            </div>
            {ratio != null && (
              <div className="ccard-vs" title="Их армия против нашей (середина — поровну)">
                <span>они {fmtShort(it.soldiers)}</span>
                <span className="op-vs big">
                  <i style={{ width: ratio * 100 + '%', background: c.color }} />
                </span>
                <span>мы {fmtShort(me.soldiers)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="ccard-unknown">Армия неизвестна — разведчик здесь не бывал.</div>
        )}
        <div className="ccard-actions">
          {scoutGoing ? (
            <span className="muted small">
              <Icon name="eye" size={13} /> разведчик отправится сюда в этом году
            </span>
          ) : (
            <button className="btn small" onClick={scout} disabled={!hasScoutNow && me.money < price}>
              <Icon name="eye" size={14} /> {hasScoutNow ? (rep ? 'Разведать снова' : 'Послать разведчика') : `Нанять разведчика · ${fmtShort(price)}`}
            </button>
          )}
        </div>
      </section>

      {/* Отношения */}
      <section className="ccard-sec">
        <div className="ccard-h">
          <Icon name="advisor" size={15} /> Отношения
        </div>
        <div className="ccard-rel">
          <Mood value={r} size={34} />
          <div>
            <b style={{ color: MOOD[moodLevel(r)].color }}>{MOOD[moodLevel(r)].label}</b>
            <div className="muted small">
              {treaty ? (ally ? `совместный поход до ${treaty.until} года` : `мир до ${treaty.until} года`) : 'договоров нет'}
              {disgraced(game, id) && ' · в опале'}
            </div>
          </div>
          <span className="ccard-honor" title="Честь этой страны">
            <Honor value={honorOf(game, id)} />
          </span>
        </div>
        {allianceAgainst(game, me.id, id) && <div className="muted small">У нас договор о совместном походе против этой страны.</div>}
        <div className="ccard-actions">
          <button className="btn small" onClick={() => onDiplomacy(id)}>
            Договориться
          </button>
        </div>
      </section>

      {/* Поход */}
      <section className="ccard-sec">
        <div className="ccard-h">
          <Icon name="flag" size={15} /> Поход
        </div>
        {planned.map((g) => {
          const t = taskOf(g);
          const o = t.type === 'attack' ? battleOdds(game, geo, me.id, id, g, t.soldiers) : null;
          return (
            <div className="op-camp" key={g.id} style={{ ['--c' as string]: c.color }}>
              <Icon name="swords" size={15} />
              <span>
                Идёт {g.name}: <b>{t.type === 'attack' ? fmtShort(t.soldiers) : 0}</b>
                {o && it.known && <span className={chanceWord(o.p).tone}> · шанс {chanceWord(o.p).text}</span>}
              </span>
              <button className="btn small ghost" onClick={() => cancel(g)}>
                Отменить
              </button>
            </div>
          );
        })}
        {!neighbor ? (
          <div className="muted small">Нет общей границы — войско сюда не дойдёт.</div>
        ) : inTruce ? (
          <div className="muted small">Мирное время — нападать нельзя никому ещё {years(truce - game.year + 1)}.</div>
        ) : planned.length === 0 ? (
          <AttackForm key={id} game={game} geo={geo} me={me} draft={draft} setDraft={setDraft} tgt={id} />
        ) : null}
      </section>
    </div>
  );
}
