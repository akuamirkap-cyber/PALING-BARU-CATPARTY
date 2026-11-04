import { useEffect, useRef, useState } from 'react';
import { GameEngine, HudState } from '../game/engine';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { Results } from './Results';
import { TouchControls } from './TouchControls';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function FishingGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new GameEngine(ref.current, setHud);
    e.setPlayerAnimal(animal);
    if (autoStart) e.start();
    setEngine(e);
    return () => {
      e.destroy();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = hud?.phase ?? 'menu';
  const inGame = phase === 'countdown' || phase === 'playing';

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300">
      <div ref={ref} className="absolute inset-0" />
      {hud && <Hud hud={hud} touch={touch} />}
      {hud && phase === 'menu' && (
        <Menu
          game="fishing"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <Results hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <TouchControls engine={engine} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
