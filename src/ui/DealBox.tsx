import { useState } from 'react';
import { aiEvaluateDeal, annualIncome, type DealAnswer } from '../ai/diplomacyAi';
import { dealText, DIP, disgraced, honorOf, rel } from '../core/diplomacy';
import { fmtShort, years } from '../core/format';
import type { Geo } from '../core/geo';
import type { Country, Deal, DiplomacyOrders, GameState, Orders } from '../core/types';
import { Mood, Seg, Slider } from './common';

type Kind = 'peace' | 'buyoff' | 'tribute' | 'alliance' | 'gift';

export const EMPTY_DIP: DiplomacyOrders = { deals: [], accept: [], cancel: [] };

/**
 * Дипломатия с одной страной: её предложения нам, наши согласованные сделки, действующий
 * договор и переговоры (мир, откуп, дань, совместный поход, подарок).
 */
export function DealBox({
  game,
  geo,
  me,
  draft,
  setDraft,
  tgt,
  startOpen,
}: {
  game: GameState;
  geo: Geo;
  me: Country;
  draft: Orders;
  setDraft: (f: (o: Orders) => Orders) => void;
  tgt: number;
  startOpen?: boolean;
}) {
  const dip = draft.diplomacy ?? EMPTY_DIP;
  const setDip = (f: (d: DiplomacyOrders) => DiplomacyOrders) => setDraft((o) => ({ ...o, diplomacy: f(o.diplomacy ?? EMPTY_DIP) }));
  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const neighbor = nbs.includes(tgt);
  const name = (id: number) => game.countries[id].name;
  const shamed = disgraced(game, me.id);
  const [open, setOpen] = useState(!!startOpen);

  const incoming = (game.offers ?? []).filter((d) => d.to === me.id && d.from === tgt && d.year === game.year);
  const toggleAccept = (id: number) => setDip((d) => ({ ...d, accept: d.accept.includes(id) ? d.accept.filter((x) => x !== id) : [...d.accept, id] }));
  const treaties = (game.treaties ?? []).filter(
    (t) => ((t.a === me.id && t.b === tgt) || (t.b === me.id && t.a === tgt)) && t.start <= game.year && game.year <= t.until,
  );
  const toggleCancel = (id: number) => setDip((d) => ({ ...d, cancel: d.cancel.includes(id) ? d.cancel.filter((x) => x !== id) : [...d.cancel, id] }));
  const myDeals = dip.deals.map((d, k) => ({ d, k })).filter(({ d }) => d.to === tgt);

  const [kind, setKind] = useState<Kind>('peace');
  const [yrs, setYrs] = useState(5);
  const [sum, setSum] = useState(0);
  const [ally, setAlly] = useState<number | null>(null);
  const [answer, setAnswer] = useState<DealAnswer | null>(null);
  const income = annualIncome(game, geo, me.id);
  const common = nbs.filter((T) => T !== tgt && geo.neighbors[tgt].includes(T));
  const allyTarget = ally != null && common.includes(ally) ? ally : (common[0] ?? null);
  const spentAlready = dip.deals.reduce((a, d) => a + (d.payer === me.id ? d.once : 0), 0);
  const moneyLeft = Math.max(0, me.money - spentAlready);
  const sumMax = kind === 'tribute' ? Math.round(income * 0.5) : Math.round(moneyLeft);

  const build = (): Deal | null => {
    const base: Deal = { id: -Date.now(), from: me.id, to: tgt, kind: 'peace', years: yrs, payer: null, once: 0, yearly: 0, target: null, ultimatum: false, year: game.year };
    if (kind === 'peace') return base;
    if (kind === 'buyoff') return { ...base, payer: me.id, once: sum };
    if (kind === 'tribute') return { ...base, payer: me.id, yearly: sum };
    if (kind === 'gift') return { ...base, kind: 'gift', years: 0, payer: me.id, once: sum };
    if (allyTarget == null) return null;
    return { ...base, kind: 'alliance', years: 1, target: allyTarget, payer: sum > 0 ? me.id : null, once: sum };
  };
  const agree = (d: Deal) => {
    setDip((x) => ({ ...x, deals: [...x.deals, d] }));
    setAnswer(null);
  };
  const propose = () => {
    const d = build();
    if (!d) return;
    if (game.countries[tgt].controller === 'human') return agree(d);
    const a = aiEvaluateDeal(game, geo, d);
    if (a.accept) agree(d);
    setAnswer(a);
  };

  return (
    <div className="deal">
      {incoming.map((d) => {
        const on = dip.accept.includes(d.id);
        const cantPay = d.payer === me.id && d.once > me.money;
        return (
          <div className={'dline' + (d.ultimatum ? ' ultimatum' : '')} key={d.id}>
            <div className="small">
              <b>{d.ultimatum ? 'Требует: ' : 'Предлагает: '}</b>
              {dealText(game, d, me.id)}
              {d.ultimatum && <span className="neg"> — иначе нападёт</span>}
            </div>
            <button className={'btn small ' + (on ? 'on' : 'primary')} onClick={() => toggleAccept(d.id)} disabled={!on && cantPay}>
              {on ? 'Принято ✓' : 'Принять'}
            </button>
          </div>
        );
      })}
      {myDeals.map(({ d, k }) => (
        <div className="dline new" key={'n' + k}>
          <div className="small">
            <span className="tag">{game.countries[d.to].controller === 'human' ? 'отправлено' : 'согласовано'}</span> {dealText(game, d, me.id)}
          </div>
          <button className="btn small ghost" onClick={() => setDip((x) => ({ ...x, deals: x.deals.filter((_, j) => j !== k) }))}>
            Отменить
          </button>
        </div>
      ))}
      {treaties.map((t) => {
        const cancelling = dip.cancel.includes(t.id);
        return (
          <div className="dline" key={t.id}>
            <div className="small">
              {dealText(game, t, me.id)} · {t.ending || cancelling ? 'закончится в этом году' : `ещё ${years(t.until - game.year + 1)}`}
            </div>
            {t.kind === 'peace' && !t.ending && (
              <button
                className={'btn small ' + (cancelling ? 'on' : 'ghost')}
                onClick={() => toggleCancel(t.id)}
                title="Договор перестанет действовать после этого года. Честь не пострадает — в отличие от нападения раньше срока."
              >
                {cancelling ? 'Расторгаю ✓' : 'Расторгнуть'}
              </button>
            )}
          </div>
        );
      })}

      {!neighbor ? (
        <div className="muted small">Договариваться можно только с соседями.</div>
      ) : shamed ? (
        <div className="warn-box">
          Вы нарушили договор — с вами не договариваются ещё около {years(Math.ceil((DIP.minHonor - honorOf(game, me.id)) / DIP.honorRegen))}.
        </div>
      ) : !open ? (
        <button className="btn small" onClick={() => setOpen(true)}>
          Договориться…
        </button>
      ) : (
        <div className="dip-form">
          <Seg<Kind>
            value={kind}
            onChange={(k) => {
              setKind(k);
              setSum(0);
              setAnswer(null);
            }}
            options={[
              { value: 'peace', label: 'Мир' },
              { value: 'buyoff', label: 'Откуп' },
              { value: 'tribute', label: 'Дань' },
              { value: 'alliance', label: 'Поход' },
              { value: 'gift', label: 'Подарок' },
            ]}
          />
          <div className="hint first">
            {kind === 'peace' && 'Не нападать друг на друга. Бесплатно — если выгодно обеим сторонам.'}
            {kind === 'buyoff' && 'Заплатить один раз — и сосед обещает не нападать.'}
            {kind === 'tribute' && 'Платить каждый год — сосед не нападает, пока платите.'}
            {kind === 'alliance' && 'Вместе напасть на общего соседа в этом году. Можно доплатить.'}
            {kind === 'gift' && 'Деньги в знак дружбы: отношение к вам улучшится.'}
          </div>
          {(kind === 'peace' || kind === 'buyoff' || kind === 'tribute') && (
            <div className="form-row">
              <span className="muted">Срок</span>
              <Seg<'5' | '10'>
                value={String(yrs) as '5' | '10'}
                onChange={(v) => setYrs(Number(v))}
                options={[
                  { value: '5', label: '5 лет' },
                  { value: '10', label: '10 лет' },
                ]}
              />
            </div>
          )}
          {kind === 'alliance' && (
            <div className="form-row">
              <span className="muted">Против</span>
              {common.length ? (
                <select value={allyTarget ?? ''} onChange={(e) => setAlly(Number(e.target.value))}>
                  {common.map((T) => (
                    <option key={T} value={T}>
                      {name(T)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">общих соседей нет</span>
              )}
            </div>
          )}
          {kind !== 'peace' && (
            <>
              <div className="form-row">
                <span className="muted">{kind === 'tribute' ? 'В год' : kind === 'alliance' ? 'Доплата' : 'Сумма'}</span>
                <b>{fmtShort(Math.min(sum, sumMax))}</b>
              </div>
              <Slider value={Math.min(sum, sumMax)} min={0} max={Math.max(1, sumMax)} step={1000} onChange={setSum} />
            </>
          )}
          <button className="btn primary" onClick={propose} disabled={(kind === 'buyoff' || kind === 'tribute' || kind === 'gift') && sum <= 0}>
            Предложить
          </button>
          {answer && (
            <div className={'answer ' + (answer.accept ? 'good' : 'bad')}>
              <Mood value={rel(game, tgt, me.id)} /> «{answer.text}»
              {answer.counter && (
                <button className="btn small" onClick={() => agree(answer.counter!)} disabled={answer.counter.once > moneyLeft}>
                  Заплатить {fmtShort(answer.counter.once)}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
