import { B, intelError, levelCost, multAt, sciMult, SCIENCE_INFO } from '../core/balance';
import { fmtShort, years as yearsText } from '../core/format';
import { S_FORT, S_INTEL, S_MIL, S_SCI } from '../core/types';
import { Card, Slider, type PanelProps } from './common';

/** Коротко: что даёт уровень. */
function effectText(i: number, level: number): string {
  if (i === S_INTEL) return `разведка ±${Math.round(intelError(level) * 75)}%`;
  if (i === S_MIL) return `атака +${level * 10}%`;
  if (i === S_FORT) return `оборона +${Math.round((multAt(i, level) - 1) * 100)}%`;
  return `${SCIENCE_INFO[i].effect} +${Math.round((multAt(i, level) - 1) * 100)}%`;
}

export function SciencePanel({ game, me, draft, setDraft, fc }: PanelProps) {
  const total = Math.max(0, fc.scientists);
  const cpc = game.cellsPerCountry;
  const ptsPer = B.ptsPerSci * sciMult(me, S_SCI); // очков от одного учёного в год
  const count = (i: number) => Math.round((Math.max(0, draft.scienceAlloc[i]) / 100) * total);
  const assigned = draft.scienceAlloc.reduce((a, _, i) => a + count(i), 0);
  const free = Math.max(0, total - assigned);

  const setCount = (i: number, n: number) =>
    setDraft((o) => {
      const max = count(i) + free;
      const v = Math.max(0, Math.min(max, Math.round(n)));
      const a = o.scienceAlloc.slice();
      a[i] = total > 0 ? (v / total) * 100 : 0;
      return { ...o, scienceAlloc: a };
    });

  return (
    <div className="panel-body">
      <Card
        title={`Учёные · ${fmtShort(total)}`}
        right={
          <span className="sci-top-buttons">
            <button
              className="link"
              onClick={() => setDraft((o) => ({ ...o, scienceAlloc: o.scienceAlloc.map(() => 100 / o.scienceAlloc.length) }))}
            >
              поровну
            </button>
            <button className="link" onClick={() => setDraft((o) => ({ ...o, scienceAlloc: o.scienceAlloc.map(() => 0) }))}>
              снять всех
            </button>
          </span>
        }
      >
        {free > 0 ? (
          <div className="warn-box">Без дела сидят {fmtShort(free)} учёных — раздайте их по направлениям ниже.</div>
        ) : (
          <div className="hint first">Все учёные заняты. Нанять ещё — во вкладке «Хозяйство».</div>
        )}
      </Card>

      <div className="sci-list">
        {SCIENCE_INFO.map((s, i) => {
          const L = me.science.level[i];
          const left = Math.max(0, levelCost(L, cpc) - me.science.progress[i]);
          const n = count(i);
          const needFor1 = Math.ceil(left / ptsPer);
          const years = n > 0 ? Math.ceil(left / (n * ptsPer)) : null;
          return (
            <div className={'sci card' + (n > 0 ? ' active' : '')} key={i}>
              <div className="sci-head">
                <span className="sci-name">
                  {s.name} <span className="sci-level">ур. {L}</span>
                </span>
                <span className="small muted">
                  {years === null ? 'не изучается' : years <= 1 ? 'откроют в этом году' : `откроют через ${yearsText(years)}`}
                </span>
              </div>
              <div className="sci-effect muted small">
                {L + 1}-й уровень даст: {effectText(i, L + 1)}
              </div>
              <div className="sci-ctrl">
                <b className="sci-count">{fmtShort(n)}</b>
                <Slider value={n} min={0} max={Math.max(1, total)} step={100} onChange={(v) => setCount(i, v)} />
                <button
                  className="btn small"
                  title={`Нужно ${fmtShort(needFor1)} учёных`}
                  onClick={() => setCount(i, needFor1)}
                  disabled={free <= 0 && n >= needFor1}
                >
                  За 1 год
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
