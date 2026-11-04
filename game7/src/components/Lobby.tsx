import { useEffect, useRef, useState } from 'react';
import { LobbyEngine } from '../game/lobby';
import { Menu } from './Menu';
import { MuteButton } from './MuteButton';
import type { GameId } from '../App';

export function Lobby({ animal, game, onAnimal, onGame, onStart }: { animal: string; game: GameId; onAnimal: (id: string) => void; onGame: (g: GameId) => void; onStart: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<LobbyEngine | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const e = new LobbyEngine(ref.current, animal);
    setEngine(e);
    return () => {
      e.destroy();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine?.setPlayerAnimal(animal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animal]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300">
      <div ref={ref} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <div className="rounded-full bg-white/80 backdrop-blur-sm px-4 py-1 text-[11px] sm:text-xs font-bold text-slate-600 border-2 border-white shadow">
          🏕️ LOBI BUKIT · {game === 'fishing' ? 'Mancing' : game === 'kart' ? 'Go-Kart' : game === 'hunt' ? 'Duck Hunt' : game === 'bomb' ? 'Bom Atap' : game === 'plane' ? 'Pesawat' : game === 'snow' ? 'Bola Salju' : 'Kuil Batu'} siap dimulai!
        </div>
      </div>
      <Menu
        game={game}
        onGame={onGame}
        selected={animal}
        onSelect={(id) => {
          onAnimal(id);
          engine?.setPlayerAnimal(id);
        }}
        onStart={onStart}
      />
      <MuteButton
        muted={muted}
        onClick={() => {
          setMuted((m) => !m);
          import('../game/audio').then(({ sfx }) => {
            sfx.muted = !muted;
          });
        }}
      />
    </div>
  );
}
