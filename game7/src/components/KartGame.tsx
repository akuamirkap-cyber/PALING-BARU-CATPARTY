import { useEffect, useRef, useState } from 'react';
import { KartEngine, KartHudState } from '../game/kart';
import { KartHud, KartResults, KartTouch } from './KartHud';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function KartGame({ animal, onAnimal, onGame, autoStart, onExit }: { animal: string; onAnimal: (id: string) => void; onGame: (g: GameId) => void; autoStart?: boolean; onExit?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<KartEngine | null>(null);
  const [hud, setHud] = useState<KartHudState | null>(null);
  const [path, setPath] = useState('');
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!ref.current) return;
    const e = new KartEngine(ref.current, setHud);
    e.setPlayerAnimal(animal);
    if (touch) e.setAutoGas(true);
    setPath(e.minimapPath);
    if (autoStart) e.start();
    setEngine(e);
    return () => {
      e.destroy();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = hud?.phase ?? 'menu';
  const inGame = phase === 'countdown' || phase === 'racing' || phase === 'finished';

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300">
      <div ref={ref} className="absolute inset-0" />
      {hud && <KartHud hud={hud} path={path} />}
      {hud && phase === 'menu' && (
        <Menu
          game="kart"
          onGame={onGame}
          selected={animal}
          onSelect={(id) => {
            onAnimal(id);
            engine?.setPlayerAnimal(id);
          }}
          onStart={() => engine?.start()}
        />
      )}
      {hud && phase === 'results' && <KartResults hud={hud} onAgain={() => engine?.start()} onMenu={() => (onExit ? onExit() : engine?.toMenu())} />}
      {touch && inGame && <KartTouch engine={engine} />}
      {hud && <MuteButton muted={hud.muted} onClick={() => engine?.toggleMute()} />}
    </div>
  );
}
