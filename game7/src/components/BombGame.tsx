import { useEffect, useRef, useState } from 'react';
import { BombEngine, BombHudState } from '../game/bomb';
import { BombHud, BombResults, BombTouch } from './BombHud';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function BombGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<BombEngine | null>(null);
  const [hud, setHud] = useState<BombHudState | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new BombEngine(ref.current, setHud);
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
      {hud && <BombHud hud={hud} touch={touch} onSkip={() => engine?.skip()} />}
      {hud && phase === 'menu' && (
        <Menu
          game="bomb"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <BombResults hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <BombTouch engine={engine} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
