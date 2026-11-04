import { useRef } from 'react';
import type { HuntEngine, HuntHudState } from '../game/hunt';
import { CatIcon } from './CatIcon';

const DUCK_COL = { mallard: '#b07a45', teal: '#35c8ec', gold: '#ffd23f', bomb: '#ff4d4d' } as const;

function Timer({ t, frenzy }: { t: number; frenzy: boolean }) {
  const s = Math.max(0, Math.ceil(t));
  const urgent = s <= 10;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <div className={`chunky flex items-center gap-2 rounded-full px-5 py-1.5 ${urgent ? 'bg-red-500 anim-pulse' : frenzy ? 'bg-orange-400' : 'bg-white'}`}>
        <span className="text-2xl">{urgent ? '⏰' : '⏱️'}</span>
        <span className={`text-4xl font-bold tabular-nums leading-none ${urgent || frenzy ? 'text-white text-outline' : 'text-slate-800'}`}>{s}</span>
      </div>
    </div>
  );
}

function Board({ hud }: { hud: HuntHudState }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 w-[170px] sm:w-[210px]">
      {hud.board.map((b) => (
        <div
          key={b.id}
          className={`chunky flex items-center gap-2 rounded-2xl px-2 py-1 ${b.isPlayer ? 'bg-white scale-105 origin-left' : 'bg-white/85'}`}
          style={{ borderColor: b.isPlayer ? b.color : '#fff' }}
        >
          <div className="text-sm font-bold text-slate-500 w-4 text-center">{b.rank}</div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: b.color }}>
            <CatIcon id={b.animal} size={28} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{b.name}</div>
            <div className="text-[10px] text-slate-400">🦆 {b.hits}{b.streak >= 3 ? ` · 🔥${b.streak}` : ''}</div>
          </div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{b.score}</div>
        </div>
      ))}
    </div>
  );
}

function Radar({ hud }: { hud: HuntHudState }) {
  const r = hud.radar;
  const S = 50;
  return (
    <div className="absolute right-3 top-[64px] z-10 chunky rounded-full bg-slate-900/55 p-1 backdrop-blur-sm">
      <svg viewBox="-56 -56 112 112" className="w-[104px] h-[104px] sm:w-[132px] sm:h-[132px]">
        <circle r={S} fill="rgba(20,50,80,0.5)" stroke="#fff" strokeWidth={1.5} />
        <circle r={S * 0.5} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        <path d={`M0 0 L ${-S * 0.5} ${-S * 0.87} A ${S} ${S} 0 0 1 ${S * 0.5} ${-S * 0.87} Z`} fill="rgba(255,255,255,0.14)" />
        <circle r={S * 0.1} fill="#fff" opacity={0} />
        {r.ducks.map((d, i) => {
          const x = d.x * S;
          const y = -d.y * S;
          const m = Math.hypot(x, y);
          const k = m > S - 3 ? (S - 3) / m : 1;
          return <circle key={i} cx={x * k} cy={y * k} r={d.t === 'gold' ? 4.4 : 3.1} fill={DUCK_COL[d.t]} stroke="#fff" strokeWidth={d.t === 'gold' ? 1.4 : 0.6} opacity={m > S ? 0.7 : 1} />;
        })}
        {r.players
          .filter((p) => !p.me)
          .map((p, i) => {
            const x = p.x * S;
            const y = -p.y * S;
            return <rect key={i} x={x - 3} y={y - 3} width={6} height={6} rx={1.5} fill={p.color} stroke="#fff" strokeWidth={1} />;
          })}
        <polygon points="0,-6 4.5,4 0,2 -4.5,4" fill="#fff" />
      </svg>
    </div>
  );
}

function Ammo({ hud }: { hud: HuntHudState }) {
  const m = hud.me;
  return (
    <div className="absolute right-3 bottom-[200px] sm:bottom-4 z-10 chunky rounded-3xl bg-slate-900/50 px-3 py-2 backdrop-blur-sm flex flex-col items-end gap-1.5 w-[190px]">
      <div className="flex gap-1.5 items-end">
        {Array.from({ length: m.mag }).map((_, i) => (
          <div
            key={i}
            className="w-3.5 h-9 rounded-t-full rounded-b-sm border-2 border-white/70 transition-all"
            style={{
              background: i < m.ammo ? 'linear-gradient(#ffe27a,#e0a41e)' : 'rgba(255,255,255,0.12)',
              opacity: i < m.ammo ? 1 : 0.5,
              transform: i === m.ammo - 1 && m.bolt < 1 ? 'translateY(-4px)' : undefined,
            }}
          />
        ))}
      </div>
      <div className="w-full h-2.5 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(m.reload > 0 ? m.reload : m.bolt) * 100}%`, background: m.reload > 0 ? '#4dd0ff' : m.bolt >= 1 ? '#7cf05a' : '#ffd23f' }} />
      </div>
      <div className="text-[11px] font-bold text-white text-outline">{m.reload > 0 ? '🔄 RELOAD...' : m.ammo === 0 ? 'KOSONG — tekan R' : m.bolt < 1 ? 'KOKANG...' : 'SIAP TEMBAK'}</div>
      <div className="flex gap-1.5 w-full">
        <Cd label="F SENGGOL" v={m.shoveReady} color="#ff8a3d" />
        <Cd label="⇧ TERJANG" v={m.diveReady} color="#b26bff" />
      </div>
    </div>
  );
}

function Cd({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex-1 relative h-6 rounded-lg overflow-hidden border-2 border-white/60 bg-white/10">
      <div className="absolute inset-y-0 left-0" style={{ width: `${v * 100}%`, background: color, opacity: v >= 1 ? 0.95 : 0.55 }} />
      <div className="relative text-[10px] font-bold text-white text-outline text-center leading-5 whitespace-nowrap">{label}</div>
    </div>
  );
}

function Crosshair({ hud }: { hud: HuntHudState }) {
  const k = hud.me.scopeK;
  const spread = 10 + hud.me.sway * 16;
  const hk = hud.hitKind;
  const col = hk === 'bad' ? '#ff4d4d' : hk === 'gold' ? '#ffd23f' : hk === 'head' ? '#ff5fa2' : '#fff';
  return (
    <div className="absolute inset-0 pointer-events-none z-[6]">
      {k < 0.5 && (
        <div className="absolute left-1/2 top-1/2" style={{ opacity: 1 - k * 2 }}>
          <div className="absolute rounded-full border-2 border-white" style={{ width: spread * 2, height: spread * 2, left: -spread, top: -spread, boxShadow: '0 0 0 1.5px rgba(0,0,0,.45)' }} />
          <div className="absolute w-1.5 h-1.5 rounded-full bg-red-500 -left-[3px] -top-[3px]" />
          {[0, 90, 180, 270].map((a) => (
            <div key={a} className="absolute w-[10px] h-[2px] bg-white" style={{ left: -5, top: -1, transform: `rotate(${a}deg) translateX(${spread + 9}px)`, boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }} />
          ))}
        </div>
      )}
      {hud.hitSeq > 0 && (
        <div key={hud.hitSeq} className="absolute left-1/2 top-1/2 hitmark" style={{ color: col }}>
          <svg width="56" height="56" viewBox="-28 -28 56 56" style={{ position: 'absolute', left: -28, top: -28 }}>
            {[45, 135, 225, 315].map((a) => (
              <line key={a} x1={9} y1={0} x2={22} y2={0} stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" transform={`rotate(${a})`} />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

function Scope({ hud }: { hud: HuntHudState }) {
  const k = hud.me.scopeK;
  if (k < 0.05) return null;
  return (
    <div className="absolute inset-0 z-[7] pointer-events-none" style={{ opacity: Math.min(1, k * 1.6) }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) 33vmin, rgba(0,0,0,.97) 33.6vmin)' }} />
      <svg className="absolute left-1/2 top-1/2" style={{ width: '68vmin', height: '68vmin', transform: 'translate(-50%,-50%)' }} viewBox="-100 -100 200 200">
        <circle r={98.5} fill="none" stroke="#050505" strokeWidth={3} />
        <line x1={-100} y1={0} x2={-9} y2={0} stroke="#0a0a0a" strokeWidth={0.9} />
        <line x1={9} y1={0} x2={100} y2={0} stroke="#0a0a0a" strokeWidth={0.9} />
        <line x1={0} y1={-100} x2={0} y2={-9} stroke="#0a0a0a" strokeWidth={0.9} />
        <line x1={0} y1={9} x2={0} y2={100} stroke="#0a0a0a" strokeWidth={0.9} />
        <line x1={-100} y1={0} x2={-9} y2={0} stroke="#fff" strokeWidth={0.25} opacity={0.5} />
        <line x1={9} y1={0} x2={100} y2={0} stroke="#fff" strokeWidth={0.25} opacity={0.5} />
        {[-60, -40, -20, 20, 40, 60].map((v) => (
          <g key={v}>
            <line x1={v} y1={-2.6} x2={v} y2={2.6} stroke="#0a0a0a" strokeWidth={0.8} />
            <line x1={-2.6} y1={v} x2={2.6} y2={v} stroke="#0a0a0a" strokeWidth={0.8} />
          </g>
        ))}
        <circle r={1.1} fill="#ff2d2d" />
        <circle r={4} fill="none" stroke="#ff2d2d" strokeWidth={0.4} opacity={0.7} />
      </svg>
      <div className="absolute left-1/2 text-white/80 text-xs font-bold tracking-widest" style={{ top: 'calc(50% + 35vmin)', transform: 'translateX(-50%)' }}>
        ×4.8 · {hud.me.sway < 0.05 ? 'STABIL' : 'GOYANG!'}
      </div>
    </div>
  );
}

export function HuntHud({ hud, touch }: { hud: HuntHudState; touch: boolean }) {
  const playing = hud.phase === 'playing';
  const active = playing || hud.phase === 'countdown';
  const showAll = active || hud.phase === 'finished';
  return (
    <div className="absolute inset-0 pointer-events-none">
      {hud.me.hurt > 0 && (
        <div
          className="absolute inset-0 z-[8]"
          style={{ background: 'radial-gradient(ellipse at center, rgba(255,60,80,0) 40%, rgba(255,60,80,0.55) 100%)', opacity: hud.me.hurt }}
        />
      )}
      {active && <Crosshair hud={hud} />}
      {active && <Scope hud={hud} />}
      {showAll && <Timer t={hud.timeLeft} frenzy={hud.frenzy} />}
      {showAll && <Board hud={hud} />}
      {showAll && <Radar hud={hud} />}
      {active && <Ammo hud={hud} />}

      {hud.frenzy && (
        <div className="absolute top-[74px] left-1/2 -translate-x-1/2 z-10 anim-pulse">
          <div className="chunky rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-5 py-1 text-white font-bold text-lg text-outline whitespace-nowrap">🔥 FRENZY! POIN ×2 🔥</div>
        </div>
      )}

      {playing && hud.me.streak >= 2 && (
        <div className="absolute left-1/2 bottom-[34%] -translate-x-1/2 z-10 pointer-events-none">
          <div key={hud.me.streak} className="anim-count chunky rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-0.5 text-white font-bold text-lg text-outline whitespace-nowrap">
            🔥 {hud.me.streak} BERUNTUN {hud.me.mult > 1 ? `· ×${hud.me.mult}` : ''}
          </div>
        </div>
      )}

      {hud.banner && playing && (
        <div key={hud.banner} className="absolute inset-x-0 top-[17%] flex justify-center anim-count z-20 px-2">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(8vw, 52px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      {active && hud.hint && hud.me.scopeK < 0.4 && (
        <div className="absolute left-1/2 bottom-[210px] sm:bottom-[92px] -translate-x-1/2 z-10 w-[92vw] sm:w-[52vw] flex justify-center">
          <div className="rounded-full bg-slate-900/70 px-5 py-2 text-white font-semibold text-center text-xs sm:text-base text-outline backdrop-blur-sm border-2 border-white/40">
            {touch ? hud.hint.replace('KLIK KANAN', 'tombol 🔭').replace('KLIK', 'tombol 🔫') : hud.hint}
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
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(14vw, 120px)' }}>
            TEMBAK! 🎯
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
            <b>WASD</b> jalan · <b>MOUSE</b> bidik · <b>KLIK</b> tembak · <b>KLIK KANAN</b> scope
          </div>
          <div>
            <b>F</b> senggol · <b>SHIFT</b> terjang · <b>SPASI</b> lompat · <b>R</b> reload · <b>Q</b> scope tetap
          </div>
        </div>
      )}
    </div>
  );
}

const medal = ['🥇', '🥈', '🥉', '4️⃣'];

export function HuntResults({ hud, onAgain, onMenu }: { hud: HuntHudState; onAgain: () => void; onMenu: () => void }) {
  const me = hud.board.find((b) => b.isPlayer)!;
  const winner = hud.board[0];
  const msg =
    me.rank === 1 ? '🎯 KAMU SNIPER TERBAIK!' : me.rank === 2 ? 'Hampir! Juara 2 🥈' : me.rank === 3 ? 'Latihan lagi, bidik lebih depan bebeknya!' : 'Kebanyakan kena senggol 😂';
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
              <div className="text-3xl w-9 text-center">{medal[i]}</div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={36} />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-800 truncate">{b.name}</div>
                <div className="text-[11px] text-slate-500">
                  🦆 {b.hits} · 🎯 {b.heads} headshot · akurasi {b.acc}% · 🔥 {b.bestStreak}
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

export function HuntTouch({ engine, scoped }: { engine: HuntEngine | null; scoped: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (!base.current || !knob.current || !engine) return;
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const m = Math.hypot(dx, dy);
    if (m > max) {
      dx = (dx / m) * max;
      dy = (dy / m) * max;
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
        <button className={`${btn} absolute right-0 bottom-0 w-24 h-24 bg-red-500 text-4xl`} onPointerDown={() => engine?.touchFire()}>
          🔫
        </button>
        <button className={`${btn} absolute right-[104px] bottom-1 w-[68px] h-[68px] text-2xl ${scoped ? 'bg-emerald-500 ring-4 ring-yellow-300' : 'bg-sky-500'}`} onPointerDown={() => engine?.toggleTouchScope()}>
          🔭
        </button>
        <button className={`${btn} absolute right-1 bottom-[104px] w-14 h-14 bg-orange-500 text-xl`} onPointerDown={() => engine?.touchShove()}>
          🤜
        </button>
        <button className={`${btn} absolute right-[72px] bottom-[84px] w-14 h-14 bg-fuchsia-500 text-xl`} onPointerDown={() => engine?.touchDive()}>
          🚀
        </button>
        <button className={`${btn} absolute right-[136px] bottom-[76px] w-12 h-12 bg-emerald-600 text-lg`} onPointerDown={() => engine?.touchJump()}>
          ⤴️
        </button>
        <button className={`${btn} absolute right-[190px] bottom-[10px] w-12 h-12 bg-slate-600 text-lg`} onPointerDown={() => engine?.touchReload()}>
          🔄
        </button>
      </div>
    </div>
  );
}
