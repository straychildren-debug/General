import { useState } from 'react';
import { B, maxRecruits, recruitCost, type RecruitKind } from '../core/balance';
import { fmtShort, fmtSigned } from '../core/format';
import { S_DENS } from '../core/types';
import { Card, Row, Slider, type PanelProps } from './common';

function Hire({
  label,
  kind,
  have,
  pop,
  money,
  value,
  salary,
  room,
  onChange,
}: {
  label: string;
  kind: RecruitKind;
  have: number;
  pop: number;
  money: number;
  value: number;
  salary: number;
  room: number;
  onChange: (v: number) => void;
}) {
  const [firing, setFiring] = useState(false);
  const maxHire = Math.max(0, Math.min(room, maxRecruits(kind, have, pop, money)));
  const step = maxHire > 100000 ? 1000 : 100;
  const hire = Math.max(0, Math.min(maxHire, value));
  const fire = Math.max(0, Math.min(have, -value));
  return (
    <div className="hire">
      <div className="hire-head">
        <span className="hire-label">{label}</span>
        <b>{fmtShort(have)}</b>
        {hire > 0 && <span className="pos">+{fmtShort(hire)}</span>}
        {fire > 0 && <span className="neg">−{fmtShort(fire)}</span>}
      </div>
      {!firing ? (
        <>
          <Slider value={hire} min={0} max={maxHire} step={step} onChange={onChange} />
          <div className="hire-foot">
            <span className="muted small">
              {hire > 0
                ? `стоит ${fmtShort(recruitCost(kind, have, pop, hire))}, жалованье ${fmtShort(hire * salary)} в год`
                : `можно нанять до ${fmtShort(maxHire)}`}
            </span>
            <span className="hire-links">
              <button className="link" onClick={() => onChange(maxHire)} disabled={maxHire <= 0}>
                максимум
              </button>
              {value !== 0 && (
                <button className="link" onClick={() => onChange(0)}>
                  сброс
                </button>
              )}
              <button
                className="link muted"
                onClick={() => {
                  setFiring(true);
                  onChange(0);
                }}
                disabled={have <= 0}
              >
                уволить…
              </button>
            </span>
          </div>
        </>
      ) : (
        <>
          <Slider value={fire} min={0} max={Math.floor(have)} step={step} onChange={(v) => onChange(-v)} />
          <div className="hire-foot">
            <span className="muted small">{fire > 0 ? `экономия ${fmtShort(fire * salary)} в год` : 'сколько уволить'}</span>
            <button
              className="link"
              onClick={() => {
                setFiring(false);
                onChange(0);
              }}
            >
              ← к найму
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ title, now, end, delta, note, tone }: { title: string; now: string; end?: string; delta?: string; note?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className={'tile ' + (tone ?? '')}>
      <div className="tile-title">{title}</div>
      <div className="tile-main">
        {now}
        {end && <span className="tile-arrow"> → {end}</span>}
      </div>
      {delta && <div className={'tile-delta ' + (tone ?? '')}>{delta}</div>}
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

export function EconomyPanel({ me, draft, setDraft, fc }: PanelProps) {
  const peasants = Math.max(0, me.population - me.soldiers - me.scientists);
  const atCap = me.population >= fc.maxPop * 0.97;
  const room = fc.staffRoom;
  const share = (x: number) => (me.population > 0 ? (x / me.population) * 100 : 0);

  return (
    <div className="panel-body">
      <ForecastCard me={me} fc={fc} />

      <Card title="Найм">
        <Hire
          label="Солдаты"
          kind="soldier"
          have={me.soldiers}
          pop={me.population}
          money={me.money - fc.spend + fc.soldierCost}
          value={draft.hireSoldiers}
          salary={B.soldierUpkeep}
          room={room - Math.max(0, draft.hireScientists)}
          onChange={(v) => setDraft((o) => ({ ...o, hireSoldiers: v }))}
        />
        <Hire
          label="Учёные"
          kind="scientist"
          have={me.scientists}
          pop={me.population}
          money={me.money - fc.spend + fc.scientistCost}
          value={draft.hireScientists}
          salary={B.sciUpkeep}
          room={room - Math.max(0, draft.hireSoldiers)}
          onChange={(v) => setDraft((o) => ({ ...o, hireScientists: v }))}
        />
        <div className="hint">
          Солдаты и учёные — это бывшие крестьяне: крестьян меньше — меньше денег и зерна. Чем больше армия, тем дороже новобранцы.
        </div>
      </Card>

      <Card title="Население">
        <div className="popbar" title="крестьяне / учёные / солдаты">
          <div className="pb-peasants" style={{ width: share(peasants) + '%' }} />
          <div className="pb-sci" style={{ width: share(me.scientists) + '%' }} />
          <div className="pb-sold" style={{ width: share(me.soldiers) + '%' }} />
        </div>
        <div className="poplegend small">
          <span>
            <i className="pb-peasants" /> крестьяне {fmtShort(peasants)}
          </span>
          <span>
            <i className="pb-sci" /> учёные {fmtShort(me.scientists)}
          </span>
          <span>
            <i className="pb-sold" /> солдаты {fmtShort(me.soldiers)}
          </span>
        </div>
        <Row
          label={`Предел для ${me.cells} клеток земли`}
          value={atCap ? `${fmtShort(fc.maxPop)} — достигнут` : `${fmtShort(fc.maxPop)} (ещё +${fmtShort(fc.maxPop - me.population)})`}
          tone={atCap ? 'warn' : undefined}
        />
      </Card>
    </div>
  );
}

/** Прогноз на год: деньги, население, еда — общий для «Приказов» и «Подробно». */
export function ForecastCard({ me, fc, compact }: { me: PanelProps['me']; fc: PanelProps['fc']; compact?: boolean }) {
  const dMoney = fc.moneyEnd - me.money;
  const dPop = fc.popEnd - fc.population;
  const atCap = me.population >= fc.maxPop * 0.995;
  const willCap = !atCap && fc.popEnd >= fc.maxPop - 1;
  const hungry = fc.unfed > 0;
  const dens = me.science.level[S_DENS];
  const limit = `предел ${fmtShort(fc.maxPop)} (плотность, ур. ${dens})`;
  const capNote = hungry ? '' : atCap ? ' — достигнут' : willCap ? ' — дойдём в этом году' : '';
  const food = hungry ? 'Голод!' : fc.grainCost > 0 ? 'Покупаем' : 'Хватает';
  const foodNote = hungry ? 'не хватит денег на зерно' : fc.grainCost > 0 ? `докупим на ${fmtShort(fc.grainCost)}` : `излишки дадут ${fmtShort(fc.saleRevenue)}`;
  const foodTone = hungry ? 'neg' : fc.grainCost > 0 ? undefined : 'pos';
  const [money, setMoney] = useState(false);
  const moneyRows = (
    <>
      <Row label="Платят крестьяне" value={fmtSigned(fc.taxes)} tone="pos" />
      {fc.saleRevenue > 0 && <Row label="Продажа излишков зерна" value={fmtSigned(fc.saleRevenue)} tone="pos" />}
      {fc.grainCost > 0 && <Row label="Покупка зерна" value={fmtSigned(-fc.grainCost)} tone="neg" />}
      <Row label="Жалованье солдатам" value={fmtSigned(-fc.upkeepSoldiers)} tone="neg" />
      <Row label="Жалованье учёным" value={fmtSigned(-fc.upkeepScientists)} tone="neg" />
      <Row label="Генералы" value={fmtSigned(-fc.upkeepGenerals)} tone="neg" />
      {fc.tribIn > 0 && <Row label="Дань нам" value={fmtSigned(fc.tribIn)} tone="pos" />}
      {fc.tribOut > 0 && <Row label="Дань, которую платим" value={fmtSigned(-fc.tribOut)} tone="neg" />}
      {fc.dipOnce > 0 && <Row label="Платежи по договорам" value={fmtSigned(-fc.dipOnce)} tone="neg" />}
      {fc.spend - fc.dipOnce > 0 && <Row label="Найм и покупки" value={fmtSigned(-(fc.spend - fc.dipOnce))} tone="neg" />}
    </>
  );
  return (
    <Card
      title="Прогноз на год"
      right={
        compact ? (
          <button className="link" onClick={() => setMoney(!money)}>
            {money ? 'скрыть' : 'откуда деньги'}
          </button>
        ) : undefined
      }
    >
      {compact ? (
        <div className="fc-rows">
          <div className="fc-row">
            <span className="muted">Деньги</span>
            <b>
              {fmtShort(me.money)} → {fmtShort(fc.moneyEnd)}
            </b>
            <span className={dMoney >= 0 ? 'pos' : 'neg'}>{fmtSigned(dMoney)}</span>
          </div>
          <div className="fc-row">
            <span className="muted">Население</span>
            <b>
              {fmtShort(fc.population)} → {fmtShort(fc.popEnd)}
            </b>
            <span className={dPop >= 0 ? 'pos' : 'neg'}>{fmtSigned(dPop)}</span>
          </div>
          <div className={'fc-sub ' + (atCap || willCap ? 'warn' : 'muted')}>
            {limit}
            {capNote}
          </div>
          <div className="fc-row">
            <span className="muted">Еда</span>
            <b className={foodTone}>{food}</b>
            <span className="muted small">{foodNote}</span>
          </div>
        </div>
      ) : (
        <div className="tiles">
          <Tile title="Деньги" now={fmtShort(me.money)} end={fmtShort(fc.moneyEnd)} delta={`${fmtSigned(dMoney)} за год`} tone={dMoney >= 0 ? 'pos' : 'neg'} />
          <Tile
            title="Население"
            now={fmtShort(fc.population)}
            end={fmtShort(fc.popEnd)}
            delta={`${fmtSigned(dPop)} за год`}
            note={limit + capNote}
            tone={dPop >= 0 ? 'pos' : 'neg'}
          />
          <Tile title="Еда" now={food} note={foodNote} tone={foodTone} />
        </div>
      )}
      {fc.moneyAfterPurchases < 0 && <div className="warn-box">Денег на весь найм не хватит — часть не выполнится.</div>}
      {fc.unpaid > 0 && <div className="warn-box">Не хватит денег на жалованье — разбежится около {fmtShort(fc.unpaid / B.soldierUpkeep)} солдат.</div>}
      {hungry && <div className="warn-box">Голод: умрёт около {fmtShort(-dPop)} человек. Наймите меньше людей.</div>}
      {compact ? (
        money && <div className="fc-money">{moneyRows}</div>
      ) : (
        <details className="more-inline">
          <summary>Откуда деньги</summary>
          {moneyRows}
        </details>
      )}
    </Card>
  );
}