import { useEffect, useRef, useState } from 'react';
import { B, battleLosses, captureAmount, maxRecruits, recruitCost, scoutPrice, type RecruitKind } from '../core/balance';
import { battleOdds } from '../core/estimate';
import { fmtShort, years } from '../core/format';
import { estimate, type Intel } from '../core/intel';
import type { General, GeneralTask } from '../core/types';
import { autoTasks, pickAttacker } from './autoGenerals';
import { ForecastCard } from './EconomyPanel';
import { ScienceRows } from './SciencePanel';
import { Card, Mood, Slider, Swatch, type PanelProps } from './common';
import { rel, treatyBetween } from '../core/diplomacy';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
  onDiplomacy: (id: number) => void;
  onTab: (tab: string) => void;
}

/**
 * Найм в два шага: выбрать количество (25/50/100% или ползунок) и нажать «Нанять».
 * После подтверждения видно, что именно куплено, — можно изменить или отменить.
 */
function HireBox({
  kind,
  have,
  pop,
  max,
  value,
  onChange,
  unit,
  arrive,
  salary,
}: {
  kind: RecruitKind;
  have: number;
  pop: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  arrive: string;
  salary: number;
}) {
  const [pick, setPick] = useState(0);
  const [firing, setFiring] = useState(false);
  const [firePick, setFirePick] = useState(0);
  if (value < 0) {
    return (
      <div className="hired fire">
        <div>
          <b className="neg">Увольняем {fmtShort(-value)}</b> {unit}
          <div className="muted small">экономия {fmtShort(-value * salary)} в год</div>
        </div>
        <button className="btn small ghost" onClick={() => onChange(0)}>
          Отменить
        </button>
      </div>
    );
  }
  if (firing) {
    const step = have > 100000 ? 1000 : 100;
    const n = Math.min(firePick, Math.floor(have));
    return (
      <div className="amount">
        <Slider value={n} min={0} max={Math.max(1, Math.floor(have))} step={step} onChange={setFirePick} />
        <div className="amount-foot muted small">
          <span>{n > 0 ? `уволить ${fmtShort(n)} — экономия ${fmtShort(n * salary)} в год` : 'сколько уволить'}</span>
          <button className="link" onClick={() => setFiring(false)}>
            ← к найму
          </button>
        </div>
        <button className="btn small wide" onClick={() => { setFiring(false); onChange(-n); }} disabled={n <= 0}>
          Уволить
        </button>
      </div>
    );
  }
  if (value > 0) {
    return (
      <div className="hired">
        <div>
          <b className="pos">✓ Нанимаем {fmtShort(value)}</b> {unit} за {fmtShort(recruitCost(kind, have, pop, value))}
          <div className="muted small">{arrive}</div>
        </div>
        <span className="hired-buttons">
          <button
            className="btn small"
            onClick={() => {
              setPick(value);
              onChange(0);
            }}
          >
            Изменить
          </button>
          <button className="btn small ghost" onClick={() => onChange(0)}>
            Отменить
          </button>
        </span>
      </div>
    );
  }
  const n = Math.min(pick, max);
  return (
    <>
      <Amount
        max={max}
        value={n}
        unit={unit}
        onChange={setPick}
        extra={n > 0 ? `за ${fmtShort(recruitCost(kind, have, pop, n))}` : undefined}
        footRight={
          <>
            макс. {fmtShort(max)}
            {have > 0 && (
              <>
                {' · '}
                <button className="link muted" onClick={() => setFiring(true)}>
                  уволить…
                </button>
              </>
            )}
          </>
        }
        action={
          <button className="btn primary buy" onClick={() => onChange(n)} disabled={n <= 0} title={n > 0 ? '' : 'Сначала выберите, сколько'}>
            Нанять
          </button>
        }
      />
    </>
  );
}

/** Кнопки 25% / 50% / 100% от максимума и ползунок для точного числа. */
function Amount({
  max,
  value,
  onChange,
  unit,
  action,
  extra,
  footRight,
}: {
  max: number;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  action?: React.ReactNode;
  extra?: string;
  footRight?: React.ReactNode;
}) {
  const v = Math.max(0, Math.min(max, value));
  const step = max > 100000 ? 1000 : 100;
  const at = (f: number) => (f === 1 ? max : Math.floor((max * f) / step) * step);
  return (
    <div className="amount">
      <div className="choice">
        {[0.25, 0.5, 1].map((f) => (
          <button key={f} className={'btn ' + (v > 0 && v === at(f) ? 'on' : '')} onClick={() => onChange(at(f))} disabled={max <= 0}>
            {f * 100}%
          </button>
        ))}
        {action}
      </div>
      <Slider value={v} min={0} max={Math.max(1, max)} step={step} onChange={onChange} />
      <div className="amount-foot muted small">
        <span>
          {v > 0 ? (
            <>
              <b className="amount-val">{fmtShort(v)}</b> {unit}
              {extra && <> {extra}</>}
            </>
          ) : (
            'нисколько'
          )}
        </span>
        <span>{footRight ?? <>максимум {fmtShort(max)}</>}</span>
      </div>
    </div>
  );
}

/** Сила соседа словами: сравниваем его армию (по донесению разведки) с нашей. */
function strengthWord(it: Intel, ours: number): { text: string; tone: 'pos' | 'warn' | 'neg' | 'muted' } {
  if (!it.known) return { text: 'силы неизвестны', tone: 'muted' };
  const r = it.soldiers / Math.max(1, ours);
  if (r < 0.75) return { text: 'слабее нас', tone: 'pos' };
  if (r <= 1.33) return { text: 'как мы', tone: 'warn' };
  return { text: 'сильнее нас', tone: 'neg' };
}

function chanceWord(p: number): { text: string; tone: 'pos' | 'warn' | 'neg' } {
  if (p >= 0.7) return { text: 'высокий', tone: 'pos' };
  if (p >= 0.4) return { text: 'средний', tone: 'warn' };
  return { text: 'низкий', tone: 'neg' };
}

export function OrdersPanel({ game, geo, me, draft, setDraft, fc, onSelect, target, onTarget, onDiplomacy, onTab }: Props) {
  const pop = me.population;
  const truce = game.settings.truceYears ?? 0;
  const inTruce = game.year <= truce;

  // ── Найм: варианты кнопками, как доля от возможного ──
  const maxS = Math.max(
    0,
    Math.min(fc.staffRoom - Math.max(0, draft.hireScientists), maxRecruits('soldier', me.soldiers, pop, me.money - (fc.spend - fc.soldierCost))),
  );
  const maxSc = Math.max(
    0,
    Math.min(fc.staffRoom - Math.max(0, draft.hireSoldiers), maxRecruits('scientist', me.scientists, pop, me.money - (fc.spend - fc.scientistCost))),
  );
  const round100 = (x: number) => Math.floor(x / 100) * 100;
  const income = fc.taxes + fc.saleRevenue;
  const load = fc.upkeep / Math.max(1, income);
  const trouble = fc.unfed > 0 || fc.unpaid > 0;
  const loadTone = trouble || load > 0.95 ? 'neg' : load > 0.7 ? 'warn' : 'pos';

  // ── Поход ──
  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const generals = me.generals.filter((g) => !draft.dismissGenerals.includes(g.id));
  const taskOf = (g: General): GeneralTask => draft.tasks[g.id] ?? g.task;
  const campaigns = generals.filter((g) => taskOf(g).type === 'attack');
  const sent = campaigns.reduce((a, g) => {
    const t = taskOf(g);
    return a + (t.type === 'attack' ? t.soldiers : 0);
  }, 0);
  const avail = Math.max(0, me.soldiers - sent);
  const tgt = target != null && nbs.includes(target) ? target : null;
  const gen = pickAttacker(me, draft.tasks);
  // По умолчанию — половина армии, пока игрок не выбрал своё число для этой цели
  const [pick, setPick] = useState<{ t: number | null; v: number } | null>(null);
  const army = Math.min(avail, pick && pick.t === tgt ? pick.v : round100(avail * 0.5));
  const odds = tgt != null && gen && army > 0 ? battleOdds(game, geo, me.id, tgt, gen, army) : null;
  // Сколько земли удастся занять при победе: решают перевес, скорость генерала и число уцелевших солдат
  const expectCells = (() => {
    if (!odds || tgt == null || !gen) return 0;
    const tc = game.countries[tgt];
    const surv = army * (1 - battleLosses(Math.min(odds.ratio, 1 / Math.max(0.01, odds.ratio))).win);
    return captureAmount(game.cellsPerCountry, tc.cells, gen, odds.ratio, 0.5, surv, tc.population / Math.max(1, tc.cells));
  })();
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tgt != null) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tgt]);
  const words = new Map(nbs.map((n) => [n, strengthWord(estimate(game, me.id, n, true), me.soldiers)]));
  const tgtIntel = tgt != null ? estimate(game, me.id, tgt, true) : null;
  const scoutPriceNow = scoutPrice(game.cellsPerCountry, game.year);
  const scoutDraft = draft.scout ?? { hire: false, target: me.scoutTarget ?? null };
  const hasScoutNow = me.hasScout || scoutDraft.hire;
  const setScout = (patch: Partial<{ hire: boolean; target: number | null }>) =>
    setDraft((o) => ({ ...o, scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget ?? null }), ...patch } }));
  const scoutIt = (id: number) => setScout(me.hasScout ? { target: id } : { hire: true, target: id });

  const send = () => {
    if (tgt == null || !gen || army <= 0) return;
    setDraft((o) => ({
      ...o,
      tasks: autoTasks(me, { ...o.tasks, [gen.id]: { type: 'attack', target: tgt, soldiers: army } }, o.dismissGenerals),
    }));
    setPick(null);
    onTarget(null);
  };
  const cancel = (g: General) =>
    setDraft((o) => ({ ...o, tasks: autoTasks(me, { ...o.tasks, [g.id]: { type: 'defend' } }, o.dismissGenerals) }));

  // ── Генералы: покупка ──
  const [buying, setBuying] = useState(false);
  const toggleBuy = (id: number) =>
    setDraft((o) => ({ ...o, buyOffers: o.buyOffers.includes(id) ? o.buyOffers.filter((x) => x !== id) : [...o.buyOffers, id] }));

  // ── Советник: одна главная подсказка на ход ──
  const advice = (() => {
    const offers = (game.offers ?? []).filter((d) => d.to === me.id && d.year === game.year && !draft.diplomacy?.accept?.includes(d.id));
    const ult = offers.find((d) => d.ultimatum);
    if (ult) return { tone: 'neg', text: `Государство ${game.countries[ult.from].name} требует дань — иначе нападёт. Решите во вкладке «Дипломатия».`, tab: 'diplomacy' };
    if (fc.unfed > 0) return { tone: 'neg', text: 'Будет голод: денег не хватит на зерно. Наймите меньше людей.' };
    if (fc.unpaid > 0) return { tone: 'neg', text: 'Казна не потянет жалованье — часть солдат разбежится. Наймите меньше.' };
    if (offers.length)
      return {
        tone: 'ok',
        text: `Государство ${game.countries[offers[0].from].name} предлагает ${offers[0].kind === 'alliance' ? 'совместный поход' : 'мир'}${offers.length > 1 ? ' (и ещё ' + (offers.length - 1) + ')' : ''} — загляните в «Дипломатию».`,
        tab: 'diplomacy',
      };
    if (generals.length === 0 && draft.buyOffers.length === 0)
      return { tone: 'warn', text: 'Без генерала армия не может наступать и плохо обороняется — купите генерала.' };
    if (campaigns.length > 0 && !generals.some((g) => taskOf(g).type === 'defend'))
      return { tone: 'warn', text: 'Все генералы ушли в поход — оборону дома никто не возглавляет. Купите ещё генерала.' };
    if (me.scientists === 0 && draft.hireScientists <= 0)
      return { tone: 'warn', text: 'Учёных нет — наука стоит на месте. Наймите учёных в разделе «Наука».' };
    if (pop >= fc.maxPop * 0.995 && !(draft.scienceAlloc[2] > 0.5))
      return { tone: 'warn', text: 'Население упёрлось в предел земли. Изучайте «Плотность» — или завоюйте новые земли.' };
    if (fc.popEnd >= fc.maxPop - 1 && !(draft.scienceAlloc[2] > 0.5))
      return { tone: 'warn', text: 'В этом году население дойдёт до предела земли. Пора изучать «Плотность населения».' };
    if (inTruce) {
      const left = truce - game.year + 1;
      if (left <= 3) return { tone: 'warn', text: `Мир кончится через ${years(left)} — соседи уже вооружаются. Пора нанимать солдат.` };
      return { tone: 'ok', text: `Мирное время (ещё ${years(left)}). Развивайте хозяйство и науку — большая армия пока не нужна.` };
    }
    if (!hasScoutNow && nbs.length)
      return { tone: 'warn', text: 'Наймите разведчика (раздел «Генералы и разведка») — без него силы соседей неизвестны.' };
    const strong = nbs.find((n) => {
      const it = estimate(game, me.id, n, true);
      return it.known && it.soldiers > me.soldiers * 1.6;
    });
    if (strong != null)
      return { tone: 'warn', text: `${game.countries[strong].name} намного сильнее нас — держите армию дома и нанимайте солдат.` };
    const weak = nbs.find((n) => {
      const it = estimate(game, me.id, n, true);
      return it.known && it.soldiers < me.soldiers * 0.6;
    });
    if (weak != null && generals.length > 0 && campaigns.length === 0)
      return { tone: 'ok', text: `У государства ${game.countries[weak].name} мало войск — хороший момент для похода.` };
    if (pop >= fc.maxPop * 0.995) return { tone: 'warn', text: 'Земли не хватает — население больше не растёт. Нужны новые земли.' };
    return { tone: 'ok', text: 'Всё спокойно. Копите силы и развивайте науку.' };
  })();

  return (
    <div className="panel-body orders">
      <div className={'advisor ' + advice.tone}>
        <b>Советник:</b> {advice.text}
        {'tab' in advice && advice.tab && (
          <button className="link" onClick={() => onTab(advice.tab as string)}>
            {' '}открыть →
          </button>
        )}
      </div>
      <div className="orders-grid">
      <div className="ocol">
      <ForecastCard me={me} fc={fc} compact />

      <Card title="Солдаты" right={<span className="muted">сейчас {fmtShort(me.soldiers)}</span>}>
        <HireBox
          kind="soldier"
          have={me.soldiers}
          pop={pop}
          max={maxS}
          value={draft.hireSoldiers}
          unit="солдат"
          salary={B.soldierUpkeep}
          arrive="придут к концу года (в боях этого года не участвуют)"
          onChange={(v) => setDraft((o) => ({ ...o, hireSoldiers: v }))}
        />
        <div className="load">
          <div className="load-text">
            Жалованье армии и учёных: <b className={loadTone}>{Math.round(load * 100)}% дохода</b>
          </div>
          <div className="load-bar">
            <div className={'load-fill ' + loadTone} style={{ width: Math.min(100, load * 100) + '%' }} />
          </div>
        </div>
      </Card>

      <Card title="Поход">
        {inTruce ? (
          <div className="truce">Пока мир — нападать нельзя никому (до конца {truce}-го года).</div>
        ) : (
          <>
            <div className="chips">
              {nbs.map((n) => {
                const w = words.get(n)!;
                return (
                  <button key={n} className={'chip ' + (tgt === n ? 'on' : '')} onClick={() => onTarget(tgt === n ? null : n)}>
                    <Mood value={rel(game, n, me.id)} size={16} />
                    {game.countries[n].name} · <span className={w.tone}>{w.text}</span>
                    {treatyBetween(game, me.id, n) && <span className="muted"> · мир</span>}
                  </button>
                );
              })}
            </div>
            {tgt == null && <div className="hint">Выберите соседа или щёлкните по нему на карте.</div>}
            {tgt != null && (
              <div className="attack-form" ref={formRef}>
                {!gen ? (
                  <div className="warn-box">Нет свободного генерала — купите генерала ниже.</div>
                ) : (
                  <>
                    <Amount max={avail} value={army} unit="солдат" extra={`· ведёт ${gen.name}`} onChange={(v) => setPick({ t: tgt, v })} />
                    {treatyBetween(game, me.id, tgt) && (
                      <div className="warn-box">У нас договор с этой страной — нападение будет предательством: честь упадёт, и с вами долго никто не будет договариваться.</div>
                    )}
                    <div className="attack-row">
                      {tgtIntel && !tgtIntel.known ? (
                        <span>
                          Шанс: <b className="muted">неизвестен</b>{' '}
                          {hasScoutNow && scoutDraft.target === tgt ? (
                            <span className="muted small">разведчик идёт туда</span>
                          ) : (
                            <button className="link" onClick={() => scoutIt(tgt)}>
                              {hasScoutNow ? 'разведать' : `нанять разведчика (${fmtShort(scoutPriceNow)})`}
                            </button>
                          )}
                        </span>
                      ) : odds && (
                        <span>
                          {tgtIntel?.age ? <span className="muted small">данные {years(tgtIntel.age)} назад · </span> : null}
                          Шанс: <b className={chanceWord(odds.p).tone}>{chanceWord(odds.p).text}</b>
                          {expectCells > 0 && <span className="muted small"> · займём ≈{expectCells} кл.</span>}
                        </span>
                      )}
                      <button className="btn primary" onClick={send} disabled={army <= 0}>
                        {treatyBetween(game, me.id, tgt) ? 'Нарушить договор и напасть' : 'В поход!'}
                      </button>
                      <button className="link" onClick={() => onDiplomacy(tgt)}>
                        договориться
                      </button>
                    </div>                  </>
                )}
              </div>
            )}
          </>
        )}
        {campaigns.length > 0 && (
          <div className="campaigns">
            {campaigns.map((g) => {
              const t = taskOf(g);
              if (t.type !== 'attack') return null;
              const c = game.countries[t.target];
              const o = c?.alive ? battleOdds(game, geo, me.id, t.target, g, t.soldiers) : null;
              return (
                <div className="campaign" key={g.id}>
                  <span>
                    → <Swatch color={c.color} />
                    <b>{c.name}</b>: {fmtShort(t.soldiers)} солдат
                    {o && (
                      <>
                        , шанс <span className={chanceWord(o.p).tone}>{chanceWord(o.p).text}</span>
                      </>
                    )}
                  </span>
                  <button className="btn small ghost" onClick={() => cancel(g)}>
                    Отменить
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>


      </div>
      <div className="ocol">
      <Card title="Наука" right={<span className="muted">учёных {fmtShort(fc.scientists)}</span>}>
        <HireBox
          kind="scientist"
          have={me.scientists}
          pop={pop}
          max={maxSc}
          value={draft.hireScientists}
          unit="учёных"
          salary={B.sciUpkeep}
          arrive="приступят к работе сразу"
          onChange={(v) => setDraft((o) => ({ ...o, hireScientists: v }))}
        />
        <div className="sci-in-orders">
          <ScienceRows game={game} geo={geo} me={me} draft={draft} setDraft={setDraft} fc={fc} onSelect={onSelect} compact />
        </div>
      </Card>

      <Card title={`Генералы и разведка`} right={<button className="link" onClick={() => setBuying(!buying)}>{buying ? 'скрыть' : 'купить генерала'}</button>}>
        <div className="glist">
          {generals.map((g) => {
            const t = taskOf(g);
            const role = t.type === 'attack' ? `в походе на ${game.countries[t.target]?.name}` : t.type === 'defend' ? 'оборона' : 'учится';
            return (
              <div className="gline" key={g.id}>
                <span>
                  <b>{g.name}</b> <span className="muted small">{g.age} лет · опыт {Math.round(g.exp)}</span>
                </span>
                <span className="muted small">{role}</span>
              </div>
            );
          })}
          {generals.length === 0 && <div className="muted">Генералов нет.</div>}
        </div>
        <div className="scout-row">
          {hasScoutNow ? (
            <>
              <span>Разведчик:</span>
              <select value={scoutDraft.target ?? ''} onChange={(e) => setScout({ target: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">— никуда —</option>
                {nbs.map((n) => {
                  const it = estimate(game, me.id, n, true);
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
                <button className="link muted" onClick={() => setScout({ hire: false })}>
                  не нанимать ({fmtShort(scoutPriceNow)})
                </button>
              )}
            </>
          ) : (
            <>
              <span className="muted">Разведчика нет — силы соседей неизвестны.</span>
              <button className="btn small" onClick={() => setScout({ hire: true })} disabled={me.money < scoutPriceNow}>
                Нанять за {fmtShort(scoutPriceNow)}
              </button>
            </>
          )}
        </div>        {buying && (
          <div className="glist" style={{ marginTop: 8 }}>
            {me.offers.map((g) => {
              const on = draft.buyOffers.includes(g.id);
              return (
                <div className={'grow' + (on ? ' chosen' : '')} key={g.id}>
                  <div className="grow-main">
                    <b>{g.name}</b>
                    <div className="muted small">
                      {g.age} лет · опыт {Math.round(g.exp)} · скорость {g.speed} · ум {g.intellect}
                    </div>
                  </div>
                  <button className={on ? 'btn small on' : 'btn small'} onClick={() => toggleBuy(g.id)}>
                    {on ? 'Покупаю ✓' : `Купить за ${fmtShort(g.price)}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      </div>
      </div>
    </div>
  );
}
