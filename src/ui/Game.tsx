import { useCallback, useEffect, useMemo, useState } from 'react';
import { advanceYear } from '../ai/year';
import { forecast } from '../core/econ';
import { fmtShort, fmtSigned, pct } from '../core/format';
import { defaultOrders } from '../core/game';
import { computeGeo } from '../core/geo';
import { battleVisible } from '../core/intel';
import type { BattleReport, GameState, Orders } from '../core/types';
import { BattleReportView } from './BattleReportView';
import { CountryCard } from './CountryCard';
import { MyCountryCard } from './MyCountryCard';
import { Honor, MOOD, moodLevel, Swatch } from './common';
import { disgraced, honorOf, rel } from '../core/diplomacy';
import { OrdersPanel } from './OrdersPanel';
import { autoTasks } from './autoGenerals';
import { attackArrow, centroids, ownerAtYear } from './mapGeometry';
import { MapView, type Arrow, type MapBadge } from './MapView';
import { warlike, WAR_COLORS } from './rulers';
import { NewsPanel, YearView } from './NewsPanel';
import { saveGame } from './storage';
import { WorldPanel } from './WorldPanel';

type Tab = 'orders' | 'world' | 'news';

function makeDrafts(g: GameState): Record<number, Orders> {
  const res: Record<number, Orders> = {};
  for (const c of g.countries) {
    if (!c.alive || c.controller !== 'human') continue;
    const o = defaultOrders(c);
    // Генералы назначаются сами: лучший — в оборону, остальные учатся
    o.tasks = autoTasks(c, o.tasks);
    res[c.id] = o;
  }
  return res;
}

export function Game({ initial, onExit }: { initial: GameState; onExit: () => void }) {
  const [game, setGame] = useState(initial);
  const geo = useMemo(() => computeGeo(game), [game]);
  const humans = useMemo(
    () => game.countries.filter((c) => c.alive && c.controller === 'human').map((c) => c.id),
    [game],
  );
  const hadHumans = game.countries.some((c) => c.controller === 'human');
  const [turnIdx, setTurnIdx] = useState(0);
  const viewer = humans.length ? humans[Math.min(turnIdx, humans.length - 1)] : null;
  const [drafts, setDrafts] = useState<Record<number, Orders>>(() => makeDrafts(initial));
  const [handoff, setHandoff] = useState(humans.length > 1);
  const [showReport, setShowReport] = useState(false);
  // Донесения о сражениях: открываются сами после года, если страна игрока воевала
  const [battleOpen, setBattleOpen] = useState<{ year: number; list: BattleReport[]; i: number } | null>(null);
  const openReport = (g: GameState, v: number | null) => {
    setShowReport(true);
    const rep = g.reports[g.reports.length - 1];
    const mine = rep && v != null ? rep.battles.filter((b) => b.attacker === v || b.defender === v) : [];
    setBattleOpen(mine.length ? { year: rep.year, list: mine, i: 0 } : null);
  };
  const openBattle = (b: BattleReport, year: number) => setBattleOpen({ year, list: [b], i: 0 });
  const [tab, setTab] = useState<Tab>(viewer != null ? 'orders' : 'world');
  const [selected, setSelected] = useState<number | null>(null);
  const [attackTarget, setAttackTarget] = useState<number | null>(null);
  const [helpHidden, setHelpHidden] = useState(() => {
    try {
      return localStorage.getItem('polkovodets.help') === 'hidden';
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState<'political' | 'terrain'>('political');
  const [showBattles, setShowBattles] = useState(true);
  const [chron, setChron] = useState<number | null>(null);
  const [chronPlay, setChronPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [defeatSeen, setDefeatSeen] = useState(false);
  const [overSeen, setOverSeen] = useState(false);

  const me = viewer != null ? game.countries[viewer] : null;
  const draft = viewer != null ? drafts[viewer] ?? defaultOrders(game.countries[viewer]) : null;
  const setDraft = useCallback(
    (f: (o: Orders) => Orders) => {
      if (viewer == null) return;
      setDrafts((d) => ({ ...d, [viewer]: f(d[viewer] ?? defaultOrders(game.countries[viewer])) }));
    },
    [viewer, game],
  );
  const fc = useMemo(() => (me && draft ? forecast(game, geo, me, draft) : null), [game, geo, me, draft]);

  const owner = useMemo(() => (chron != null ? ownerAtYear(game, chron) : game.map.owner), [game, chron]);
  const n = game.countries.length;
  const cents = useMemo(() => centroids(game.map, owner, n), [game.map, owner, n]);
  const myNbs = viewer != null ? geo.neighbors[viewer] : [];
  // Туман: игрок видит на карте только себя и соседей (после конца игры — всё)
  const mapOwner = useMemo(() => {
    if (viewer == null || game.over) return owner;
    const vis = new Set([viewer, ...geo.neighbors[viewer]]);
    return owner.map((o) => (o < 0 || vis.has(o) ? o : n));
  }, [owner, viewer, game.over, geo, n]);

  const arrows = useMemo(() => {
    const res: Arrow[] = [];
    if (chron != null) return res;
    const last = game.reports[game.reports.length - 1];
    if (showBattles && last) {
      for (const b of last.battles) {
        if (!battleVisible(viewer, myNbs, b.attacker, b.defender)) continue;
        const seg = attackArrow(game.map, owner, cents, b.attacker, b.defender);
        if (!seg) continue;
        const mine = viewer != null && (b.attacker === viewer || b.defender === viewer);
        const good = (b.attacker === viewer) === b.attackerWon;
        res.push({
          from: seg[0],
          to: seg[1],
          color: mine ? (good ? '#5fd37a' : '#ff5a4f') : b.attackerWon ? 'rgba(255,140,100,0.9)' : 'rgba(210,210,210,0.75)',
          width: mine ? 3 : 2,
          dashed: !b.attackerWon,
        });
      }
    }
    if (me && draft) {
      for (const g of me.generals) {
        const t = draft.tasks[g.id];
        if (t?.type !== 'attack') continue;
        const seg = attackArrow(game.map, owner, cents, me.id, t.target);
        if (seg) res.push({ from: seg[0], to: seg[1], color: '#ffd666', width: 4.5 });
      }
    }
    return res;
  }, [chron, game, owner, cents, showBattles, viewer, me, draft, myNbs]);

  const endTurn = useCallback(() => {
    if (busy || game.over) return;
    if (viewer != null && turnIdx < humans.length - 1) {
      setTurnIdx(turnIdx + 1);
      setHandoff(true);
      setSelected(null);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const human: Record<number, Orders> = {};
      for (const id of humans) human[id] = drafts[id] ?? defaultOrders(game.countries[id]);
      const next = advanceYear(game, human);
      const nextHumans = next.countries.filter((c) => c.alive && c.controller === 'human');
      setGame(next);
      setDrafts(makeDrafts(next));
      setTurnIdx(0);
      if (nextHumans.length > 1) setHandoff(true);
      else if (nextHumans.length === 1) openReport(next, nextHumans[0].id);
      saveGame(next);
      setBusy(false);
    }, 20);
  }, [busy, game, geo, humans, drafts, viewer, turnIdx]);

  // Автоигра в режиме наблюдателя
  useEffect(() => {
    if (!auto || humans.length || game.over || busy) return;
    const t = setTimeout(endTurn, 350);
    return () => clearTimeout(t);
  }, [auto, humans.length, game.over, busy, endTurn]);

  // Проигрывание хроники
  useEffect(() => {
    if (!chronPlay || chron == null) return;
    if (chron >= game.year) {
      setChronPlay(false);
      return;
    }
    const t = setTimeout(() => setChron((y) => (y == null ? null : y + 1)), 180);
    return () => clearTimeout(t);
  }, [chronPlay, chron, game.year]);

  // Щелчок по своей стране — к приказам; по чужой — карточка страны на карте (разведка, отношения, поход)
  const [card, setCardState] = useState<{ id: number; deal: boolean } | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const setCard = (id: number | null, deal = false) => {
    setCardState(id == null ? null : { id, deal });
    if (id != null) setNewsOpen(false);
  };
  const onSelect = (id: number | null) => {
    setSelected(id);
    if (id == null || viewer == null) {
      setCard(null);
      if (id != null) setTab('world');
      return;
    }
    setCard(id);
  };
  // «Договориться» — карточка страны с открытыми переговорами
  const openDiplomacy = (id: number) => {
    setSelected(id);
    setCard(id, true);
  };
  const onTarget = (id: number | null) => {
    setAttackTarget(id);
    setSelected(id);
  };

  // У игрока справа только «Приказы»; «События» открываются кнопкой над картой
  const tabs: { id: Tab; label: string }[] = viewer != null
    ? [{ id: 'orders', label: 'Приказы' }]
    : [
        { id: 'world', label: 'Мир' },
        { id: 'news', label: 'События' },
      ];
  // Значки на карте: отношение к нам, нрав, население
  const badges = useMemo<(MapBadge | null)[]>(
    () =>
      game.countries.map((c) => {
        if (!c.alive) return null;
        const r = viewer != null && c.id !== viewer ? rel(game, c.id, viewer) : null;
        const lvl = r == null ? 0 : moodLevel(r);
        const w = c.id === viewer ? null : warlike(game, c.id);
        return {
          mood: r == null ? null : { color: MOOD[lvl].color, curve: MOOD[lvl].curve, angry: lvl === 0 },
          war: w ? { level: w.level, color: WAR_COLORS[w.level] } : null,
          pop: fmtShort(c.population),
        };
      }),
    [game, viewer],
  );
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const panelProps = me && draft && fc ? { game, geo, me, draft, setDraft, fc, onSelect } : null;
  const lastRep = game.reports[game.reports.length - 1];
  const prevCells = game.history.length >= 2 ? game.history[game.history.length - 2].cells : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">Полководец</div>
        {me ? (
          <button className="country-chip" style={{ borderColor: me.color }} onClick={() => setCard(card?.id === me.id ? null : me.id)} title="Ваша страна: генералы, разведчик, соседи">
            <Swatch color={me.color} />
            <div>
              <div className="cc-name">{me.name}</div>
              <div className="cc-sub">{me.playerName}</div>
            </div>
          </button>
        ) : (
          <div className="country-chip muted">Наблюдатель</div>
        )}
        {me && (
          <div
            className={'honor-chip' + (disgraced(game, me.id) ? ' shamed' : '')}
            title={disgraced(game, me.id) ? 'Вы нарушили договор — с вами не договариваются' : 'Ваша честь: нарушите договор — потеряете её, и долго никто не захочет договариваться'}
          >
            <span className="stat-label">Честь</span>
            <Honor value={honorOf(game, me.id)} />
          </div>
        )}
        <div className="year">
          <span className="muted">Год</span> <b>{game.year}</b>
        </div>
        {me && fc && (
          <div className="stats">
            <Stat
              label="Деньги"
              value={fmtShort(me.money + fc.onceIn - fc.spend)}
              sub={fmtSigned(fc.moneyEnd - (me.money + fc.onceIn - fc.spend)) + ' за год'}
              subTone={fc.moneyEnd >= me.money + fc.onceIn - fc.spend ? 'pos' : 'neg'}
            />
            <Stat label="Население" value={fmtShort(me.population)} sub={fmtSigned(fc.popEnd - me.population) + ' за год'} subTone={fc.popEnd >= me.population ? 'pos' : 'neg'} />

            <Stat label="Солдаты" value={fmtShort(me.soldiers)} />

            <Stat label="Земля" value={pct(me.cells / game.map.landCells, 1)} />
          </div>
        )}
        <div className="spacer" />
        <button className="btn ghost" onClick={() => { saveGame(game); onExit(); }}>
          Меню
        </button>
        {viewer != null ? (
          <button className="btn primary" onClick={endTurn} disabled={busy || game.over}>
            {busy ? 'Обработка…' : humans.length > 1 && turnIdx < humans.length - 1 ? 'Передать ход' : 'Завершить год'}
          </button>
        ) : (
          <>
            <button className="btn" onClick={endTurn} disabled={busy || game.over}>
              Следующий год
            </button>
            <button className={'btn ' + (auto ? 'on' : '')} onClick={() => setAuto(!auto)} disabled={game.over}>
              {auto ? '❚❚ Пауза' : '▶ Авто'}
            </button>
          </>
        )}
      </header>

      <main className="main">
        <div className="map-area">
          <MapView
            game={game}
            owner={mapOwner}
            myId={viewer}
            selected={selected}
            onSelect={onSelect}
            arrows={arrows}
            mode={mode}
            badges={badges}
          />
          <div className="map-tools">
            <button className={mode === 'political' ? 'on' : ''} onClick={() => setMode('political')}>
              Страны
            </button>
            <button className={mode === 'terrain' ? 'on' : ''} onClick={() => setMode('terrain')}>
              Рельеф
            </button>
            <button className={showBattles ? 'on' : ''} onClick={() => setShowBattles(!showBattles)} title="Сражения прошлого года">
              Сражения
            </button>
            <button
              className={chron != null ? 'on' : ''}
              onClick={() => {
                setChron(chron == null ? 1 : null);
                setChronPlay(false);
              }}
            >
              Хроника
            </button>
            {viewer != null && (
              <button
                className={'news-btn ' + (newsOpen ? 'on' : '')}
                onClick={() => {
                  setNewsOpen(!newsOpen);
                  setCard(null);
                }}
                title="События по годам: итоги, сражения, донесения"
              >
                События
                {lastRep && lastRep.battles.some((b) => b.attacker === viewer || b.defender === viewer) && <i className="news-dot" />}
              </button>
            )}
          </div>
          {newsOpen && viewer != null && (
            <div className="news-overlay">
              <div className="news-head">
                <b>События</b>
                <button className="ccard-x" onClick={() => setNewsOpen(false)} aria-label="Закрыть">
                  ✕
                </button>
              </div>
              <NewsPanel game={game} viewer={viewer} nbs={myNbs} onOpenBattle={openBattle} />
            </div>
          )}
          {chron != null && (
            <div className="chronicle">
              <button className="btn small" onClick={() => setChronPlay(!chronPlay)}>
                {chronPlay ? '❚❚' : '▶'}
              </button>
              <input
                type="range"
                className="slider"
                min={1}
                max={game.year}
                value={chron}
                onChange={(e) => setChron(Number(e.target.value))}
                style={{ ['--p' as string]: ((chron - 1) / Math.max(1, game.year - 1)) * 100 + '%' }}
              />
              <b>{chron} год</b>
              <button className="btn small" onClick={() => setChron(null)}>
                Сейчас
              </button>
            </div>
          )}
          {card != null && me && draft && card.id === viewer && (
            <MyCountryCard
              game={game}
              geo={geo}
              me={me}
              draft={draft}
              setDraft={setDraft}
              onClose={() => {
                setCard(null);
                setSelected(null);
              }}
              onOpenCountry={(id, deal) => {
                setSelected(id);
                setCard(id, deal);
              }}
            />
          )}
          {card != null && me && draft && card.id !== viewer && (
            <CountryCard
              key={card.id + (card.deal ? 'd' : '')}
              game={game}
              geo={geo}
              me={me}
              draft={draft}
              setDraft={setDraft}
              id={card.id}
              dealOpen={card.deal}
              onClose={() => {
                setCard(null);
                setSelected(null);
              }}
            />
          )}
          <div className="legend">
            <span><i className="lg-arrow you" /> ваши приказы</span>
            <span><i className="lg-arrow won" /> победа</span>
            <span><i className="lg-arrow lost" /> атака отбита</span>
          </div>
        </div>

        <aside className="side">
          {viewer == null && (
            <nav className="tabs">
              {tabs.map((t) => (
                <button key={t.id} className={activeTab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
          )}
          <div className="side-scroll">
            {viewer != null && !helpHidden && game.year <= 5 && (
              <div className="howto">
                <b>Как играть</b>
                <ol>
                  <li>Во вкладке «Приказы» выберите, сколько нанять солдат и учёных, и главные науки.</li>
                  <li>Чтобы напасть — щёлкните по соседу на карте и нажмите «Отправить в поход».</li>
                  <li>
                    Нажмите <b>«Завершить год»</b> и прочитайте итоги. Советник подскажет, что делать.
                  </li>
                </ol>
                <button
                  className="btn small"
                  onClick={() => {
                    setHelpHidden(true);
                    try {
                      localStorage.setItem('polkovodets.help', 'hidden');
                    } catch {
                      /* хранилище недоступно */
                    }
                  }}
                >
                  Понятно
                </button>
              </div>
            )}
            {activeTab === 'orders' && panelProps && (
              <OrdersPanel
                key={game.year + ':' + viewer}
                {...panelProps}
                target={attackTarget}
                onTarget={onTarget}
                onDiplomacy={openDiplomacy}
                onTab={(t) => setTab(t as Tab)}
              />
            )}
            {activeTab === 'world' && (
              <WorldPanel
                game={game}
                geo={geo}
                viewer={viewer}
                selected={selected}
                onSelect={setSelected}
                scoutTarget={draft?.scout?.target ?? me?.scoutTarget ?? null}
                onScout={
                  me
                    ? (id) =>
                        setDraft((o) => ({
                          ...o,
                          scout: { ...(o.scout ?? { hire: false, target: me.scoutTarget }), ...(me.hasScout ? { target: id } : { hire: true, target: id }) },
                        }))
                    : undefined
                }
              />
            )}            {activeTab === 'news' && <NewsPanel game={game} viewer={viewer} nbs={myNbs} onOpenBattle={openBattle} />}
          </div>
        </aside>
      </main>

      {busy && <div className="busy">Идёт {game.year} год…</div>}

      {handoff && me && (
        <div className="modal-back">
          <div className="modal small-modal">
            <h2>Ход игрока</h2>
            <div className="handoff">
              <Swatch color={me.color} />
              <div>
                <div className="big">{me.playerName}</div>
                <div className="muted">{me.name}</div>
              </div>
            </div>
            <p className="muted">Остальные игроки, отвернитесь от экрана.</p>
            <button
              className="btn primary wide"
              onClick={() => {
                setHandoff(false);
                if (game.reports.length) openReport(game, viewer);
              }}
            >
              Начать ход
            </button>
          </div>
        </div>
      )}

      {showReport && !handoff && lastRep && me && (
        <div className="modal-back" onClick={() => setShowReport(false)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>Итоги {lastRep.year} года</h2>
            {prevCells && (
              <div className="summary">
                <span>
                  Территория: <b>{me.cells}</b>{' '}
                  {me.cells !== prevCells[me.id] && (
                    <span className={me.cells > prevCells[me.id] ? 'pos' : 'neg'}>
                      ({me.cells > prevCells[me.id] ? '+' : ''}
                      {me.cells - prevCells[me.id]})
                    </span>
                  )}
                </span>
                <span>
                  Деньги: <b>{fmtShort(me.money)}</b>
                </span>
                <span>
                  Цена зерна: <b>{lastRep.price.toFixed(2)}</b>
                </span>
              </div>
            )}
            <div className="modal-scroll">
              <YearView game={game} rep={lastRep} viewer={viewer} nbs={myNbs} onOpenBattle={openBattle} />
            </div>
            <button className="btn primary wide" onClick={() => setShowReport(false)}>
              К делам
            </button>
          </div>
        </div>
      )}

      {battleOpen && !handoff && battleOpen.list[battleOpen.i] && (
        <div className="modal-back" onClick={() => setBattleOpen(null)}>
          <div className="modal battle-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-scroll">
              <BattleReportView
                key={battleOpen.year + ':' + battleOpen.i}
                game={game}
                b={battleOpen.list[battleOpen.i]}
                viewer={viewer}
                year={battleOpen.year}
              />
            </div>
            <div className="battle-modal-foot">
              <div className="battle-tabs">
                {battleOpen.list.length > 1 &&
                  battleOpen.list.map((b, k) => (
                    <button key={k} className={'btn small ' + (k === battleOpen.i ? 'on' : '')} onClick={() => setBattleOpen({ ...battleOpen, i: k })}>
                      {game.countries[b.attacker].name} → {game.countries[b.defender].name}
                    </button>
                  ))}
              </div>
              {battleOpen.i < battleOpen.list.length - 1 ? (
                <button className="btn primary" onClick={() => setBattleOpen({ ...battleOpen, i: battleOpen.i + 1 })}>
                  Следующее сражение →
                </button>
              ) : (
                <button className="btn primary" onClick={() => setBattleOpen(null)}>
                  {showReport ? 'К итогам года' : 'Закрыть'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {hadHumans && !humans.length && !defeatSeen && !game.over && (
        <div className="modal-back">
          <div className="modal small-modal">
            <h2>Поражение</h2>
            <p>Ваша держава пала. Мир продолжит жить без вас.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDefeatSeen(true)}>
                Наблюдать дальше
              </button>
              <button className="btn primary" onClick={onExit}>
                Главное меню
              </button>
            </div>
          </div>
        </div>
      )}

      {game.over && !overSeen && game.winner != null && (
        <div className="modal-back">
          <div className="modal small-modal">
            {(() => {
              const w = game.countries[game.winner];
              const human = w.controller === 'human';
              return (
                <>
                  <h2>{human ? 'Победа!' : 'Игра окончена'}</h2>
                  <div className="handoff">
                    <Swatch color={w.color} />
                    <div>
                      <div className="big">{w.name}</div>
                      <div className="muted">{w.playerName ?? 'компьютер'} · {game.year - 1} год</div>
                    </div>
                  </div>
                  <p className="muted">
                    {human ? 'Вы объединили земли под своим началом.' : 'Земли объединены под чужим знаменем.'}
                  </p>
                </>
              );
            })()}
            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => {
                  setOverSeen(true);
                  setChron(1);
                  setChronPlay(true);
                }}
              >
                Хроника партии
              </button>
              <button className="btn primary" onClick={onExit}>
                Главное меню
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, subTone }: { label: string; value: React.ReactNode; sub?: string; subTone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={'stat-sub ' + (subTone ?? '')}>{sub}</div>}
    </div>
  );
}

