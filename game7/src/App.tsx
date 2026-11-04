import { useState } from 'react';
import { FishingGame } from './components/FishingGame';
import { KartGame } from './components/KartGame';
import { HuntGame } from './components/HuntGame';
import { BombGame } from './components/BombGame';
import { PlaneGame } from './components/PlaneGame';
import { SnowGame } from './components/SnowGame';
import { RuinsGame } from './components/RuinsGame';
import { Lobby } from './components/Lobby';

export type GameId = 'fishing' | 'kart' | 'hunt' | 'bomb' | 'plane' | 'snow' | 'ruins';

export default function App() {
  const [game, setGame] = useState<GameId>('fishing');
  const [animal, setAnimal] = useState('tuxedo');
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return <Lobby animal={animal} game={game} onAnimal={setAnimal} onGame={setGame} onStart={() => setPlaying(true)} />;
  }

  const common = { animal, onAnimal: setAnimal, onGame: setGame, autoStart: true, onExit: () => setPlaying(false) };
  switch (game) {
    case 'kart':
      return <KartGame key="kart" {...common} />;
    case 'hunt':
      return <HuntGame key="hunt" {...common} />;
    case 'bomb':
      return <BombGame key="bomb" {...common} />;
    case 'plane':
      return <PlaneGame key="plane" {...common} />;
    case 'snow':
      return <SnowGame key="snow" {...common} />;
    case 'ruins':
      return <RuinsGame key="ruins" {...common} />;
    default:
      return <FishingGame key="fishing" {...common} />;
  }
}
