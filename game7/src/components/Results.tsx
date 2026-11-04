import type { HudState } from '../game/engine';
import { CatIcon } from './CatIcon';

interface Props {
  hud: HudState;
  onAgain: () => void;
  onMenu: () => void;
}

const medal = ['🥇', '🥈', '🥉', '4️⃣'];

export function Results({ hud, onAgain, onMenu }: Props) {
  const me = hud.board.find((b) => b.isPlayer)!;
  const winner = hud.board[0];
  const msg =
    me.rank === 1
      ? '👑 KAMU RAJA MANCING!'
      : me.rank === 2
        ? 'Dikit lagi! Juara 2 🥈'
        : me.rank === 3
          ? 'Lumayan… tapi umpanmu kurang hoki 😅'
          : 'Kamu terlalu sering nyebur 😂';
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto chunky anim-slide w-full max-w-md rounded-[32px] bg-white/95 p-5 mb-2 sm:mb-0">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-500">PEMENANG</div>
          <div className="text-4xl font-bold text-slate-800 leading-tight">
            <div className="flex justify-center mb-1"><CatIcon id={winner.animal} size={72} /></div>
            {winner.isPlayer ? 'KAMU' : winner.name}
          </div>
          <div className="mt-1 text-base font-semibold text-orange-500">{msg}</div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {hud.board.map((b, i) => (
            <div
              key={b.id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2 border-4 ${i === 0 ? 'bg-yellow-100' : 'bg-slate-50'}`}
              style={{ borderColor: b.color }}
            >
              <div className="text-3xl w-9 text-center">{medal[i]}</div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={36} />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-800 truncate">{b.name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {b.count} ikan · terberat: <b style={{ color: b.bestColor }}>{b.bestRank}</b> {b.best} · 🦈 digigit {b.bites}×
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-800 tabular-nums">{b.score}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              onAgain();
            }}
            className="chunky flex-1 rounded-full bg-gradient-to-b from-lime-400 to-green-500 py-3 text-2xl font-bold text-white text-outline hover:scale-105 active:scale-95 transition-transform"
          >
            MAIN LAGI
          </button>
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              onMenu();
            }}
            className="chunky rounded-full bg-gradient-to-b from-sky-400 to-blue-500 px-5 py-3 text-lg font-bold text-white text-outline hover:scale-105 active:scale-95 transition-transform"
          >
            Ganti Hewan
          </button>
        </div>
      </div>
    </div>
  );
}
