import { useEffect, useRef, useState } from 'react';
import { maxRecruits } from '../core/balance';
import { battleOdds } from '../core/estimate';
import { fmtShort, years } from '../core/format';
import { estimate } from '../core/intel';
import type { General, GeneralTask } from '../core/types';
import { autoTasks, pickAttacker } from './autoGenerals';
import { ForecastCard } from './EconomyPanel';
import { ScienceRows } from './SciencePanel';
import { Card, Slider, Swatch, type PanelProps } from './common';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
}

/** Кнопки 25% / 50% / 100% от максимума и ползунок для точного числа. */
function Amount({ max, value, onChange, unit }: { max: number; value: number; onChange: (v: number) => void; unit: string }) {
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
      </div>
      <Slider value={v} min={0} max={Math.max(1, max)} step={step} onChange={onChange} />
      <div className="amount-foot muted small">
        <span>
          {v > 0 ? (
            <>
              <b className="amount-val">{fmtShort(v)}</b> {unit}
            </>
          ) : (
            'нисколько'
          )}
        </span>
        <span>максимум {fmtShort(max)}</span>
      </div>
    </div>
  );
}

/** Сила соседа словами: сравниваем его армию (по данным разведки) с нашей. */
function strengthWord(theirs: number, ours: number): { text: string; tone: 'pos' | 'warn' | 'neg' } {
  const r = theirs / Math.max(1, ours);
  if (r < 0.75) return { text: 'слабее нас', tone: 'pos' };
  if (r <= 1.33) return { text: 'как мы', tone: 'warn' };
  return { text: 'сильнее нас', tone: 'neg' };
}

function chanceWord(p: number): { text: string; tone: 'pos' | 'warn' | 'neg' } {
  if (p >= 0.7) return { text: 'высокий', tone: 'pos' };
  if (p >= 0.4) return { text: 'средний', tone: 'warn' };
  return { text: 'низкий', tone: 'neg' };
}

export function OrdersPanel({ game, geo, me, draft, setDraft, fc, onSelect, target, onTarget }: Props) {
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
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tgt != null) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tgt]);
  const words = new Map(nbs.map((n) => [n, strengthWord(estimate(game, me.id, n, true).soldiers, me.soldiers)]));

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
    if (fc.unfed > 0) return { tone: 'neg', text: 'Будет голод: денег не хватит на зерно. Наймите меньше людей.' };
    if (fc.unpaid > 0) return { tone: 'neg', text: 'Казна не потянет жалованье — часть солдат разбежится. Наймите меньше.' };
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
    const strong = nbs.find((n) => estimate(game, me.id, n, true).soldiers > me.soldiers * 1.6);
    if (strong != null)
      return { tone: 'warn', text: `${game.countries[strong].name} намного сильнее нас — держите армию дома и нанимайте солдат.` };
    const weak = nbs.find((n) => estimate(game, me.id, n, true).soldiers < me.soldiers * 0.6);
    if (weak != null && generals.length > 0 && campaigns.length === 0)
      return { tone: 'ok', text: `У государства ${game.countries[weak].name} мало войск — хороший момент для похода.` };
    if (pop >= fc.maxPop * 0.995) return { tone: 'warn', text: 'Земли не хватает — население больше не растёт. Нужны новые земли.' };
    return { tone: 'ok', text: 'Всё спокойно. Копите силы и развивайте науку.' };
  })();

  return (
    <div className="panel-body orders">
      <div className={'advisor ' + advice.tone}>
        <b>Советник:</b> {advice.text}
      </div>
      <div className="orders-grid">
      <div className="ocol">
      <ForecastCard me={me} fc={fc} compact />

      <Card title="Солдаты" right={<span className="muted">сейчас {fmtShort(me.soldiers)}</span>}>
        <Amount max={maxS} value={draft.hireSoldiers} unit="новобранцев" onChange={(v) => setDraft((o) => ({ ...o, hireSoldiers: v }))} />
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
                    <Swatch color={game.countries[n].color} />
                    {game.countries[n].name} · <span className={w.tone}>{w.text}</span>
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
                    <Amount max={avail} value={army} unit="солдат" onChange={(v) => setPick({ t: tgt, v })} />
                    <div className="attack-sum">
                      <span>
                        Ведёт {gen.name}
                      </span>
                      {odds && (
                        <span>
                          Шанс: <b className={chanceWord(odds.p).tone}>{chanceWord(odds.p).text}</b>
                        </span>
                      )}
                    </div>
                    <button className="btn primary wide" onClick={send} disabled={army <= 0}>
                      Отправить в поход на {game.countries[tgt].name}
                    </button>
                  </>
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
        <Amount max={maxSc} value={draft.hireScientists} unit="учёных" onChange={(v) => setDraft((o) => ({ ...o, hireScientists: v }))} />
        <div className="sci-in-orders">
          <ScienceRows game={game} geo={geo} me={me} draft={draft} setDraft={setDraft} fc={fc} onSelect={onSelect} compact />
        </div>
      </Card>

      <Card title={`Генералы · ${generals.length}`} right={<button className="link" onClick={() => setBuying(!buying)}>{buying ? 'скрыть' : 'купить генерала'}</button>}>
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
        {buying && (
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
