import { useEffect, useRef, useState } from 'react';
import { HuntEngine, HuntHudState } from '../game/hunt';
import { HuntHud, HuntResults, HuntTouch } from './HuntHud';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function HuntGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<HuntEngine | null>(null);
  const [hud, setHud] = useState<HuntHudState | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new HuntEngine(ref.current, setHud);
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
    <div className="fixed inset-0 overflow-hidden bg-sky-300" style={{ cursor: inGame && !touch ? 'crosshair' : undefined }}>
      <div ref={ref} className="absolute inset-0" />
      {hud && <HuntHud hud={hud} touch={touch} />}
      {hud && phase === 'menu' && (
        <Menu
          game="hunt"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <HuntResults hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <HuntTouch engine={engine} scoped={engine?.touchScoped ?? false} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
