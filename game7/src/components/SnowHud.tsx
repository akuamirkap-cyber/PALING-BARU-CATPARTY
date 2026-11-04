import { useRef } from 'react';
import type { SnowEngine, SnowHudState } from '../game/snow';
import { CatIcon } from './CatIcon';

const MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];
const T_COL = { small: '#ffffff', big: '#bfe3ff', gold: '#ffd23f', igloo: '#8fd0ff' } as const;
const ENG_FRAC = (0.95 - 0.55) / (2.1 - 0.55);

function Board({ hud }: { hud: SnowHudState }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 w-[170px] sm:w-[205px]">
      {hud.board.map((b) => (
        <div key={b.id} className={`chunky flex items-center gap-2 rounded-2xl px-2 py-1 ${b.isPlayer ? 'bg-white scale-105 origin-left' : 'bg-white/85'}`} style={{ borderColor: b.isPlayer ? b.color : '#fff' }}>
          <div className="text-sm font-bold text-slate-500 w-4 text-center">{b.rank}</div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: b.color }}>
            <CatIcon id={b.animal} size={28} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{b.name}</div>
            <div className="text-[10px] text-slate-400">🎯 {b.kos} KO · ⛄ {b.smashed}</div>
          </div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{b.score}</div>
        </div>
      ))}
    </div>
  );
}

function ArenaMap({ hud }: { hud: SnowHudState }) {
  const S = 100 / 38;
  const X = (x: number) => 50 - x * S;
  const Y = (z: number) => 50 - z * S;
  return (
    <div className="absolute right-3 top-[64px] z-10 chunky rounded-full bg-sky-900/45 p-1.5 backdrop-blur-sm">
      <svg viewBox="0 0 100 100" className="w-[96px] h-[96px] sm:w-[128px] sm:h-[128px] rounded-full" style={{ background: 'radial-gradient(circle,#dcebff,#9bbbe6)' }}>
        <g transform={`rotate(${(hud.camYaw * 180) / Math.PI} 50 50)`}>
        <circle cx={50} cy={50} r={15.5 * S} fill="#f7fbff" stroke="#ff5a6a" strokeWidth={1.4} strokeDasharray="4 3" />
        {hud.map.snowmen.map((s, i) => (
          <circle key={i} cx={X(s.x)} cy={Y(s.y)} r={s.t === 'igloo' ? 6 : s.t === 'big' ? 3.6 : s.t === 'gold' ? 3.2 : 2.4} fill={T_COL[s.t]} stroke={s.t === 'gold' ? '#c28a00' : '#6f8fbd'} strokeWidth={0.9} />
        ))}
        {hud.map.balls.map((b, i) => (
          <circle key={i} cx={X(b.x)} cy={Y(b.y)} r={2 + b.r * 1.5} fill="#fff" stroke={b.color} strokeWidth={b.me ? 2.4 : 1.6} />
        ))}
        {hud.map.cats.map((c, i) => (
          <rect key={i} x={X(c.x) - (c.me ? 3.4 : 2.6)} y={Y(c.y) - (c.me ? 3.4 : 2.6)} width={c.me ? 6.8 : 5.2} height={c.me ? 6.8 : 5.2} rx={1.5} fill={c.color} stroke={c.eng ? '#8fd3ff' : '#fff'} strokeWidth={c.eng ? 2 : 1} />
        ))}
        </g>
        <polygon points="50,1.5 55,9.5 45,9.5" fill="#ffffff" stroke="#3b5b8f" strokeWidth={1} />
      </svg>
    </div>
  );
}

function Cd({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex-1 relative h-7 rounded-lg overflow-hidden border-2 border-white/60 bg-white/10">
      <div className="absolute inset-y-0 left-0" style={{ width: `${v * 100}%`, background: color, opacity: v >= 1 ? 0.95 : 0.5 }} />
      <div className="relative text-[10px] font-bold text-white text-outline text-center leading-6 whitespace-nowrap">{label}</div>
    </div>
  );
}

function Key({ k, label, hot }: { k: string; label: string; hot?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-xl px-2 py-1 border-2 ${hot ? 'bg-yellow-300 border-white text-slate-800 anim-pulse' : 'bg-white/20 border-white/50 text-white'}`}>
      <span className={`h-7 min-w-7 px-1.5 rounded-lg flex items-center justify-center font-bold text-base whitespace-nowrap ${hot ? 'bg-slate-800 text-yellow-300' : 'bg-white text-slate-800'}`}>{k}</span>
      <span className="text-xs font-bold text-outline" style={hot ? { textShadow: 'none' } : undefined}>
        {label}
      </span>
    </div>
  );
}

export function SnowHud({ hud, touch }: { hud: SnowHudState; touch: boolean }) {
  const playing = hud.phase === 'playing';
  const active = playing || hud.phase === 'countdown';
  const showAll = active || hud.phase === 'finished';
  const m = hud.me;
  const s = Math.max(0, Math.ceil(hud.timeLeft));
  const urgent = s <= 10;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {playing && m.incoming > 0.2 && !m.engulfed && (
        <div className="absolute inset-0 z-[8]" style={{ background: 'radial-gradient(ellipse at center, rgba(255,40,60,0) 38%, rgba(255,40,60,0.6) 100%)', opacity: 0.3 + m.incoming * 0.7, animation: 'pulse-soft 0.3s ease-in-out infinite' }} />
      )}
      {playing && m.engulfed && <div className="absolute inset-0 z-[8]" style={{ background: 'radial-gradient(ellipse at center, rgba(180,225,255,0) 30%, rgba(180,225,255,0.65) 100%)' }} />}

      {showAll && (
        <>
          <Board hud={hud} />
          <ArenaMap hud={hud} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className={`chunky flex items-center gap-2 rounded-full px-5 py-1.5 ${urgent ? 'bg-red-500 anim-pulse' : hud.frenzy ? 'bg-orange-400' : 'bg-white'}`}>
              <span className="text-2xl">{urgent ? '⏰' : '⏱️'}</span>
              <span className={`text-4xl font-bold tabular-nums leading-none ${urgent || hud.frenzy ? 'text-white text-outline' : 'text-slate-800'}`}>{s}</span>
            </div>
          </div>
        </>
      )}
      {hud.frenzy && (
        <div className="absolute top-[74px] left-1/2 -translate-x-1/2 z-10 anim-pulse">
          <div className="chunky rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-5 py-1 text-white font-bold text-lg text-outline whitespace-nowrap">🔥 FRENZY! POIN ×2 🔥</div>
        </div>
      )}

      {/* peringatan bola datang */}
      {playing && m.incoming > 0.3 && !m.engulfed && (
        <div className="absolute left-1/2 top-[26%] -translate-x-1/2 z-20 anim-pulse">
          <div className="chunky rounded-3xl bg-red-500 px-6 py-2 text-3xl font-bold text-white text-outline">⚠ BOLA MENGGELINDING!</div>
        </div>
      )}

      {/* tergulung: tekan SPASI */}
      {playing && m.engulfed && (
        <div className="absolute inset-x-0 top-[24%] z-20 flex flex-col items-center gap-2">
          <div className="title-sticker font-bold text-center anim-pulse" style={{ fontSize: 'min(9vw, 62px)' }}>
            🥶 TERGULUNG!
          </div>
          <div className="chunky rounded-3xl bg-sky-900/70 px-5 py-3 w-[min(420px,88vw)] backdrop-blur-sm">
            <div className="text-white text-outline font-bold text-center text-lg">TEKAN {touch ? 'TOMBOL ⤴️' : 'SPASI'} BERKALI-KALI untuk lolos!</div>
            <div className="mt-1.5 h-5 rounded-full bg-black/35 overflow-hidden border-2 border-white/60">
              <div className="h-full rounded-full" style={{ width: `${m.escape * 100}%`, background: 'linear-gradient(90deg,#7cf05a,#ffe14d)' }} />
            </div>
          </div>
        </div>
      )}

      {/* panel bola */}
      {active && !m.buried && !m.engulfed && (
        <div className="absolute left-1/2 bottom-[178px] sm:bottom-3 -translate-x-1/2 z-10 w-[min(400px,92vw)]">
          <div className="chunky rounded-3xl bg-sky-950/55 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1.5">
              {m.hasBall ? (
                <>
                  <Key k="WASD" label={m.maxed ? 'MAKS!' : 'LARI = besar'} hot={!m.maxed} />
                  <Key k="M" label="LEPAS" hot />
                </>
              ) : (
                <>
                  <Key k="N" label="BIKIN BOLA" hot={!m.rolling} />
                  <div className="flex-1" />
                  <Key k="WASD" label="jalan" />
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl">⛄</div>
              <div className="flex-1">
                <div className="relative h-5 rounded-full bg-black/35 overflow-hidden border-2 border-white/60">
                  <div className="h-full rounded-full" style={{ width: `${(m.hasBall ? m.rFrac : 0) * 100}%`, background: m.maxed ? 'linear-gradient(90deg,#ffd23f,#ff8a3d)' : 'linear-gradient(90deg,#bfe9ff,#ffffff)' }} />
                  <div className="absolute top-0 bottom-0 w-[3px] bg-rose-400" style={{ left: `${ENG_FRAC * 100}%` }} />
                </div>
                <div className="relative h-4 text-[10px] font-bold text-white text-outline mt-0.5">
                  <span className="absolute left-0">kecil</span>
                  <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${ENG_FRAC * 100}%`, opacity: m.engulfCap ? 1 : 0.55 }}>
                    ❄️ menggulung kucing
                  </span>
                  <span className="absolute right-0">raksasa</span>
                </div>
              </div>
              <div className="text-white text-outline font-bold text-xl tabular-nums w-14 text-right">{m.hasBall ? `${m.r.toFixed(1)}m` : '—'}</div>
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <Cd label="⇧ TERJANG" v={m.diveReady} color="#b26bff" />
              <Cd label="E SENGGOL" v={m.shoveReady} color="#ff8a3d" />
            </div>
          </div>
        </div>
      )}

      {hud.banner && (playing || hud.phase === 'finished') && (
        <div key={hud.banner} className="absolute inset-x-0 top-[18%] flex justify-center anim-count z-20 px-2">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(8vw, 54px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      {active && hud.hint && !m.engulfed && (
        <div className="absolute left-1/2 top-[84px] sm:top-[92px] -translate-x-1/2 z-10 w-[92vw] sm:w-[52vw] flex justify-center">
          <div className="rounded-full bg-slate-900/60 px-5 py-1.5 text-white font-semibold text-center text-xs sm:text-sm text-outline backdrop-blur-sm border-2 border-white/40">
            {touch ? hud.hint.replace('N = bikin', '⛄ = bikin').replace('Tekan N', 'Tekan ⛄').replace('M = lepas', '🚀 = lepas').replace('tekan M', 'tekan 🚀').replace('Tekan M', 'Tekan 🚀').replace('M untuk', '🚀 untuk').replace('SPASI', 'tombol ⤴️') : hud.hint}
          </div>
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
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(12vw, 100px)' }}>
            GULUNG! ⛄
          </div>
        </div>
      )}
      {hud.phase === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center anim-count z-20">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(13vw, 110px)' }}>
            WAKTU HABIS!
          </div>
        </div>
      )}

      {!touch && active && (
        <div className="hidden lg:block absolute left-3 bottom-3 z-10 chunky rounded-2xl bg-white/85 px-3 py-2 text-xs text-slate-700 leading-5">
          <div>
            <b>N</b> = bikin bola · <b>WASD</b> jalan menggulung (ke arah kamera) · <b>M</b> = lepas
          </div>
          <div>
            <b>SPASI</b> lompat / lolos dari gulungan · <b>SHIFT</b> terjang · <b>E</b> senggol
          </div>
          <div>
            <b>Geser mouse</b> (klik dulu) atau <b>Q / R</b> = putar kamera
          </div>
        </div>
      )}
    </div>
  );
}

export function SnowResults({ hud, onAgain, onMenu }: { hud: SnowHudState; onAgain: () => void; onMenu: () => void }) {
  const me = hud.board.find((b) => b.isPlayer)!;
  const winner = hud.board[0];
  const msg = me.rank === 1 ? '👑 KAMU RAJA BOLA SALJU!' : me.rank === 2 ? 'Hampir! Juara 2 🥈' : me.rank === 3 ? 'Gulung lebih banyak kucing! ⛄' : 'Kamu terlalu sering tergulung 😂';
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto chunky anim-slide w-full max-w-md rounded-[32px] bg-white/95 p-5 mb-2 sm:mb-0">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-500">PEMENANG</div>
          <div className="flex justify-center my-1">
            <CatIcon id={winner.animal} size={72} />
          </div>
          <div className="text-3xl font-bold text-slate-800 leading-tight">{winner.isPlayer ? 'KAMU' : winner.name}</div>
          <div className="mt-1 text-base font-semibold text-orange-500">{msg}</div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {hud.board.map((b, i) => (
            <div key={b.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 border-4 ${i === 0 ? 'bg-yellow-100' : 'bg-slate-50'}`} style={{ borderColor: b.color }}>
              <div className="text-3xl w-9 text-center">{MEDAL[i]}</div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={36} />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-800 truncate">{b.name}</div>
                <div className="text-[11px] text-slate-500">
                  🎯 {b.kos} KO · ⛄ {b.smashed} hancur · bola terbesar {b.biggest.toFixed(1)}m
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
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function SnowTouch({ engine }: { engine: SnowEngine | null }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (!base.current || !knob.current || !engine) return;
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const mg = Math.hypot(dx, dy);
    if (mg > max) {
      dx = (dx / mg) * max;
      dy = (dy / mg) * max;
    }
    knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    engine.setJoy(dx / max, -dy / max);
  };
  const end = () => {
    id.current = null;
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
    engine?.setJoy(0, 0);
  };
  const btn = 'chunky rounded-full flex items-center justify-center font-bold text-white text-outline select-none active:scale-90 transition-transform';
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none h-44">
      <div
        ref={base}
        className="absolute left-4 bottom-5 w-32 h-32 rounded-full bg-white/30 border-4 border-white/70 pointer-events-auto"
        onPointerDown={(e) => {
          id.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => id.current === e.pointerId && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="absolute left-1/2 top-1/2 -ml-7 -mt-7 w-14 h-14 rounded-full bg-white/90 shadow-lg" />
      </div>
      <div className="absolute right-4 bottom-4 pointer-events-auto">
        <button className={`${btn} absolute right-0 bottom-0 w-24 h-24 bg-sky-500 text-4xl`} onPointerDown={() => engine?.touchBuild()}>
          ⛄
        </button>
        <button className={`${btn} absolute right-[104px] bottom-1 w-[72px] h-[72px] bg-orange-500 text-3xl`} onPointerDown={() => engine?.touchRelease()}>
          🚀
        </button>
        <button className={`${btn} absolute right-1 bottom-[104px] w-14 h-14 bg-fuchsia-500 text-xl`} onPointerDown={() => engine?.touchDive()}>
          💨
        </button>
        <button className={`${btn} absolute right-[72px] bottom-[84px] w-14 h-14 bg-red-500 text-xl`} onPointerDown={() => engine?.touchShove()}>
          🤜
        </button>
        <button className={`${btn} absolute right-[170px] bottom-[84px] w-14 h-14 bg-emerald-500 text-xl`} onPointerDown={() => engine?.touchJump()}>
          ⤴️
        </button>
      </div>
    </div>
  );
}
