import { useState } from 'react';
import { aiEvaluateDeal, annualIncome, type DealAnswer } from '../ai/diplomacyAi';
import { dealText, DIP, disgraced, honorOf, partnerOf, rel, treatyBetween } from '../core/diplomacy';
import { fmtShort, years } from '../core/format';
import type { Deal, DiplomacyOrders } from '../core/types';
import { Card, Honor, Mood, Seg, Slider, Swatch, type PanelProps } from './common';

interface Props extends PanelProps {
  target: number | null;
  onTarget: (id: number | null) => void;
}

type Kind = 'peace' | 'buyoff' | 'tribute' | 'alliance' | 'gift';

const EMPTY: DiplomacyOrders = { deals: [], accept: [], cancel: [] };

export function DiplomacyPanel({ game, geo, me, draft, setDraft, target, onTarget }: Props) {
  const dip = draft.diplomacy ?? EMPTY;
  const setDip = (f: (d: DiplomacyOrders) => DiplomacyOrders) => setDraft((o) => ({ ...o, diplomacy: f(o.diplomacy ?? EMPTY) }));
  const nbs = geo.neighbors[me.id].filter((n) => game.countries[n].alive);
  const name = (id: number) => game.countries[id].name;
  const myHonor = honorOf(game, me.id);
  const shamed = disgraced(game, me.id);

  // ── Входящие предложения ──
  const incoming = (game.offers ?? []).filter((d) => d.to === me.id && d.year === game.year && game.countries[d.from].alive);
  const toggleAccept = (id: number) =>
    setDip((d) => ({ ...d, accept: d.accept.includes(id) ? d.accept.filter((x) => x !== id) : [...d.accept, id] }));

  // ── Действующие договоры ──
  const treaties = (game.treaties ?? []).filter((t) => (t.a === me.id || t.b === me.id) && t.start <= game.year && game.year <= t.until);
  const toggleCancel = (id: number) =>
    setDip((d) => ({ ...d, cancel: d.cancel.includes(id) ? d.cancel.filter((x) => x !== id) : [...d.cancel, id] }));

  // ── Новое предложение ──
  const tgt = target != null && nbs.includes(target) ? target : null;
  const [kind, setKind] = useState<Kind>('peace');
  const [yrs, setYrs] = useState(5);
  const [sum, setSum] = useState(0);
  const [ally, setAlly] = useState<number | null>(null);
  const [answer, setAnswer] = useState<{ tgt: number; text: DealAnswer } | null>(null);
  const income = annualIncome(game, geo, me.id);
  const common = tgt == null ? [] : nbs.filter((T) => T !== tgt && geo.neighbors[tgt].includes(T));
  const allyTarget = ally != null && common.includes(ally) ? ally : (common[0] ?? null);
  const spentAlready = dip.deals.reduce((a, d) => a + (d.payer === me.id ? d.once : 0), 0);
  const moneyLeft = Math.max(0, me.money - spentAlready);
  const sumMax = kind === 'tribute' ? Math.round(income * 0.5) : Math.round(moneyLeft);

  const build = (): Deal | null => {
    if (tgt == null) return null;
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
    if (game.countries[d.to].controller === 'human') {
      agree(d);
      return;
    }
    const a = aiEvaluateDeal(game, geo, d);
    if (a.accept) agree(d);
    setAnswer({ tgt: d.to, text: a });
  };

  return (
    <div className="panel-body dip">
      <Card title="Ваша честь" right={<Honor value={myHonor} />}>
        {shamed ? (
          <div className="warn-box">
            Вы нарушили договор — с вами не хотят договариваться. Честь восстановится примерно через{' '}
            {years(Math.ceil((DIP.minHonor - myHonor) / DIP.honorRegen))}.
          </div>
        ) : (
          <div className="hint first">Нарушите договор — потеряете честь, и долго никто не захочет с вами договариваться.</div>
        )}
      </Card>

      {incoming.length > 0 && (
        <Card title="Предложения вам">
          <div className="dlist">
            {incoming.map((d) => {
              const on = dip.accept.includes(d.id);
              const cantPay = d.payer === me.id && d.once > me.money;
              return (
                <div className={'dline' + (d.ultimatum ? ' ultimatum' : '')} key={d.id}>
                  <div>
                    <Mood value={rel(game, d.from, me.id)} />
                    <b>{name(d.from)}</b>
                    {d.ultimatum && <span className="tag bad">ультиматум</span>}
                    <div className="small">
                      {d.ultimatum ? 'Требует: ' : 'Предлагает: '}
                      {dealText(game, d, me.id)}
                      {d.ultimatum && <span className="neg"> — иначе нападёт</span>}
                    </div>
                  </div>
                  <button className={'btn small ' + (on ? 'on' : '')} onClick={() => toggleAccept(d.id)} disabled={!on && cantPay}>
                    {on ? 'Принято ✓' : 'Принять'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="hint">Не принятые до конца года предложения считаются отклонёнными.</div>
        </Card>
      )}

      <Card title="Договориться">
        <div className="chips">
          {nbs.map((n) => (
            <button key={n} className={'chip ' + (tgt === n ? 'on' : '')} onClick={() => onTarget(tgt === n ? null : n)}>
              <Mood value={rel(game, n, me.id)} size={16} />
              {name(n)}
              {treatyBetween(game, me.id, n) && <span className="muted"> · мир</span>}
            </button>
          ))}
        </div>
        {tgt == null ? (
          <div className="hint">Выберите соседа — здесь или щелчком по карте.</div>
        ) : shamed ? (
          <div className="warn-box">С вами сейчас никто не договаривается.</div>
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
                { value: 'alliance', label: 'Вместе в поход' },
                { value: 'gift', label: 'Подарок' },
              ]}
            />
            <div className="hint">
              {kind === 'peace' && 'Не нападать друг на друга. Бесплатно — если выгодно обеим сторонам.'}
              {kind === 'buyoff' && 'Заплатить один раз — и сосед обещает не нападать.'}
              {kind === 'tribute' && 'Платить каждый год — сосед не нападает, пока платите.'}
              {kind === 'alliance' && 'Вместе напасть на общего соседа в этом году. Можно доплатить, чтобы уговорить.'}
              {kind === 'gift' && 'Деньги в знак дружбы: сосед станет относиться к вам лучше.'}
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
            <button
              className="btn primary wide"
              onClick={propose}
              disabled={(kind === 'buyoff' || kind === 'tribute' || kind === 'gift') && sum <= 0}
            >
              Предложить государству {name(tgt)}
            </button>
            {answer && answer.tgt === tgt && (
              <div className={'answer ' + (answer.text.accept ? 'good' : 'bad')}>
                <Mood value={rel(game, tgt, me.id)} /> «{answer.text.text}»
                {answer.text.counter && (
                  <button
                    className="btn small"
                    onClick={() => agree(answer.text.counter!)}
                    disabled={answer.text.counter.once > moneyLeft}
                    title={answer.text.counter.once > moneyLeft ? 'Не хватает денег' : undefined}
                  >
                    Заплатить {fmtShort(answer.text.counter.once)}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {(dip.deals.length > 0 || treaties.length > 0) && (
        <Card title="Договоры">
          <div className="dlist">
            {dip.deals.map((d, k) => (
              <div className="dline new" key={'n' + k}>
                <div>
                  <Swatch color={game.countries[d.to].color} />
                  <b>{name(d.to)}</b>
                  <span className="tag">{game.countries[d.to].controller === 'human' ? 'отправлено' : 'согласовано'}</span>
                  <div className="small">{dealText(game, d, me.id)}</div>
                </div>
                <button className="btn small ghost" onClick={() => setDip((x) => ({ ...x, deals: x.deals.filter((_, j) => j !== k) }))}>
                  Отменить
                </button>
              </div>
            ))}
            {treaties.map((t) => {
              const p = partnerOf(t, me.id);
              const left = t.until - game.year + 1;
              const cancelling = dip.cancel.includes(t.id);
              return (
                <div className="dline" key={t.id}>
                  <div>
                    <Mood value={rel(game, p, me.id)} />
                    <b>{name(p)}</b>
                    <div className="small">
                      {dealText(game, t, me.id)} · {t.ending || cancelling ? 'закончится в этом году' : `ещё ${years(left)}`}
                    </div>
                  </div>
                  {t.kind === 'peace' && !t.ending && (
                    <button className={'btn small ' + (cancelling ? 'on' : 'ghost')} onClick={() => toggleCancel(t.id)} title="Договор перестанет действовать после этого года. Честь не пострадает.">
                      {cancelling ? 'Расторгаю ✓' : 'Расторгнуть'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hint">Расторгнуть честно: договор перестанет действовать после этого года. Напасть раньше — предательство.</div>
        </Card>
      )}
    </div>
  );
}
