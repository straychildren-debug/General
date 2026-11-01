import { useEffect, useRef, useState } from 'react';
import { B, levelCost, maxRecruits, sciMult } from '../core/balance';
import { battleOdds } from '../core/estimate';
import { fmtShort, years } from '../core/format';
import { estimate } from '../core/intel';
import { S_SCI, type General, type GeneralTask } from '../core/types';
import { autoTasks, pickAttacker } from './autoGenerals';
import { Card, Swatch, type PanelProps } from './common';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
}

const SHORT = ['Деньги', 'Урожай', 'Плотность', 'Рост населения', 'Военная мощь', 'Наука', 'Оборона', 'Разведка'];
const SHORT_HINT = [
  'больше денег с крестьян',
  'больше зерна — можно держать больше солдат',
  'выше предел населения на той же земле',
  'население быстрее растёт',
  'солдаты сильнее в атаке и обороне',
  'учёные работают быстрее',
  'граница держится крепче',
  'точнее сведения о соседях',
];

function Choice({ options, value, onChange }: { options: { label: string; value: number }[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="choice">
      {options.map((o, k) => (
        <button key={k} className={'btn ' + (o.value === value ? 'on' : '')} onClick={() => onChange(o.value)} disabled={k > 0 && o.value <= 0}>
          {o.label}
        </button>
      ))}
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

export function OrdersPanel({ game, geo, me, draft, setDraft, fc, target, onTarget }: Props) {
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
  const soldierOpts = [
    { label: 'Не нанимать', value: 0 },
    { label: 'Немного', value: round100(maxS * 0.25) },
    { label: 'Много', value: round100(maxS * 0.6) },
    { label: 'Максимум', value: maxS },
  ];
  const sciOpts = [
    { label: 'Не нанимать', value: 0 },
    { label: 'Немного', value: round100(maxSc * 0.25) },
    { label: 'Много', value: round100(maxSc * 0.6) },
  ];
  const income = fc.taxes + fc.saleRevenue;
  const load = fc.upkeep / Math.max(1, income);
  const trouble = fc.unfed > 0 || fc.unpaid > 0;
  const loadTone = trouble || load > 0.95 ? 'neg' : load > 0.7 ? 'warn' : 'pos';

  // ── Наука: главные направления, учёные делятся поровну ──
  const chosen = draft.scienceAlloc.map((a, i) => (a > 0.5 ? i : -1)).filter((i) => i >= 0);
  const toggleSci = (i: number) => {
    const next = chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i];
    if (!next.length) return;
    const alloc = new Array(SHORT.length).fill(0);
    for (const k of next) alloc[k] = 100 / next.length;
    setDraft((o) => ({ ...o, scienceAlloc: alloc }));
  };
  const ptsPer = B.ptsPerSci * sciMult(me, S_SCI);
  const nextFinds = chosen
    .map((i) => {
      const n = (draft.scienceAlloc[i] / 100) * fc.scientists;
      const left = Math.max(0, levelCost(me.science.level[i], game.cellsPerCountry) - me.science.progress[i]);
      return { i, y: n > 0 ? Math.ceil(left / (n * ptsPer)) : Infinity };
    })
    .sort((a, b) => a.y - b.y);

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
  const [frac, setFrac] = useState(0.5);
  const army = round100(avail * frac);
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
    if (pop >= fc.maxPop * 0.97) return { tone: 'warn', text: 'Земли не хватает — население больше не растёт. Нужны новые земли.' };
    return { tone: 'ok', text: 'Всё спокойно. Копите силы и развивайте науку.' };
  })();

  return (
    <div className="panel-body">
      <div className={'advisor ' + advice.tone}>
        <b>Советник:</b> {advice.text}
      </div>

      <Card title="Солдаты" right={<span className="muted">сейчас {fmtShort(me.soldiers)}</span>}>
        <Choice options={soldierOpts} value={Math.max(0, draft.hireSoldiers)} onChange={(v) => setDraft((o) => ({ ...o, hireSoldiers: v }))} />
        <div className="load">
          <div className="load-text">
            Жалованье армии и учёных: <b className={loadTone}>{Math.round(load * 100)}% дохода</b>
          </div>
          <div className="load-bar">
            <div className={'load-fill ' + loadTone} style={{ width: Math.min(100, load * 100) + '%' }} />
          </div>
        </div>
        <div className="hint">Новобранцы придут к концу года. Чем больше армия, тем дороже каждый следующий.</div>
      </Card>

      <Card title="Наука" right={<span className="muted">учёных {fmtShort(fc.scientists)}</span>}>
        <div className="muted small">Нанять учёных</div>
        <Choice options={sciOpts} value={Math.max(0, draft.hireScientists)} onChange={(v) => setDraft((o) => ({ ...o, hireScientists: v }))} />
        <div className="muted small" style={{ marginTop: 10 }}>
          Главные направления (учёные поделятся поровну)
        </div>
        <div className="chips">
          {SHORT.map((name, i) => (
            <button key={i} className={'chip ' + (chosen.includes(i) ? 'on' : '')} onClick={() => toggleSci(i)} title={SHORT_HINT[i]}>
              {name} <span className="muted">{me.science.level[i]}</span>
            </button>
          ))}
        </div>
        {nextFinds[0] && Number.isFinite(nextFinds[0].y) && (
          <div className="hint">
            Ближайшее открытие: «{SHORT[nextFinds[0].i]}» — {nextFinds[0].y <= 1 ? 'в этом году' : `через ${years(nextFinds[0].y)}`} (
            {SHORT_HINT[nextFinds[0].i]}).
          </div>
        )}
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
            {tgt == null && <div className="hint">Выберите соседа здесь или щёлкните по нему на карте.</div>}
            {tgt != null && (
              <div className="attack-form" ref={formRef}>
                {!gen ? (
                  <div className="warn-box">Нет свободного генерала — купите генерала ниже.</div>
                ) : (
                  <>
                    <div className="form-row">
                      <span className="muted">Послать</span>
                      <Choice
                        options={[
                          { label: 'Треть армии', value: 1 / 3 },
                          { label: 'Половину', value: 0.5 },
                          { label: 'Всех', value: 1 },
                        ]}
                        value={frac}
                        onChange={setFrac}
                      />
                    </div>
                    <div className="attack-sum">
                      <span>
                        {fmtShort(army)} солдат, ведёт {gen.name}
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

      <Card title={`Генералы · ${generals.length}`} right={<button className="link" onClick={() => setBuying(!buying)}>{buying ? 'скрыть' : 'купить генерала'}</button>}>
        <div className="glist">
          {generals.map((g) => {
            const t = taskOf(g);
            const role = t.type === 'attack' ? `в походе на ${game.countries[t.target]?.name}` : t.type === 'defend' ? 'командует обороной' : 'учится';
            return (
              <div className="gline" key={g.id}>
                <span>
                  <b>{g.name}</b> <span className="muted small">опыт {Math.round(g.exp)}</span>
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
                      опыт {Math.round(g.exp)} · скорость {g.speed} · ум {g.intellect}
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
        <div className="hint">Генералы назначаются сами: лучший командует обороной, остальные учатся.</div>
      </Card>

      <div className="hint center">Точная настройка (числа, увольнение, укрепления) — во вкладке «Подробно».</div>
    </div>
  );
}
