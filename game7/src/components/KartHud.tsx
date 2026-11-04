import { useRef } from 'react';
import type { KartEngine, KartHudState } from '../game/kart';
import { CatIcon } from './CatIcon';

const ORD = ['1ST', '2ND', '3RD', '4TH'];
const ITEM_ICON = { boost: '🚀', banana: '🍌', shell: '🎯' } as const;
const ROLL = ['🚀', '🍌', '🎯'];
const ITEM_NAME = { boost: 'TURBO', banana: 'PISANG', shell: 'CANGKANG' } as const;

export function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function KartHud({ hud, path }: { hud: KartHudState; path: string }) {
  const racing = hud.phase === 'racing' || hud.phase === 'finished' || hud.phase === 'countdown';
  if (!racing) return null;
  const last = hud.lap === hud.laps;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {(hud.boost || hud.speedNorm > 0.72) && (
        <div className="absolute inset-0 z-[4] speedlines" style={{ opacity: hud.boost ? 0.95 : Math.min(0.8, (hud.speedNorm - 0.72) * 2.6) }} />
      )}
      {/* speed lines saat turbo */}
      {hud.boost && (
        <div
          className="absolute inset-0 z-[5]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0) 45%, rgba(255,180,60,0.38) 100%)',
            animation: 'pulse-soft 0.25s ease-in-out infinite',
          }}
        />
      )}

      {/* posisi + lap */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className={`chunky rounded-3xl bg-white px-4 py-1 leading-none ${hud.position === 1 ? 'ring-4 ring-yellow-300' : ''}`}>
            <span className="text-5xl font-bold text-slate-800" style={{ color: hud.position === 1 ? '#f5a300' : undefined }}>
              {ORD[hud.position - 1]}
            </span>
            <span className="text-lg font-bold text-slate-400">/4</span>
          </div>
          <div className={`chunky rounded-2xl px-3 py-1 text-white text-outline font-bold leading-tight ${last ? 'bg-red-500 anim-pulse' : 'bg-sky-500'}`}>
            <div className="text-[11px] opacity-90">LAP</div>
            <div className="text-2xl">
              {hud.lap}/{hud.laps}
            </div>
          </div>
        </div>
        {/* slot item */}
        <div className="flex items-center gap-2">
          <div className="chunky w-[74px] h-[74px] rounded-2xl bg-white/85 flex items-center justify-center text-5xl relative">
            {hud.itemRolling ? (
              <span className="blur-[0.5px]">{ROLL[Math.floor(Date.now() / 70) % 3]}</span>
            ) : hud.item ? (
              <span className="anim-pulse">{ITEM_ICON[hud.item]}</span>
            ) : (
              <span className="text-3xl opacity-25">❔</span>
            )}
          </div>
          {hud.item && !hud.itemRolling && (
            <div className="chunky rounded-full bg-yellow-300 px-3 py-0.5 text-xs font-bold text-slate-800 anim-pulse">
              SHIFT · {ITEM_NAME[hud.item]}
            </div>
          )}
        </div>
      </div>

      {/* timer */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
        <div className="chunky rounded-full bg-white px-5 py-1 flex items-center gap-2">
          <span className="text-2xl">⏱️</span>
          <span className="text-3xl font-bold tabular-nums text-slate-800 leading-none">{fmt(hud.raceTime)}</span>
        </div>
        {hud.bestLap !== null && (
          <div className="chunky rounded-full bg-emerald-400/95 px-3 py-0.5 text-xs font-bold text-white text-outline">⭐ Terbaik {fmt(hud.bestLap)}</div>
        )}
      </div>

      {/* minimap + papan */}
      <div className="absolute top-[64px] right-3 z-10 flex flex-col items-end gap-2">
        <div className="chunky rounded-2xl bg-white/80 p-1">
          <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] sm:w-[150px] sm:h-[150px]">
            <polyline points={path} fill="none" stroke="#5b6478" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={path} fill="none" stroke="#cdd5e6" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            {hud.dots
              .slice()
              .sort((a, b) => Number(a.me) - Number(b.me))
              .map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d.me ? 4.6 : 3.4} fill={d.color} stroke="#fff" strokeWidth={d.me ? 1.8 : 1.2} />
              ))}
          </svg>
        </div>
        <div className="hidden sm:flex flex-col gap-1 w-[150px]">
          {hud.board.map((b) => (
            <div key={b.id} className={`chunky flex items-center gap-1.5 rounded-xl px-1.5 py-0.5 ${b.isPlayer ? 'bg-white' : 'bg-white/80'}`} style={{ borderColor: b.isPlayer ? b.color : '#fff' }}>
              <div className="w-4 text-center text-xs font-bold text-slate-500">{b.pos}</div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={22} />
              </div>
              <div className="flex-1 text-xs font-semibold text-slate-700 truncate">{b.name}</div>
              <div className="text-[10px] text-slate-500">{b.finished ? '🏁' : `L${b.lap}`}</div>
            </div>
          ))}
        </div>
      </div>

      {/* speedometer */}
      <div className="absolute right-3 bottom-[196px] sm:bottom-4 z-10 flex flex-col items-end gap-1 w-[210px] chunky rounded-3xl bg-slate-900/45 px-3 py-2 backdrop-blur-sm">
        {hud.draft > 0 && (
          <div className="w-full flex items-center gap-2" style={{ opacity: 0.4 + hud.draft * 0.6 }}>
            <span className="text-xs font-bold text-white text-outline whitespace-nowrap">{hud.draft >= 1 ? '🌬️ SLIPSTREAM!' : '🌬️'}</span>
            <div className="flex-1 h-2 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${hud.draft * 100}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-end gap-1 text-white text-outline leading-none self-end">
          <span className="text-5xl font-bold tabular-nums" style={{ color: hud.boost ? '#ffd23f' : '#fff' }}>
            {hud.speed}
          </span>
          <span className="text-sm font-bold mb-1">KM/J</span>
        </div>
        <div className="chunky w-full h-4 rounded-full bg-slate-900/50 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${hud.speedNorm * 100}%`,
              background: hud.boost ? 'linear-gradient(90deg,#ffd23f,#ff7a3d)' : 'linear-gradient(90deg,#7cf05a,#4dd0ff)',
            }}
          />
        </div>
        <div className="w-full h-3 rounded-full bg-slate-900/40 overflow-hidden border-2 border-white/60" style={{ opacity: hud.drifting ? 1 : 0.35 }}>
          <div
            className="h-full"
            style={{
              width: `${hud.driftCharge * 100}%`,
              background: hud.driftLevel === 2 ? '#ff9a2e' : hud.driftLevel === 1 ? '#4db8ff' : '#fff',
            }}
          />
        </div>
        <div className="text-[11px] font-bold text-white text-outline">{hud.driftLevel === 2 ? '🔥 SUPER TURBO SIAP' : hud.driftLevel === 1 ? '⚡ MINI TURBO SIAP' : 'DRIFT (SPASI)'}</div>
      </div>

      {hud.wrongWay && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 z-20 anim-pulse">
          <div className="chunky rounded-2xl bg-red-500 px-6 py-2 text-3xl font-bold text-white text-outline">⚠ ARAH SALAH!</div>
        </div>
      )}
      {hud.offroad && !hud.wrongWay && hud.phase === 'racing' && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 z-20">
          <div className="chunky rounded-full bg-amber-400 px-4 py-1 text-base font-bold text-slate-800">🏜️ Pasir! Pelan</div>
        </div>
      )}

      {hud.hint && hud.phase !== 'finished' && (
        <div className="absolute left-1/2 bottom-[210px] sm:bottom-4 -translate-x-1/2 z-10 w-[60vw] sm:w-[48vw] flex justify-center">
          <div className="rounded-full bg-slate-900/70 px-5 py-2 text-white font-semibold text-center text-sm sm:text-base text-outline backdrop-blur-sm border-2 border-white/40">{hud.hint}</div>
        </div>
      )}

      {hud.phase === 'countdown' && hud.countdown > 0 && (
        <div key={hud.countdown} className="absolute inset-0 flex items-center justify-center anim-count z-20">
          <div className="title-sticker font-bold" style={{ fontSize: 'min(30vw, 240px)' }}>
            {hud.countdown}
          </div>
        </div>
      )}
      {hud.go && (
        <div className="absolute inset-0 flex items-center justify-center anim-count z-20">
          <div className="title-sticker font-bold" style={{ fontSize: 'min(24vw, 190px)' }}>
            GO!
          </div>
        </div>
      )}
      {hud.banner && (
        <div key={hud.banner} className="absolute inset-x-0 top-[22%] flex justify-center anim-count z-20">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(11vw, 84px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      <div className="hidden lg:block absolute left-3 bottom-3 z-10 chunky rounded-2xl bg-white/85 px-3 py-2 text-xs text-slate-700 leading-5">
        <div>
          <b>W/S</b> gas/rem · <b>A/D</b> belok · <b>SPASI</b> drift
        </div>
        <div>
          <b>SHIFT</b> pakai item · <b>R</b> balik ke jalur
        </div>
      </div>
    </div>
  );
}

const medal = ['🥇', '🥈', '🥉', '4️⃣'];

export function KartResults({ hud, onAgain, onMenu }: { hud: KartHudState; onAgain: () => void; onMenu: () => void }) {
  const me = hud.board.find((b) => b.isPlayer)!;
  const winner = hud.board[0];
  const msg = me.pos === 1 ? '👑 KAMU JUARA BALAP!' : me.pos === 2 ? 'Hampir! Juara 2 🥈' : me.pos === 3 ? 'Coba drift lebih sering! 🌀' : 'Banyak nabrak tembok ya 😂';
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto chunky anim-slide w-full max-w-md rounded-[32px] bg-white/95 p-5 mb-2 sm:mb-0">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-500">PEMENANG BALAPAN</div>
          <div className="flex justify-center my-1">
            <CatIcon id={winner.animal} size={72} />
          </div>
          <div className="text-3xl font-bold text-slate-800 leading-tight">{winner.isPlayer ? 'KAMU' : winner.name}</div>
          <div className="mt-1 text-base font-semibold text-orange-500">{msg}</div>
          {hud.bestLap !== null && <div className="text-xs text-slate-500 mt-1">⭐ Lap tercepatmu: {fmt(hud.bestLap)}</div>}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {hud.board.map((b, i) => (
            <div key={b.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 border-4 ${i === 0 ? 'bg-yellow-100' : 'bg-slate-50'}`} style={{ borderColor: b.color }}>
              <div className="text-3xl w-9 text-center">{medal[i]}</div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={36} />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-800 truncate">{b.name}</div>
                <div className="text-xs text-slate-500">{b.finished ? 'Finish' : `Belum finish (lap ${b.lap})`}</div>
              </div>
              <div className="text-xl font-bold text-slate-800 tabular-nums">{b.time !== null ? fmt(b.time) : '—'}</div>
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
            BALAP LAGI
          </button>
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              onMenu();
            }}
            className="chunky rounded-full bg-gradient-to-b from-sky-400 to-blue-500 px-5 py-3 text-lg font-bold text-white text-outline hover:scale-105 active:scale-95 transition-transform"
          >
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function KartTouch({ engine }: { engine: KartEngine | null }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (!base.current || !knob.current || !engine) return;
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    const max = r.width / 2;
    dx = Math.max(-max, Math.min(max, dx));
    knob.current.style.transform = `translate(${dx}px, 0)`;
    engine.setJoy(dx / max);
  };
  const end = () => {
    id.current = null;
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
    engine?.setJoy(0);
  };
  const btn = 'chunky rounded-full flex items-center justify-center font-bold text-white text-outline select-none active:scale-90 transition-transform';
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none h-44">
      <div
        ref={base}
        className="absolute left-4 bottom-5 w-44 h-24 rounded-full bg-white/30 border-4 border-white/70 pointer-events-auto"
        onPointerDown={(e) => {
          id.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => id.current === e.pointerId && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="absolute left-1/2 top-1/2 -ml-8 -mt-8 w-16 h-16 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-2xl">↔</div>
      </div>
      <div className="absolute right-4 bottom-4 pointer-events-auto">
        <button
          className={`${btn} absolute right-0 bottom-0 w-24 h-24 bg-fuchsia-500 text-3xl`}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            engine?.setTouchDrift(true);
          }}
          onPointerUp={() => engine?.setTouchDrift(false)}
          onPointerCancel={() => engine?.setTouchDrift(false)}
        >
          🌀
        </button>
        <button className={`${btn} absolute right-28 bottom-2 w-[72px] h-[72px] bg-amber-400 text-3xl`} onPointerDown={() => engine?.touchItem()}>
          🎁
        </button>
        <button
          className={`${btn} absolute right-1 bottom-28 w-14 h-14 bg-red-500 text-xl`}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            engine?.setTouchBrake(true);
          }}
          onPointerUp={() => engine?.setTouchBrake(false)}
          onPointerCancel={() => engine?.setTouchBrake(false)}
        >
          ⛔
        </button>
        <button className={`${btn} absolute right-24 bottom-[88px] w-12 h-12 bg-sky-500 text-lg`} onPointerDown={() => engine?.touchRespawn()}>
          ↩
        </button>
      </div>
    </div>
  );
}
