import { useEffect, useRef, useState } from 'react';
import { B, levelCost, maxRecruits, multAt, recruitCost, sciMult, scoutPrice, SCIENCE_INFO, type RecruitKind } from '../core/balance';
import { battleOdds } from '../core/estimate';
import { fmtShort, fmtSigned, years } from '../core/format';
import { estimate } from '../core/intel';
import { S_DENS, S_MIL, S_SCI, type General, type GeneralTask } from '../core/types';
import { autoTasks } from './autoGenerals';
import { AttackForm } from './AttackForm';
import { Mood, Slider, type PanelProps } from './common';
import { Icon, SCIENCE_ICONS, SCIENCE_SHORT } from './icons';
import { Amount, Box, chanceWord, initials, Ring, Stars, strengthWord, type Tone } from './opParts';
import { rel, treatyBetween } from '../core/diplomacy';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
  onDiplomacy: (id: number) => void;
  onTab: (tab: string) => void;
}

/**
 * Найм в два шага: выбрать количество и нажать «Нанять». Пока ползунок двигается,
 * сразу видно, сколько это стоит сейчас и сколько жалованья добавится каждый год.
 */
function Recruit({
  kind,
  have,
  pop,
  max,
  value,
  onChange,
  salary,
  pick,
  setPick,
  arrive,
}: {
  kind: RecruitKind;
  have: number;
  pop: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  salary: number;
  pick: number;
  setPick: (v: number) => void;
  arrive: string;
}) {
  const [firing, setFiring] = useState(false);
  const [firePick, setFirePick] = useState(0);
  if (value < 0) {
    return (
      <div className="op-confirm fire">
        <div>
          <b className="neg">Увольняем {fmtShort(-value)}</b>
          <div className="muted small">экономия {fmtShort(-value * salary)} в год</div>
        </div>
        <button className="btn small ghost" onClick={() => onChange(0)}>
          Отменить
        </button>
      </div>
    );
  }
  if (firing) {
    const step = have >= 20000 ? 1000 : 100;
    const n = Math.min(firePick, Math.floor(have));
    return (
      <div className="op-recruit">
        <Slider value={n} min={0} max={Math.max(1, Math.floor(have))} step={step} onChange={setFirePick} />
        <div className="op-preview">
          <span>{n > 0 ? <>уволить <b>{fmtShort(n)}</b> · экономия {fmtShort(n * salary)} в год</> : 'Сколько уволить?'}</span>
        </div>
        <div className="op-recruit-actions">
          <button className="btn small ghost" onClick={() => setFiring(false)}>
            ← к найму
          </button>
          <button className="btn small" onClick={() => { setFiring(false); onChange(-n); }} disabled={n <= 0}>
            Уволить
          </button>
        </div>
      </div>
    );
  }
  if (value > 0) {
    return (
      <div className="op-confirm">
        <div>
          <b className="pos">✓ Нанимаем +{fmtShort(value)}</b>
          <div className="op-preview">
            <span className="op-cost">
              <Icon name="coins" size={14} /> {fmtShort(recruitCost(kind, have, pop, value))} сразу
            </span>
            <span className="op-cost neg">−{fmtShort(value * salary)} в год</span>
            <span className="muted">{arrive}</span>
          </div>
        </div>
        <span className="op-confirm-buttons">
          <button className="btn small" onClick={() => { setPick(value); onChange(0); }}>
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
    <div className="op-recruit">
      <Amount
        max={max}
        value={n}
        onChange={setPick}
        action={
          <button className="btn primary op-hire" onClick={() => onChange(n)} disabled={n <= 0} title={n > 0 ? '' : 'Сначала выберите, сколько'}>
            Нанять
          </button>
        }
      />
      <div className="op-preview">
        {n > 0 ? (
          <>
            <span className="op-big">+{fmtShort(n)}</span>
            <span className="op-cost" title="Заплатить сразу">
              <Icon name="coins" size={14} /> {fmtShort(recruitCost(kind, have, pop, n))} сразу
            </span>
            <span className="op-cost neg" title="Жалованье каждый год">
              −{fmtShort(n * salary)} в год
            </span>
          </>
        ) : (
          <span className="muted">
            до {fmtShort(max)} — двигайте ползунок, покажем цену
            {have > 0 && (
              <>
                {' · '}
                <button className="link muted" onClick={() => setFiring(true)}>
                  уволить…
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Плитка ресурса: значок в кольце + крупное число. */
function Tile({
  ring,
  label,
  main,
  mainTone,
  sub,
  onClick,
  on,
  title,
}: {
  ring: React.ReactNode;
  label: string;
  main: React.ReactNode;
  mainTone?: Tone;
  sub: React.ReactNode;
  onClick?: () => void;
  on?: boolean;
  title?: string;
}) {
  const body = (
    <>
      {ring}
      <span className="op-tile-text">
        <span className="op-tile-head">{label}</span>
        <span className={'op-tile-main ' + (mainTone ?? '')}>{main}</span>
        <span className="op-tile-sub">{sub}</span>
      </span>
    </>
  );
  return onClick ? (
    <button className={'op-tile ' + (on ? 'on' : '')} onClick={onClick} title={title}>
      {body}
    </button>
  ) : (
    <div className="op-tile" title={title}>
      {body}
    </div>
  );
}

/**
 * Карточка науки: кольцо — сколько накоплено до следующего уровня (полосатое — сколько добавится
 * в этом году); ползунок — сколько учёных отправлено, метка на нём — сколько нужно, чтобы открыть
 * уровень за год.
 */
function SciCard({
  i,
  level,
  prog,
  cost,
  n,
  total,
  ptsPer,
  free,
  onSet,
}: {
  i: number;
  level: number;
  prog: number;
  cost: number;
  n: number;
  total: number;
  ptsPer: number;
  free: number;
  onSet: (v: number) => void;
}) {
  const s = SCIENCE_INFO[i];
  const left = Math.max(0, cost - prog);
  const gain = n * ptsPer;
  const need = Math.ceil(left / ptsPer);
  const yrs = n > 0 ? Math.ceil(left / gain) : null;
  const next = i === S_MIL ? `атака +${(level + 1) * 10}%` : `${s.effect} +${Math.round((multAt(i, level + 1) - 1) * 100)}%`;
  const enough = n >= need && need > 0;
  const mark = total > 0 ? Math.min(1, need / total) : 1;
  const step = total >= 20000 ? 1000 : 100;
  return (
    <div className={'op-sc' + (n > 0 ? ' on' : '') + (enough ? ' done' : '')} title={`${s.name}. ${level + 1}-й уровень даст: ${next}`}>
      <div className="op-sc-head">
        <Ring value={prog / cost} ghost={(prog + gain) / cost} tone={n > 0 ? 'gold' : 'muted'} size={36}>
          <Icon name={SCIENCE_ICONS[i]} size={17} />
        </Ring>
        <span className="op-sc-title" title={yrs === null ? 'не изучается' : yrs <= 1 ? 'уровень откроют в этом году' : `уровень откроют через ${years(yrs)}`}>
          <span className="op-sc-name">{SCIENCE_SHORT[i]}</span>
          <span className="op-sc-lvl">
            ур. <b>{level}</b>
            {yrs !== null && (yrs <= 1 ? <span className="soon"> → {level + 1}</span> : <span className="eta"> · {yrs} г.</span>)}
          </span>
        </span>
      </div>
      <div className="op-sc-row">
        <div className="op-sc-slider">
          <Slider value={n} min={0} max={Math.max(1, total)} step={step} onChange={onSet} />
          {total > 0 && <i className={'op-mark' + (need > total ? ' over' : '')} style={{ left: `calc(${mark * 100}% - ${mark * 16 - 8}px)` }} />}
        </div>
        <span className="op-sc-count" title="Учёных отправлено / нужно, чтобы открыть уровень за год">
          <b>{fmtShort(n)}</b>/
          <button
            className="op-sc-need"
            onClick={() => onSet(need)}
            disabled={total === 0 || n === need || (free <= 0 && n >= need)}
            title={`Отправить ${fmtShort(need)} — уровень откроют в этом году`}
          >
            {fmtShort(need)}
          </button>
        </span>
      </div>
    </div>
  );
}

export function OrdersPanel({ game, geo, me, draft, setDraft, fc, target, onTarget, onDiplomacy, onTab }: Props) {
  const pop = me.population;
  const truce = game.settings.truceYears ?? 0;
  const inTruce = game.year <= truce;

  // ── Найм ──
  const maxS = Math.max(
    0,
    Math.min(fc.staffRoom - Math.max(0, draft.hireScientists), maxRecruits('soldier', me.soldiers, pop, me.money - (fc.spend - fc.soldierCost))),
  );
  const maxSc = Math.max(
    0,
    Math.min(fc.staffRoom - Math.max(0, draft.hireSoldiers), maxRecruits('scientist', me.scientists, pop, me.money - (fc.spend - fc.scientistCost))),
  );
  // Выбранное ползунком, но ещё не нанятое — для предпросмотра расходов
  const [pickS, setPickS] = useState(0);
  const [pickSc, setPickSc] = useState(0);
  const pendS = draft.hireSoldiers === 0 ? Math.min(pickS, maxS) : 0;
  const pendSc = draft.hireScientists === 0 ? Math.min(pickSc, maxSc) : 0;
  const pendSalary = pendS * B.soldierUpkeep + pendSc * B.sciUpkeep;
  const pendCost = recruitCost('soldier', me.soldiers, pop, pendS) + recruitCost('scientist', me.scientists, pop, pendSc);
  const income = fc.taxes + fc.saleRevenue;
  const load = fc.upkeep / Math.max(1, income);
  const loadAfter = (fc.upkeep + pendSalary) / Math.max(1, income);
  const trouble = fc.unfed > 0 || fc.unpaid > 0;
  const toneOf = (x: number): Tone => (x > 0.95 ? 'neg' : x > 0.7 ? 'warn' : 'pos');
  const loadTone: Tone = trouble ? 'neg' : toneOf(load);

  // ── Прогноз ──
  const dMoney = fc.moneyEnd - me.money;
  const moneyAfterPick = fc.moneyEnd - pendCost - pendSalary;
  const dPop = fc.popEnd - fc.population;
  const atCap = me.population >= fc.maxPop * 0.995;
  const willCap = !atCap && fc.popEnd >= fc.maxPop - 1;
  const hungry = fc.unfed > 0;
  const [moneyOpen, setMoneyOpen] = useState(false);

  // ── Поход ──
  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const generals = me.generals.filter((g) => !draft.dismissGenerals.includes(g.id));
  const taskOf = (g: General): GeneralTask => draft.tasks[g.id] ?? g.task;
  const campaigns = generals.filter((g) => taskOf(g).type === 'attack');
  const tgt = target != null && nbs.includes(target) ? target : null;
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tgt != null) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tgt]);
  const intelOf = new Map(nbs.map((n) => [n, estimate(game, me.id, n, true)]));
  const scoutPriceNow = scoutPrice(game.cellsPerCountry, game.year);
  const scoutDraft = draft.scout ?? { hire: false, target: me.scoutTarget ?? null };
  const hasScoutNow = me.hasScout || scoutDraft.hire;
  const setScout = (patch: Partial<{ hire: boolean; target: number | null }>) =>
    setDraft((o) => ({ ...o, scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget ?? null }), ...patch } }));

  const cancel = (g: General) =>
    setDraft((o) => ({ ...o, tasks: autoTasks(me, { ...o.tasks, [g.id]: { type: 'defend' } }, o.dismissGenerals) }));

  // ── Генералы: покупка ──
  const [buying, setBuying] = useState(false);
  const toggleBuy = (id: number) =>
    setDraft((o) => ({ ...o, buyOffers: o.buyOffers.includes(id) ? o.buyOffers.filter((x) => x !== id) : [...o.buyOffers, id] }));

  // ── Наука ──
  const sciTotal = Math.max(0, fc.scientists);
  const ptsPer = B.ptsPerSci * sciMult(me, S_SCI);
  const sciCount = (i: number) => Math.round((Math.max(0, draft.scienceAlloc[i]) / 100) * sciTotal);
  const assigned = draft.scienceAlloc.reduce((a, _, i) => a + sciCount(i), 0);
  const sciFree = Math.max(0, sciTotal - assigned);
  const setSci = (i: number, n: number) =>
    setDraft((o) => {
      const mx = sciCount(i) + sciFree;
      const v = Math.max(0, Math.min(mx, Math.round(n)));
      const a = o.scienceAlloc.slice();
      a[i] = sciTotal > 0 ? (v / sciTotal) * 100 : 0;
      return { ...o, scienceAlloc: a };
    });

  // ── Советник: одна главная подсказка на ход ──
  const advice = (() => {
    const offers = (game.offers ?? []).filter((d) => d.to === me.id && d.year === game.year && !draft.diplomacy?.accept?.includes(d.id));
    const ult = offers.find((d) => d.ultimatum);
    if (ult) return { tone: 'neg', text: `${game.countries[ult.from].name} требует дань — иначе нападёт.`, tab: 'diplomacy' };
    if (fc.unfed > 0) return { tone: 'neg', text: 'Будет голод: денег не хватит на зерно. Наймите меньше людей.' };
    if (fc.unpaid > 0) return { tone: 'neg', text: 'Казна не потянет жалованье — часть солдат разбежится. Наймите меньше.' };
    if (offers.length)
      return {
        tone: 'ok',
        text: `${game.countries[offers[0].from].name} предлагает ${offers[0].kind === 'alliance' ? 'совместный поход' : 'мир'}${offers.length > 1 ? ' (и ещё ' + (offers.length - 1) + ')' : ''}.`,
        tab: 'diplomacy',
      };
    if (generals.length === 0 && draft.buyOffers.length === 0)
      return { tone: 'warn', text: 'Без генерала армия не может наступать и плохо обороняется — купите генерала.' };
    if (campaigns.length > 0 && !generals.some((g) => taskOf(g).type === 'defend'))
      return { tone: 'warn', text: 'Все генералы ушли в поход — оборону дома никто не возглавляет.' };
    if (me.scientists === 0 && draft.hireScientists <= 0) return { tone: 'warn', text: 'Учёных нет — наука стоит на месте. Наймите учёных.' };
    if (pop >= fc.maxPop * 0.995 && !(draft.scienceAlloc[S_DENS] > 0.5))
      return { tone: 'warn', text: 'Население упёрлось в предел земли. Изучайте «Плотность» — или завоюйте новые земли.' };
    if (fc.popEnd >= fc.maxPop - 1 && !(draft.scienceAlloc[S_DENS] > 0.5))
      return { tone: 'warn', text: 'В этом году население дойдёт до предела земли. Пора изучать «Плотность».' };
    if (inTruce) {
      const left = truce - game.year + 1;
      if (left <= 3) return { tone: 'warn', text: `Мир кончится через ${years(left)} — соседи уже вооружаются. Пора нанимать солдат.` };
      return { tone: 'ok', text: `Мирное время (ещё ${years(left)}). Развивайте хозяйство и науку.` };
    }
    if (!hasScoutNow && nbs.length) return { tone: 'warn', text: 'Наймите разведчика — без него силы соседей неизвестны.' };
    const strong = nbs.find((n) => intelOf.get(n)!.known && intelOf.get(n)!.soldiers > me.soldiers * 1.6);
    if (strong != null) return { tone: 'warn', text: `${game.countries[strong].name} намного сильнее нас — держите армию дома.` };
    const weak = nbs.find((n) => intelOf.get(n)!.known && intelOf.get(n)!.soldiers < me.soldiers * 0.6);
    if (weak != null && generals.length > 0 && campaigns.length === 0)
      return { tone: 'ok', text: `У государства ${game.countries[weak].name} мало войск — хороший момент для похода.` };
    if (pop >= fc.maxPop * 0.995) return { tone: 'warn', text: 'Земли не хватает — население больше не растёт.' };
    return { tone: 'ok', text: 'Всё спокойно. Копите силы и развивайте науку.' };
  })();

  const food = hungry ? 'Голод!' : fc.grainCost > 0 ? 'Докупаем' : 'Хватает';
  const foodTone: Tone = hungry ? 'neg' : fc.grainCost > 0 ? 'warn' : 'pos';
  const total = Math.max(1, income);
  const seg = (v: number) => Math.min(100, (v / total) * 100) + '%';

  return (
    <div className="panel-body orders op">
      <div className={'op-advisor ' + advice.tone}>
        <Icon name="advisor" size={20} />
        <span>{advice.text}</span>
        {'tab' in advice && advice.tab && (
          <button className="btn small" onClick={() => onTab(advice.tab as string)}>
            Открыть
          </button>
        )}
      </div>

      <div className="op-res">
        <Tile
          ring={
            <Ring value={1} tone="gold">
              <Icon name="coins" size={20} />
            </Ring>
          }
          label="Казна"
          main={fmtShort(me.money)}
          sub={
            pendCost + pendSalary > 0 ? (
              <span className="warn">с наймом → {fmtShort(moneyAfterPick)}</span>
            ) : (
              <>
                → {fmtShort(fc.moneyEnd)} <span className={dMoney >= 0 ? 'pos' : 'neg'}>{fmtSigned(dMoney)}</span>
              </>
            )
          }
          onClick={() => setMoneyOpen(!moneyOpen)}
          on={moneyOpen}
          title="Откуда деньги — нажмите"
        />
        <Tile
          ring={
            <Ring value={fc.population / Math.max(1, fc.maxPop)} ghost={fc.popEnd / Math.max(1, fc.maxPop)} tone={atCap || willCap ? 'warn' : 'pos'}>
              <Icon name="people" size={20} />
            </Ring>
          }
          label="Народ"
          main={fmtShort(fc.population)}
          sub={atCap ? <span className="warn">предел {fmtShort(fc.maxPop)}</span> : <><span className={dPop >= 0 ? 'pos' : 'neg'}>{fmtSigned(dPop)}</span> из {fmtShort(fc.maxPop)}</>}
          title={`Население и предел земли (${fmtShort(fc.maxPop)}). Поднять предел — наука «Плотность» или новые земли.`}
        />
        <Tile
          ring={
            <Ring value={1} tone={foodTone}>
              <Icon name="wheat" size={20} />
            </Ring>
          }
          label="Еда"
          main={food}
          mainTone={foodTone}
          sub={hungry ? 'нет денег на зерно' : fc.grainCost > 0 ? `−${fmtShort(fc.grainCost)} на зерно` : `+${fmtShort(fc.saleRevenue)} продажа`}
        />
        <Tile
          ring={
            <Ring value={load} ghost={loadAfter} tone={pendSalary > 0 ? toneOf(loadAfter) : loadTone}>
              <Icon name="scales" size={20} />
            </Ring>
          }
          label="Жалованье"
          main={
            <>
              {Math.round(load * 100)}%{pendSalary > 0 && <span className={'op-after ' + toneOf(loadAfter)}>→{Math.round(loadAfter * 100)}%</span>}
            </>
          }
          mainTone={loadTone}
          sub={
            <span className="op-stack" title="Солдаты · учёные · генералы">
              <i className="s-sol" style={{ width: seg(fc.upkeepSoldiers) }} />
              <i className="s-sci" style={{ width: seg(fc.upkeepScientists) }} />
              <i className="s-gen" style={{ width: seg(fc.upkeepGenerals) }} />
              <i className="s-new" style={{ width: seg(pendSalary) }} />
            </span>
          }
          title="Какая часть дохода уходит на жалованье: солдатам, учёным, генералам"
        />
      </div>

      {moneyOpen && (
        <div className="op-money">
          <span className="pos">крестьяне +{fmtShort(fc.taxes)}</span>
          {fc.saleRevenue > 0 && <span className="pos">зерно +{fmtShort(fc.saleRevenue)}</span>}
          {fc.grainCost > 0 && <span className="neg">зерно −{fmtShort(fc.grainCost)}</span>}
          <span className="neg"><i className="dot s-sol" />солдаты −{fmtShort(fc.upkeepSoldiers)}</span>
          <span className="neg"><i className="dot s-sci" />учёные −{fmtShort(fc.upkeepScientists)}</span>
          <span className="neg"><i className="dot s-gen" />генералы −{fmtShort(fc.upkeepGenerals)}</span>
          {fc.tribIn > 0 && <span className="pos">дань нам +{fmtShort(fc.tribIn)}</span>}
          {fc.tribOut > 0 && <span className="neg">дань −{fmtShort(fc.tribOut)}</span>}
          {fc.dipOnce > 0 && <span className="neg">договоры −{fmtShort(fc.dipOnce)}</span>}
          {fc.spend - fc.dipOnce > 0 && <span className="neg">найм −{fmtShort(fc.spend - fc.dipOnce)}</span>}
          <span className="muted">· все числа в тысячах</span>
        </div>
      )}
      {fc.moneyAfterPurchases < 0 && <div className="warn-box">Денег на весь найм не хватит — часть не выполнится.</div>}

      <div className="op-grid">
        <div className="op-col">
          <Box icon="shield" title="Армия" right={<span className="op-count"><Icon name="people" size={14} /> {fmtShort(me.soldiers)}</span>}>
            <Recruit
              kind="soldier"
              have={me.soldiers}
              pop={pop}
              max={maxS}
              value={draft.hireSoldiers}
              onChange={(v) => setDraft((o) => ({ ...o, hireSoldiers: v }))}
              salary={B.soldierUpkeep}
              pick={pickS}
              setPick={setPickS}
              arrive="придут к концу года"
            />
          </Box>

          <Box icon="flag" title="Поход" className="op-campaign">
            {inTruce ? (
              <div className="op-truce">
                <Ring value={(game.year - 1) / Math.max(1, truce)} tone="pos" size={54}>
                  <b className="op-truce-n">{truce - game.year + 1}</b>
                </Ring>
                <div>
                  <b>Мирное время</b>
                  <div className="muted small">нападать нельзя никому ещё {years(truce - game.year + 1)} — копите силы</div>
                </div>
              </div>
            ) : (
              <>
                <div className={'op-nbs' + (tgt != null ? ' compact' : '')}>
                  {nbs.map((n) => {
                    const it = intelOf.get(n)!;
                    const w = strengthWord(it, me.soldiers);
                    const c = game.countries[n];
                    return (
                      <button
                        key={n}
                        className={'op-nb ' + (tgt === n ? 'on' : '')}
                        style={{ ['--c' as string]: c.color }}
                        onClick={() => onTarget(tgt === n ? null : n)}
                        title={it.known ? `армия ≈${fmtShort(it.soldiers)}` : 'Армия неизвестна — нужна разведка'}
                      >
                        <span className="op-nb-name">
                          <Mood value={rel(game, n, me.id)} size={15} /> {c.name}
                        </span>
                        <span className={'op-nb-str ' + w.tone}>
                          <Icon name={it.known ? 'shield' : 'eye'} size={13} /> {w.text}
                          {treatyBetween(game, me.id, n) && <span className="muted"> · мир</span>}
                        </span>
                        <span className={'op-vs ' + (it.known ? w.tone : 'unknown')} title="Их армия против нашей (середина — поровну)">
                          {it.known && <i style={{ width: (it.soldiers / Math.max(1, it.soldiers + me.soldiers)) * 100 + '%' }} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {tgt == null && campaigns.length === 0 && <div className="op-hint">Выберите соседа — здесь или на карте.</div>}
                {tgt != null && (
                  <div ref={formRef}>
                    <AttackForm key={tgt} game={game} geo={geo} me={me} draft={draft} setDraft={setDraft} tgt={tgt} onSent={() => onTarget(null)} onDiplomacy={onDiplomacy} />
                  </div>
                )}
              </>
            )}
            {campaigns.length > 0 && (
              <div className="op-camps">
                {campaigns.map((g) => {
                  const t = taskOf(g);
                  if (t.type !== 'attack') return null;
                  const c = game.countries[t.target];
                  const o = c?.alive ? battleOdds(game, geo, me.id, t.target, g, t.soldiers) : null;
                  const known = estimate(game, me.id, t.target, true).known;
                  return (
                    <div className="op-camp" key={g.id} style={{ ['--c' as string]: c.color }}>
                      <Icon name="swords" size={15} />
                      <span>
                        <b>{c.name}</b> · {fmtShort(t.soldiers)}
                        {o && known && <span className={chanceWord(o.p).tone}> · шанс {chanceWord(o.p).text}</span>}
                      </span>
                      <button className="btn small ghost" onClick={() => cancel(g)}>
                        Отменить
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Box>

        </div>

        <div className="op-col">
          <Box icon="flask" title="Наука" right={<span className="op-count"><Icon name="people" size={14} /> {fmtShort(sciTotal)}</span>}>
            <Recruit
              kind="scientist"
              have={me.scientists}
              pop={pop}
              max={maxSc}
              value={draft.hireScientists}
              onChange={(v) => setDraft((o) => ({ ...o, hireScientists: v }))}
              salary={B.sciUpkeep}
              pick={pickSc}
              setPick={setPickSc}
              arrive="начнут сразу"
            />
            <div className="op-sci-top">
              {sciTotal === 0 ? (
                <span className="muted">Учёных нет — наймите</span>
              ) : sciFree > 0 ? (
                <span className="warn">Без дела: {fmtShort(sciFree)}</span>
              ) : (
                <span className="muted">Все заняты</span>
              )}
              <span>
                <button className="link" onClick={() => setDraft((o) => ({ ...o, scienceAlloc: o.scienceAlloc.map(() => 100 / o.scienceAlloc.length) }))}>
                  поровну
                </button>{' '}
                <button className="link" onClick={() => setDraft((o) => ({ ...o, scienceAlloc: o.scienceAlloc.map(() => 0) }))}>
                  снять всех
                </button>
              </span>
            </div>
            <div className="op-scs">
              {SCIENCE_INFO.map((_, i) => (
                <SciCard
                  key={i}
                  i={i}
                  level={me.science.level[i]}
                  prog={me.science.progress[i]}
                  cost={levelCost(me.science.level[i], game.cellsPerCountry)}
                  n={sciCount(i)}
                  total={sciTotal}
                  ptsPer={ptsPer}
                  free={sciFree}
                  onSet={(v) => setSci(i, v)}
                />
              ))}
            </div>
          </Box>


          <Box
            icon="crown"
            title="Генералы"
            right={
              <button className={'btn small ' + (buying ? 'on' : '')} onClick={() => setBuying(!buying)}>
                {buying ? 'Скрыть рынок' : '+ Купить'}
              </button>
            }
          >
            <div className="op-gens">
              {generals.map((g) => {
                const t = taskOf(g);
                const role =
                  t.type === 'attack'
                    ? { icon: 'swords' as const, text: `поход: ${game.countries[t.target]?.name}`, cls: 'atk' }
                    : t.type === 'defend'
                      ? { icon: 'shield' as const, text: 'оборона', cls: 'def' }
                      : { icon: 'bulb' as const, text: 'учится', cls: 'study' };
                return (
                  <div className={'op-gen ' + role.cls} key={g.id}>
                    <span className="op-ava">
                      {initials(g.name)}
                      <span className="op-ava-badge">
                        <Icon name={role.icon} size={10} />
                      </span>
                    </span>
                    <span className="op-gen-main">
                      <b>{g.name}</b>
                      <span className="muted small">
                        {years(g.age)} · <Stars exp={g.exp} />
                      </span>
                    </span>
                    <span className="op-role">
                      <Icon name={role.icon} size={13} /> {role.text}
                    </span>
                  </div>
                );
              })}
              {generals.length === 0 && <div className="muted">Генералов нет — армия без командира воюет вполсилы.</div>}
            </div>
            {buying && (
              <div className="op-market">
                {me.offers.map((g) => {
                  const on = draft.buyOffers.includes(g.id);
                  return (
                    <div className={'op-offer' + (on ? ' on' : '')} key={g.id}>
                      <span className="op-ava">{initials(g.name)}</span>
                      <span className="op-gen-main">
                        <b>{g.name}</b>
                        <span className="muted small">
                          {years(g.age)} · <Stars exp={g.exp} /> · скорость {g.speed} · ум {g.intellect}
                        </span>
                      </span>
                      <button className={on ? 'btn small on' : 'btn small'} onClick={() => toggleBuy(g.id)}>
                        {on ? 'Покупаю ✓' : <><Icon name="coins" size={13} /> {fmtShort(g.price)}</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="op-scout">
              <span className="op-scout-icon">
                <Icon name="eye" size={17} />
              </span>
              {hasScoutNow ? (
                <>
                  <span>Разведчик</span>
                  <select value={scoutDraft.target ?? ''} onChange={(e) => setScout({ target: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">— отдыхает —</option>
                    {nbs.map((n) => {
                      const it = intelOf.get(n)!;
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
                    <button className="link muted" onClick={() => setScout({ hire: false })} title={`Не нанимать (${fmtShort(scoutPriceNow)})`}>
                      ✕
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="muted">Разведчика нет — силы соседей неизвестны</span>
                  <button className="btn small" onClick={() => setScout({ hire: true })} disabled={me.money < scoutPriceNow}>
                    Нанять · <Icon name="coins" size={13} /> {fmtShort(scoutPriceNow)}
                  </button>
                </>
              )}
            </div>
          </Box>
        </div>
      </div>
    </div>
  );
}
