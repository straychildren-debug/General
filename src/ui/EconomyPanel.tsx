import { useState } from 'react';
import { B } from '../core/balance';
import { fmtShort, fmtSigned } from '../core/format';
import { S_DENS } from '../core/types';
import { Card, Row, type PanelProps } from './common';

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