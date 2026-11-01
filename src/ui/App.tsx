import { useState } from 'react';
import { createGame, DEFAULT_SETTINGS } from '../core/game';
import type { Difficulty, GameSettings, GameState, MapSize, VictoryType } from '../core/types';
import { NumInput, Seg, Slider } from './common';
import { Game } from './Game';
import { clearSave, loadGame } from './storage';

const DIFF_INFO: Record<Difficulty, string> = {
  easy: 'Компьютер ошибается, плохо планирует и не добивает ослабленных.',
  normal: 'Разумный противник с небольшими ошибками.',
  hard: 'Точный расчёт экономики, войны и подготовки ударов.',
  master: 'Максимальный горизонт планирования, без ошибок, безжалостный оппортунизм.',
};

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(() => loadGame());
  const [creating, setCreating] = useState(false);

  if (game) {
    return (
      <Game
        key={game.settings.seed + ':' + game.year}
        initial={game}
        onExit={() => {
          setSaved(loadGame());
          setGame(null);
        }}
      />
    );
  }

  return (
    <div className="menu">
      <div className="menu-bg" />
      <div className="menu-inner">
        <h1 className="title">Полководец</h1>
        <p className="subtitle">Пошаговая военно-экономическая стратегия. Объедините все земли под своим началом.</p>
        {creating ? (
          <NewGame
            onCancel={() => setCreating(false)}
            onStart={(s) => {
              clearSave();
              setGame(createGame(s));
            }}
          />
        ) : (
          <div className="menu-buttons">
            {saved && (
              <button className="btn primary big" onClick={() => setGame(saved)}>
                Продолжить · {saved.year} год
              </button>
            )}
            <button className={'btn big ' + (saved ? '' : 'primary')} onClick={() => setCreating(true)}>
              Новая игра
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewGame({ onStart, onCancel }: { onStart: (s: GameSettings) => void; onCancel: () => void }) {
  const [s, setS] = useState<GameSettings>({ ...DEFAULT_SETTINGS, seed: Math.floor(Math.random() * 1e6) });
  const [spectate, setSpectate] = useState(false);
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="newgame">
      <div className="ng-grid">
        <label>Число государств</label>
        <div className="ng-field">
          <Slider value={s.numCountries} min={20} max={40} onChange={(v) => set('numCountries', v)} />
          <b>{s.numCountries}</b>
        </div>

        <label>Размер карты</label>
        <Seg<MapSize>
          value={s.mapSize}
          onChange={(v) => set('mapSize', v)}
          options={[
            { value: 'small', label: 'Малая', title: 'Быстрые партии' },
            { value: 'normal', label: 'Средняя' },
            { value: 'large', label: 'Большая' },
          ]}
        />

        <label>Сложность</label>
        <div>
          <Seg<Difficulty>
            value={s.difficulty}
            onChange={(v) => set('difficulty', v)}
            options={[
              { value: 'easy', label: 'Лёгкая' },
              { value: 'normal', label: 'Средняя' },
              { value: 'hard', label: 'Сильная' },
              { value: 'master', label: 'Полководец' },
            ]}
          />
          <div className="hint">{DIFF_INFO[s.difficulty]} Компьютер никогда не жульничает.</div>
        </div>

        <label>Игроки</label>
        <div>
          {!spectate &&
            s.humans.map((h, i) => (
              <div className="ng-player" key={i}>
                <input
                  className="text"
                  value={h}
                  onChange={(e) => set('humans', s.humans.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {s.humans.length > 1 && (
                  <button className="icon-btn" onClick={() => set('humans', s.humans.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          <div className="quick">
            {!spectate && s.humans.length < 8 && (
              <button onClick={() => set('humans', [...s.humans, `Игрок ${s.humans.length + 1}`])}>+ игрок за этим компьютером</button>
            )}
            <button className={spectate ? 'on' : ''} onClick={() => setSpectate(!spectate)}>
              {spectate ? '✓ ' : ''}только наблюдать
            </button>
          </div>
        </div>

        <label>Победа</label>
        <div>
          <Seg<VictoryType>
            value={s.victory}
            onChange={(v) => set('victory', v)}
            options={[
              { value: 'conquest', label: 'Полное завоевание' },
              { value: 'territory', label: 'Доля земли' },
              { value: 'years', label: 'По годам' },
            ]}
          />
          {s.victory === 'territory' && (
            <div className="ng-field">
              <Slider value={s.territoryPct} min={30} max={90} step={5} onChange={(v) => set('territoryPct', v)} />
              <b>{s.territoryPct}% суши</b>
            </div>
          )}
          <div className="ng-field">
            <span className="muted">Лимит ходов</span>
            <NumInput value={s.maxYears} min={20} max={500} step={10} width={90} onChange={(v) => set('maxYears', v)} />
          </div>
          <div className="hint">1 ход = 1 год. По истечении лимита побеждает держава с наибольшей территорией.</div>
        </div>

        <label>Без нападений</label>
        <div>
          <div className="ng-field">
            <Slider value={s.truceYears} min={0} max={30} onChange={(v) => set('truceYears', v)} />
            <b>{s.truceYears === 0 ? 'нет' : s.truceYears + ' ходов'}</b>
          </div>
          <div className="hint">Первые годы войны запрещены всем — время освоиться и подготовиться.</div>
        </div>

        <label>События</label>
        <Seg<'on' | 'off'>
          value={s.events ? 'on' : 'off'}
          onChange={(v) => set('events', v === 'on')}
          options={[
            { value: 'on', label: 'Случайные события' },
            { value: 'off', label: 'Без событий' },
          ]}
        />

        <label>Номер карты</label>
        <div className="ng-field">
          <NumInput value={s.seed} min={0} width={120} onChange={(v) => set('seed', v)} />
          <button className="btn small" onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>
            Случайный
          </button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          Назад
        </button>
        <button
          className="btn primary big"
          onClick={() =>
            onStart({
              ...s,
              humans: spectate ? [] : s.humans.map((h, i) => h.trim() || `Игрок ${i + 1}`),
            })
          }
        >
          Начать
        </button>
      </div>
    </div>
  );
}
