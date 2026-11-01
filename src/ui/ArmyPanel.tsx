import { useEffect, useRef, useState } from 'react';
import { attackFactor, B, defendFactor, fortCost, generalUpkeep, genFactor, studyGain, TRAIT_INFO } from '../core/balance';
import { battleOdds } from '../core/estimate';
import { fmt, fmtShort, pct } from '../core/format';
import { estimate } from '../core/intel';
import type { General, GeneralTask } from '../core/types';
import { Card, Seg, Slider, Swatch, type PanelProps } from './common';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
}

function Traits({ g }: { g: General }) {
  if (!g.traits.length) return null;
  return (
    <span className="traits inline">
      {g.traits.map((t) => (
        <span key={t} className={'trait ' + (TRAIT_INFO[t].good ? '' : 'bad')} title={TRAIT_INFO[t].desc}>
          {TRAIT_INFO[t].name}
        </span>
      ))}
    </span>
  );
}

function statLine(g: General): string {
  return `опыт ${Math.round(g.exp)} (×${genFactor(g.exp).toFixed(2)}) · скорость ${g.speed} · ум ${g.intellect}`;
}

export function ArmyPanel({ game, geo, me, draft, setDraft, target, onTarget }: Props) {
  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const generals = me.generals.filter((g) => !draft.dismissGenerals.includes(g.id));
  const taskOf = (g: General): GeneralTask => draft.tasks[g.id] ?? g.task;
  const campaigns = generals.filter((g) => taskOf(g).type === 'attack');
  const sent = campaigns.reduce((a, g) => {
    const t = taskOf(g);
    return a + (t.type === 'attack' ? t.soldiers : 0);
  }, 0);
  const avail = Math.max(0, me.soldiers - sent);
  const defenders = generals.filter((g) => taskOf(g).type === 'defend');
  const bestDef = defenders.reduce<General | null>((a, g) => (!a || defendFactor(g) > defendFactor(a) ? g : a), null);
  const cpc = game.cellsPerCountry;
  const truce = game.settings.truceYears ?? 0;
  const inTruce = game.year <= truce;

  // Для нового похода — свободные генералы; лучший в наступлении идёт первым
  const free = generals
    .filter((g) => taskOf(g).type !== 'attack')
    .sort((a, b) => attackFactor(b) * (1 + 0.04 * b.speed) - attackFactor(a) * (1 + 0.04 * a.speed));
  const tgt = target != null && nbs.includes(target) ? target : null;
  const [genId, setGenId] = useState<number | null>(null);
  const gen = free.find((g) => g.id === genId) ?? (free.length > 1 && free[0] === bestDef ? free[1] : free[0]) ?? null;
  // Число солдат: по умолчанию 60% свободных, пока игрок не сдвинул ползунок для этой цели
  const [pick, setPick] = useState<{ t: number | null; v: number } | null>(null);
  const army = Math.min(pick && pick.t === tgt ? pick.v : Math.floor((avail * 0.6) / 100) * 100, avail);
  const setSoldiers = (v: number) => setPick({ t: tgt, v });
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tgt != null) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tgt]);
  const odds = tgt != null && gen ? battleOdds(game, geo, me.id, tgt, gen, army) : null;

  const setTask = (id: number, t: GeneralTask) => setDraft((o) => ({ ...o, tasks: { ...o.tasks, [id]: t } }));
  const toggle = (key: 'buyOffers' | 'dismissGenerals' | 'buildForts', id: number) =>
    setDraft((o) => ({ ...o, [key]: o[key].includes(id) ? o[key].filter((x) => x !== id) : [...o[key], id] }));

  const send = () => {
    if (tgt == null || !gen || army <= 0) return;
    setTask(gen.id, { type: 'attack', target: tgt, soldiers: army });
    setGenId(null);
    setPick(null);
    onTarget(null);
  };

  return (
    <div className="panel-body">
      <Card title="Наступление">
        {inTruce ? (
          <div className="truce">Перемирие до конца {truce} года: нападать нельзя никому. Готовьте армию — соседи тоже готовятся.</div>
        ) : (
          <>
            <div className="hint first">Выберите, на кого напасть, — здесь или щелчком по соседу на карте.</div>
            <div className="targets">
              {nbs.map((n) => {
                const c = game.countries[n];
                const e = estimate(game, me.id, n, true);
                const busy = campaigns.some((g) => {
                  const t = taskOf(g);
                  return t.type === 'attack' && t.target === n;
                });
                return (
                  <button key={n} className={'target' + (tgt === n ? ' on' : '')} onClick={() => onTarget(tgt === n ? null : n)}>
                    <Swatch color={c.color} />
                    <span className="target-name">{c.name}</span>
                    <span className="muted small">~{fmtShort(e.soldiers)} солд.</span>
                    {busy && <span className="tag">поход</span>}
                  </button>
                );
              })}
            </div>

            {tgt != null && (
              <div className="attack-form" ref={formRef}>
                <div className="attack-title">
                  Цель похода: <Swatch color={game.countries[tgt].color} />
                  <b>{game.countries[tgt].name}</b>
                </div>
                {!gen ? (
                  <div className="warn-box">
                    Свободных генералов нет — без генерала солдаты не наступают. Купите генерала ниже или отмените другой
                    поход.
                  </div>
                ) : (
                  <>
                    <div className="form-row">
                      <span className="muted">Генерал</span>
                      <select value={gen.id} onChange={(e) => setGenId(Number(e.target.value))}>
                        {free.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} — опыт {Math.round(g.exp)}, скорость {g.speed}
                            {g === bestDef ? ' (сейчас в обороне)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-row">
                      <span className="muted">Солдат</span>
                      <b>{fmt(army)}</b>
                      <span className="muted small">из {fmt(avail)} свободных</span>
                    </div>
                    <Slider value={army} min={0} max={avail} step={100} onChange={setSoldiers} />
                    {odds && (
                      <div className="odds big">
                        <span>
                          Шанс победы{' '}
                          <b className={odds.p >= 0.7 ? 'pos' : odds.p >= 0.4 ? 'warn' : 'neg'}>{pct(odds.p)}</b>
                        </span>
                        <span className="muted small">по данным разведки (±{Math.round(odds.err * 100)}%)</span>
                      </div>
                    )}
                    <button className="btn primary wide" onClick={send} disabled={army <= 0}>
                      Отправить в поход
                    </button>
                    {gen === bestDef && defenders.length === 1 && (
                      <div className="hint">Этот генерал сейчас командует обороной — дома гарнизон останется без командира.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {campaigns.length > 0 && (
          <div className="campaigns">
            <div className="muted small">Походы этого года:</div>
            {campaigns.map((g) => {
              const t = taskOf(g);
              if (t.type !== 'attack') return null;
              const c = game.countries[t.target];
              const o = c?.alive ? battleOdds(game, geo, me.id, t.target, g, t.soldiers) : null;
              return (
                <div className="campaign" key={g.id}>
                  <span>
                    {g.name} → <Swatch color={c.color} />
                    <b>{c.name}</b>, {fmt(t.soldiers)} солд.
                    {o && <span className={o.p >= 0.7 ? 'pos' : o.p >= 0.4 ? 'warn' : 'neg'}> · {pct(o.p)}</span>}
                  </span>
                  <button className="btn small ghost" onClick={() => setTask(g.id, { type: 'defend' })}>
                    Отменить
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Войско" right={<b>{fmt(me.soldiers)}</b>}>
        <div className="army-sum">
          <span>
            в походах <b>{fmt(sent)}</b>
          </span>
          <span>
            дома <b>{fmt(avail)}</b>
          </span>
          <span className={bestDef ? '' : 'neg'}>
            оборону ведёт <b>{bestDef ? bestDef.name : 'никто (вполсилы!)'}</b>
          </span>
        </div>
        <div className="hint">Набрать солдат — во вкладке «Хозяйство». Новобранцы прибывают к концу года.</div>
      </Card>

      <Card title={`Генералы · ${generals.length}/${B.maxGenerals}`}>
        {generals.length === 0 && <div className="muted">Генералов нет. Без генерала солдаты не могут наступать.</div>}
        <div className="glist">
          {generals.map((g) => {
            const t = taskOf(g);
            return (
              <div className="grow" key={g.id}>
                <div className="grow-main">
                  <div>
                    <b>{g.name}</b> <span className="muted small">{g.age} лет</span> <Traits g={g} />
                  </div>
                  <div className="muted small">{statLine(g)}</div>
                </div>
                {t.type === 'attack' ? (
                  <span className="tag">в походе на {game.countries[t.target]?.name}</span>
                ) : (
                  <Seg<'defend' | 'study'>
                    value={t.type}
                    onChange={(v) => setTask(g.id, { type: v })}
                    options={[
                      { value: 'defend', label: 'Оборона' },
                      { value: 'study', label: 'Учёба', title: `+${studyGain(g).toFixed(1)} опыта за год` },
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="hint">
          Оборону ведёт самый опытный генерал из тех, кто на «Обороне». «Учёба» — рост опыта, но в боях генерал не участвует.
        </div>
      </Card>

      <details className="card more" open={generals.length < 2}>
        <summary>Купить генерала</summary>
        <div className="glist">
          {me.offers.map((g) => {
            const on = draft.buyOffers.includes(g.id);
            return (
              <div className={'grow' + (on ? ' chosen' : '')} key={g.id}>
                <div className="grow-main">
                  <div>
                    <b>{g.name}</b> <span className="muted small">{g.age} лет</span> <Traits g={g} />
                  </div>
                  <div className="muted small">
                    {statLine(g)} · содержание {fmtShort(generalUpkeep(g, cpc))}/год
                  </div>
                </div>
                <button
                  className={on ? 'btn small on' : 'btn small'}
                  onClick={() => toggle('buyOffers', g.id)}
                  disabled={!on && generals.length + draft.buyOffers.length >= B.maxGenerals}
                >
                  {on ? 'Покупаю ✓' : fmtShort(g.price)}
                </button>
              </div>
            );
          })}
        </div>
      </details>

      <details className="card more">
        <summary>Уволить генерала</summary>
        <div className="glist">
          {generals.map((g) => (
            <div className="grow" key={g.id}>
              <span>{g.name}</span>
              <button className="btn small" onClick={() => toggle('dismissGenerals', g.id)}>
                Уволить
              </button>
            </div>
          ))}
          {me.generals
            .filter((g) => draft.dismissGenerals.includes(g.id))
            .map((g) => (
              <div className="grow" key={g.id}>
                <span className="neg">{g.name} будет уволен</span>
                <button className="btn small ghost" onClick={() => toggle('dismissGenerals', g.id)}>
                  Отменить
                </button>
              </div>
            ))}
        </div>
      </details>

      <details className="card more">
        <summary>Укрепления на границах</summary>
        <div className="hint">+{Math.round(B.fortBonus * 100)}% к обороне против соседа за уровень, до {B.maxFort}. Строятся к концу года.</div>
        {nbs.map((n) => {
          const c = game.countries[n];
          const lvl = me.forts[n] ?? 0;
          const on = draft.buildForts.includes(n);
          return (
            <div className="fort" key={n}>
              <Swatch color={c.color} />
              <span className="fort-name">{c.name}</span>
              <span className="fort-lvl">
                {'▮'.repeat(lvl)}
                <span className="muted">{'▯'.repeat(B.maxFort - lvl)}</span>
              </span>
              {lvl < B.maxFort && (
                <button className={on ? 'btn small on' : 'btn small'} onClick={() => toggle('buildForts', n)}>
                  {on ? 'Строим ✓' : `+1 · ${fmtShort(fortCost(lvl, cpc))}`}
                </button>
              )}
            </div>
          );
        })}
      </details>
    </div>
  );
}
