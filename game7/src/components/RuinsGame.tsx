import { useEffect, useRef, useState } from 'react';
import { RuinsEngine, RuinsHudState } from '../game/ruins';
import { RuinsHud, RuinsResults, RuinsTouch } from './RuinsHud';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function RuinsGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<RuinsEngine | null>(null);
  const [hud, setHud] = useState<RuinsHudState | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new RuinsEngine(ref.current, setHud);
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
    <div className="fixed inset-0 overflow-hidden bg-amber-200">
      <div ref={ref} className="absolute inset-0" />
      {hud && <RuinsHud hud={hud} touch={touch} />}
      {hud && phase === 'menu' && (
        <Menu
          game="ruins"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <RuinsResults hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <RuinsTouch engine={engine} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
