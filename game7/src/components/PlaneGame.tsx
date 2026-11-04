import { useEffect, useRef, useState } from 'react';
import { PlaneEngine, PlaneHudState } from '../game/plane';
import { PlaneHud, PlaneResults, PlaneTouch } from './PlaneHud';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function PlaneGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<PlaneEngine | null>(null);
  const [hud, setHud] = useState<PlaneHudState | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new PlaneEngine(ref.current, setHud);
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
      {hud && <PlaneHud hud={hud} touch={touch} onSkip={() => engine?.skip()} />}
      {hud && phase === 'menu' && (
        <Menu
          game="plane"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <PlaneResults hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <PlaneTouch engine={engine} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
