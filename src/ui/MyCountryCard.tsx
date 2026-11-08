import { useState } from 'react';
import { B, scoutPrice } from '../core/balance';
import { forecast } from '../core/econ';
import { disgraced, honorOf, rel, treatyBetween } from '../core/diplomacy';
import { battleOdds } from '../core/estimate';
import { fmtShort, pct, years } from '../core/format';
import type { Geo } from '../core/geo';
import { estimate } from '../core/intel';
import type { Country, GameState, General, GeneralTask, Orders } from '../core/types';
import { autoTasks, rosterOf } from './autoGenerals';
import { Honor, Mood } from './common';
import { Icon } from './icons';
import { chanceWord, initials, Stars, strengthWord } from './opParts';
import { Portrait, rulerOf } from './rulers';

/**
 * Карточка своей страны (щелчок по ней на карте или по названию вверху): генералы — задачи,
 * найм и увольнение; разведчик; соседи — на кого напасть и с кем договориться.
 */
export function MyCountryCard({
  game,
  geo,
  me,
  draft,
  setDraft,
  onClose,
  onOpenCountry,
}: {
  game: GameState;
  geo: Geo;
  me: Country;
  draft: Orders;
  setDraft: (f: (o: Orders) => Orders) => void;
  onClose: () => void;
  onOpenCountry: (id: number, deal: boolean) => void;
}) {
  const ruler = rulerOf(game, me.id);
  const taskOf = (g: General): GeneralTask => draft.tasks[g.id] ?? g.task;
  const dismissed = (g: General) => draft.dismissGenerals.includes(g.id);
  const setTask = (g: General, type: 'defend' | 'study') =>
    setDraft((o) => {
      const tasks = { ...o.tasks, [g.id]: { type } as GeneralTask };
      // Новый командир обороны — прежний идёт учиться (обороной командует один)
      if (type === 'defend')
        for (const x of rosterOf(me, o.dismissGenerals, o.buyOffers)) if (x.id !== g.id && (tasks[x.id] ?? x.task).type === 'defend') tasks[x.id] = { type: 'study' };
      return { ...o, tasks };
    });
  const cancelAttack = (g: General) =>
    setDraft((o) => ({ ...o, tasks: autoTasks(me, { ...o.tasks, [g.id]: { type: 'study' } }, o.dismissGenerals, o.buyOffers) }));
  const toggleDismiss = (g: General) =>
    setDraft((o) => {
      const on = o.dismissGenerals.includes(g.id);
      const dismissGenerals = on ? o.dismissGenerals.filter((x) => x !== g.id) : [...o.dismissGenerals, g.id];
      return { ...o, dismissGenerals, tasks: autoTasks(me, { ...o.tasks, [g.id]: { type: 'study' } }, dismissGenerals, o.buyOffers) };
    });
  // Купленный генерал сразу в строю: ему можно дать задачу и отправить в поход в этом же году
  const toggleBuy = (id: number) =>
    setDraft((o) => {
      const on = o.buyOffers.includes(id);
      const buyOffers = on ? o.buyOffers.filter((x) => x !== id) : [...o.buyOffers, id];
      const tasks = { ...o.tasks };
      if (on) delete tasks[id];
      return { ...o, buyOffers, tasks: autoTasks(me, tasks, o.dismissGenerals, buyOffers) };
    });
  const roster = rosterOf(me, [], draft.buyOffers);
  const bought = (g: General) => draft.buyOffers.includes(g.id);
  const full = roster.length - draft.dismissGenerals.length >= B.maxGenerals;
  const fcNow = forecast(game, geo, me, draft);
  const cash = me.money + fcNow.onceIn - fcNow.spend; // сколько осталось после уже выбранных покупок
  const [market, setMarket] = useState(me.generals.length === 0);

  const scoutDraft = draft.scout ?? { hire: false, target: me.scoutTarget ?? null };
  const hasScoutNow = me.hasScout || scoutDraft.hire;
  const price = scoutPrice(game.cellsPerCountry, game.year);
  const setScout = (patch: Partial<{ hire: boolean; target: number | null }>) =>
    setDraft((o) => ({ ...o, scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget ?? null }), ...patch } }));

  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const truce = game.settings.truceYears ?? 0;
  const inTruce = game.year <= truce;

  return (
    <div className="ccard mine" style={{ ['--c' as string]: me.color }}>
      <div className="ccard-head">
        <Portrait ruler={ruler} color={me.color} size={58} />
        <div className="ccard-who">
          <span className="ccard-name">
            {me.name}
            <span className="tag">ваша страна</span>
          </span>
          <span className="ccard-ruler">
            {ruler.title} {ruler.name}
          </span>
          <span className="ccard-war" title="Ваша честь">
            <Honor value={honorOf(game, me.id)} />
            {disgraced(game, me.id) && <span className="neg">в опале</span>}
          </span>
        </div>
        <button className="ccard-x" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>
      <div className="ccard-facts">
        <span title="Территория">
          <Icon name="map" size={15} /> {pct(me.cells / game.map.landCells, 1)}
        </span>
        <span title="Население, тыс.">
          <Icon name="people" size={15} /> {fmtShort(me.population)}
        </span>
        <span title="Солдаты, тыс.">
          <Icon name="shield" size={15} /> {fmtShort(me.soldiers)}
        </span>
        <span title="Учёные, тыс.">
          <Icon name="flask" size={15} /> {fmtShort(me.scientists)}
        </span>
      </div>

      <div className="ccard-body">
        <div className="ccard-col">
          <section className="ccard-sec">
            <div className="ccard-h">
              <Icon name="crown" size={15} /> Генералы
              <button className={'btn small ccard-h-btn ' + (market ? 'on' : '')} onClick={() => setMarket(!market)}>
                {market ? 'Скрыть рынок' : '+ Купить'}
              </button>
            </div>
            <div className="mg-list">
              {roster.map((g) => {
                const t = taskOf(g);
                const off = dismissed(g);
                const fresh = bought(g);
                return (
                  <div className={'mg' + (off ? ' off' : '') + (t.type === 'attack' ? ' atk' : t.type === 'defend' ? ' def' : ' study')} key={g.id}>
                    <span className="op-ava">{initials(g.name)}</span>
                    <div className="mg-main">
                      <b>
                        {g.name}
                        {fresh && <span className="tag new-gen">куплен</span>}
                      </b>
                      <span className="muted small">
                        {years(g.age)} · <Stars exp={g.exp} /> · скор. {g.speed} · ум {g.intellect}
                      </span>
                      {off ? (
                        <span className="neg small">будет уволен в конце года</span>
                      ) : t.type === 'attack' ? (
                        <span className="mg-task">
                          <Icon name="swords" size={13} /> поход: {game.countries[t.target]?.name} · {fmtShort(t.soldiers)}
                          <button className="link" onClick={() => cancelAttack(g)}>
                            отменить
                          </button>
                        </span>
                      ) : (
                        <span className="mg-seg">
                          <button className={t.type === 'defend' ? 'on' : ''} onClick={() => setTask(g, 'defend')} title="Командует обороной страны">
                            <Icon name="shield" size={13} /> Оборона
                          </button>
                          <button className={t.type === 'study' ? 'on' : ''} onClick={() => setTask(g, 'study')} title={`Учится: за год наберёт опыта (больше при высоком уме — ${g.intellect})`}>
                            <Icon name="bulb" size={13} /> Учёба
                          </button>
                        </span>
                      )}
                    </div>
                    {fresh ? (
                      <button className="ccard-x mg-x" onClick={() => toggleBuy(g.id)} title="Отменить покупку — деньги вернутся">
                        ↺
                      </button>
                    ) : (
                      <button className="ccard-x mg-x" onClick={() => toggleDismiss(g)} title={off ? 'Не увольнять' : 'Уволить генерала'}>
                        {off ? '↺' : '✕'}
                      </button>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && <div className="muted small">Генералов нет — без командира армия не наступает и обороняется вполсилы.</div>}
            </div>
            {market && (
              <div className="mg-list market">
                {me.offers
                  .filter((g) => !draft.buyOffers.includes(g.id))
                  .map((g) => {
                  const on = false;
                  return (
                    <div className={'mg' + (on ? ' buy' : '')} key={g.id}>
                      <span className="op-ava">{initials(g.name)}</span>
                      <div className="mg-main">
                        <b>{g.name}</b>
                        <span className="muted small">
                          {years(g.age)} · <Stars exp={g.exp} /> · скор. {g.speed} · ум {g.intellect}
                        </span>
                      </div>
                      <button
                        className={'btn small ' + (on ? 'on' : '')}
                        onClick={() => toggleBuy(g.id)}
                        disabled={full || g.price > cash}
                        title={full ? `Не больше ${B.maxGenerals} генералов` : g.price > cash ? 'Не хватает денег' : 'Купить — генерал сразу встанет в строй'}
                      >
                        {on ? 'Покупаю ✓' : (
                          <>
                            <Icon name="coins" size={13} /> {fmtShort(g.price)}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
                <div className="muted small">Купленный генерал сразу в строю: можно дать задачу и отправить в поход в этом же году.</div>
              </div>
            )}
          </section>

          <section className="ccard-sec">
            <div className="ccard-h">
              <Icon name="eye" size={15} /> Разведчик
            </div>
            {hasScoutNow ? (
              <div className="op-scout flat">
                <span>Разведать:</span>
                <select value={scoutDraft.target ?? ''} onChange={(e) => setScout({ target: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">— отдыхает —</option>
                  {nbs.map((n) => {
                    const it = estimate(game, me.id, n, geo);
                    return (
                      <option key={n} value={n}>
                        {game.countries[n].name}
                        {it.known ? ` (данные ${it.age ? years(it.age) + ' назад' : 'свежие'})` : ' (нет данных)'}
                      </option>
                    );
                  })}
                  <optgroup label="Дальние страны">
                    {game.countries
                      .filter((c) => c.alive && c.id !== me.id && !nbs.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {scoutDraft.hire && !me.hasScout && (
                  <button className="link muted" onClick={() => setScout({ hire: false })} title={`Не нанимать (${fmtShort(price)})`}>
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <div className="op-scout flat">
                <span className="muted">Нет — силы соседей неизвестны</span>
                <button className="btn small" onClick={() => setScout({ hire: true })} disabled={me.money < price}>
                  Нанять · <Icon name="coins" size={13} /> {fmtShort(price)}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="ccard-col">
          <section className="ccard-sec">
            <div className="ccard-h">
              <Icon name="flag" size={15} /> Соседи
              {inTruce && <span className="ccard-h-note">мир ещё {years(truce - game.year + 1)}</span>}
            </div>
            <div className="nb-list">
              {nbs.map((n) => {
                const c = game.countries[n];
                const it = estimate(game, me.id, n, geo);
                const w = strengthWord(it, me.soldiers);
                const treaty = treatyBetween(game, me.id, n);
                const going = roster.find((g) => {
                  const t = taskOf(g);
                  return t.type === 'attack' && t.target === n && !dismissed(g);
                });
                const gt = going ? taskOf(going) : null;
                const o = going && gt?.type === 'attack' ? battleOdds(game, geo, me.id, n, going, gt.soldiers) : null;
                return (
                  <div className="nb" key={n} style={{ ['--c' as string]: c.color }}>
                    <button className="nb-name" onClick={() => onOpenCountry(n, false)} title="Открыть карточку страны">
                      <Mood value={rel(game, n, me.id)} size={17} />
                      <b>{c.name}</b>
                    </button>
                    <span className={'nb-info ' + w.tone}>
                      <Icon name={it.known ? 'shield' : 'eye'} size={12} /> {w.text}
                      {treaty && <span className="muted"> · {treaty.kind === 'alliance' ? 'союз' : 'мир'}</span>}
                      {going && (
                        <span className="warn">
                          {' '}
                          · идём{o && it.known ? `, шанс ${chanceWord(o.p).text}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="nb-btns">
                      <button className="btn small" onClick={() => onOpenCountry(n, false)} disabled={inTruce} title={inTruce ? 'Мирное время — нападать нельзя' : 'Поход'}>
                        <Icon name="swords" size={13} />
                      </button>
                      <button className="btn small" onClick={() => onOpenCountry(n, true)} title="Договориться">
                        Мир…
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="muted small">Щёлкните по стране — откроется её карточка: разведка, поход, переговоры.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
