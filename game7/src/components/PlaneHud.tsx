import { useRef } from 'react';
import type { PlaneEngine, PlaneHudState } from '../game/plane';
import { CatIcon } from './CatIcon';

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
const ORD = ['🥇', '🥈', '🥉', '4️⃣'];
const KIND_ICON = { gust: '💨', bank: '✈️', bird: '🐦', turb: '🌀' } as const;
const KIND_BG = { gust: 'from-sky-500 to-blue-600', bank: 'from-amber-400 to-orange-500', bird: 'from-rose-500 to-red-600', turb: 'from-violet-500 to-fuchsia-600' } as const;

function Board({ hud }: { hud: PlaneHudState }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 w-[170px] sm:w-[205px]">
      {hud.board.map((b) => (
        <div
          key={b.id}
          className={`chunky flex items-center gap-2 rounded-2xl px-2 py-1 transition-all ${b.isPlayer ? 'bg-white scale-105 origin-left' : 'bg-white/85'} ${b.alive ? '' : 'opacity-55 grayscale'}`}
          style={{ borderColor: b.isPlayer ? b.color : '#fff' }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: b.color }}>
            <CatIcon id={b.animal} size={28} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{b.name}</div>
            <div className="text-[10px] text-slate-400">{b.alive ? (b.bracing ? '🫸 berpegangan' : '😼 bertahan') : `${ORD[Math.min(3, Math.max(0, b.place - 1))]} jatuh · ${fmt(b.time)}`}</div>
          </div>
          <div className="text-sm font-bold text-slate-700 tabular-nums">🎯{b.ko}</div>
        </div>
      ))}
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

export function PlaneHud({ hud, touch, onSkip }: { hud: PlaneHudState; touch: boolean; onSkip: () => void }) {
  const playing = hud.phase === 'playing';
  const active = playing || hud.phase === 'countdown';
  const showAll = active || hud.phase === 'finished';
  const m = hud.me;
  const w = hud.wind;
  const al = hud.alert;
  const arrow = Math.atan2(w.x, -w.z) * (180 / Math.PI);
  const flowDeg = -Math.atan2(hud.wind.dirX, hud.wind.dirZ) * (180 / Math.PI);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {playing && w.str > 0.05 && (
        <div className="absolute inset-0 z-[5] overflow-hidden">
          <div className="windfx" style={{ transform: `rotate(${flowDeg}deg)`, opacity: Math.min(0.8, w.str * 0.85) }} />
        </div>
      )}
      {playing && m.push > 0.45 && m.edge && m.alive && (
        <div className="absolute inset-0 z-[8]" style={{ background: 'radial-gradient(ellipse at center, rgba(255,40,60,0) 40%, rgba(255,40,60,0.55) 100%)', opacity: 0.4 + m.push * 0.6, animation: 'pulse-soft 0.32s ease-in-out infinite' }} />
      )}

      {showAll && (
        <>
          <Board hud={hud} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5">
            <div className="chunky flex items-center gap-2 rounded-full bg-white px-5 py-1.5">
              <span className="text-2xl">⏱️</span>
              <span className="text-4xl font-bold tabular-nums leading-none text-slate-800">{fmt(hud.time)}</span>
            </div>
            <div className="chunky rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-1 text-white font-bold text-outline flex items-center gap-2 min-w-[210px]">
              <span className="text-sm whitespace-nowrap">GELOMBANG {hud.wave}</span>
              <div className="flex-1 h-2 rounded-full bg-black/30 overflow-hidden">
                <div className="h-full bg-yellow-300" style={{ width: `${hud.waveProg * 100}%` }} />
              </div>
              <span className="text-sm">😼{hud.alive}</span>
            </div>
          </div>
        </>
      )}

      {/* peringatan event */}
      {playing && al && (
        <div className="absolute left-1/2 top-[132px] sm:top-[118px] -translate-x-1/2 z-20 anim-slide w-[min(460px,92vw)]">
          <div className={`chunky rounded-3xl bg-gradient-to-r ${KIND_BG[al.kind]} px-4 py-2 text-white text-outline flex items-center gap-3`}>
            <div className="text-4xl anim-pulse">{KIND_ICON[al.kind]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xl sm:text-2xl font-bold leading-tight">{al.text}</div>
              <div className="text-xs sm:text-sm opacity-95 leading-tight">{al.sub}</div>
            </div>
            {al.kind !== 'turb' && (
              <div className="text-4xl font-bold" style={{ transform: al.kind === 'bank' ? `rotate(${al.bank * 28}deg)` : `rotate(${Math.atan2(al.dx, -al.dz) * (180 / Math.PI)}deg)` }}>
                {al.kind === 'bank' ? '✈️' : '⬆'}
              </div>
            )}
          </div>
        </div>
      )}

      {playing && m.edge && m.alive && (
        <div className="absolute left-1/2 top-[27%] -translate-x-1/2 z-10 anim-pulse">
          <div className="chunky rounded-full bg-amber-400 px-4 py-1 text-base font-bold text-slate-800">⚠ Tepi pesawat! Menjauh</div>
        </div>
      )}

      {/* panel kanan bawah */}
      {active && m.alive && (
        <div className="absolute right-3 bottom-[200px] sm:bottom-4 z-10 chunky rounded-3xl bg-slate-900/50 px-3 py-2 backdrop-blur-sm flex flex-col gap-1.5 w-[220px]">
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <div className="text-3xl font-bold text-white" style={{ transform: `rotate(${arrow}deg)`, opacity: w.str > 0.05 || w.pending ? 1 : 0.35, color: w.pending ? '#ffd23f' : '#fff' }}>
                ⬆
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-white text-outline">{w.str > 0.05 ? '💨 ANGIN KENCANG' : w.pending ? '⚠ ANGIN DATANG' : 'angin tenang'}</div>
              <div className="h-2.5 rounded-full bg-white/20 overflow-hidden mt-0.5">
                <div className="h-full rounded-full" style={{ width: `${Math.max(w.str, m.push * 0.4) * 100}%`, background: 'linear-gradient(90deg,#7cf05a,#ffd23f,#ff5a4d)' }} />
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-bold text-white text-outline">
              <span>🫸 PEGANGAN (F / klik)</span>
              <span>{m.locked ? 'LELAH!' : m.bracing ? 'MENAHAN' : 'siap'}</span>
            </div>
            <div className="mt-0.5 h-3.5 rounded-full bg-black/35 overflow-hidden border-2 border-white/50">
              <div className="h-full rounded-full" style={{ width: `${m.stamina * 100}%`, background: m.locked ? '#ff4d4d' : m.stamina > 0.5 ? '#7cf05a' : m.stamina > 0.25 ? '#ffd23f' : '#ff8a3d' }} />
            </div>
          </div>
          <div className="flex gap-1.5">
            <Cd label="⇧ TERJANG" v={m.diveReady} color="#b26bff" />
            <Cd label="E SENGGOL" v={m.shoveReady} color="#ff8a3d" />
          </div>
        </div>
      )}

      {playing && !m.alive && (
        <div className="absolute inset-x-0 top-[34%] z-20 flex flex-col items-center gap-3 pointer-events-none">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(11vw, 76px)' }}>
            KAMU JATUH! 😵
          </div>
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              onSkip();
            }}
            className="pointer-events-auto chunky rounded-full bg-gradient-to-b from-sky-400 to-blue-500 px-6 py-2 text-xl font-bold text-white text-outline hover:scale-105 active:scale-95 transition-transform"
          >
            Lewati ⏩ lihat hasil
          </button>
        </div>
      )}

      {hud.banner && (playing || hud.phase === 'finished') && (
        <div key={hud.banner} className="absolute inset-x-0 top-[22%] flex justify-center anim-count z-20 px-2">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(8vw, 54px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      {active && hud.hint && (
        <div className="absolute left-1/2 bottom-[210px] sm:bottom-4 -translate-x-1/2 z-10 w-[92vw] sm:w-[46vw] flex justify-center">
          <div className="rounded-full bg-slate-900/70 px-5 py-2 text-white font-semibold text-center text-xs sm:text-base text-outline backdrop-blur-sm border-2 border-white/40">
            {touch ? hud.hint.replace('F / klik TAHAN', 'tombol 🫸 TAHAN').replace('Tahan F / klik', 'Tahan 🫸') : hud.hint}
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
            BERTAHAN! ✈️
          </div>
        </div>
      )}

      {!touch && active && (
        <div className="hidden lg:block absolute left-3 bottom-3 z-10 chunky rounded-2xl bg-white/85 px-3 py-2 text-xs text-slate-700 leading-5">
          <div>
            <b>WASD</b> jalan · <b>F</b> / klik <b>TAHAN</b> = berpegangan · <b>SPASI</b> lompat
          </div>
          <div>
            <b>SHIFT</b> terjang · <b>E</b> senggol
          </div>
        </div>
      )}
    </div>
  );
}

export function PlaneResults({ hud, onAgain, onMenu }: { hud: PlaneHudState; onAgain: () => void; onMenu: () => void }) {
  const ranked = [...hud.board].sort((a, b) => (a.place || 9) - (b.place || 9));
  const me = ranked.find((b) => b.isPlayer)!;
  const winner = ranked[0];
  const msg = me.place === 1 ? '👑 KAMU PENJAGA PESAWAT!' : me.place === 2 ? 'Hampir! Juara 2 🥈' : me.place === 3 ? 'Berpegangan lebih sering ya! 🫸' : 'Kamu yang pertama diterbangkan angin 😂';
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto chunky anim-slide w-full max-w-md rounded-[32px] bg-white/95 p-5 mb-2 sm:mb-0">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-500">PENYINTAS TERAKHIR</div>
          <div className="flex justify-center my-1">
            <CatIcon id={winner.animal} size={72} />
          </div>
          <div className="text-3xl font-bold text-slate-800 leading-tight">{winner.isPlayer ? 'KAMU' : winner.name}</div>
          <div className="mt-1 text-base font-semibold text-orange-500">{msg}</div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {ranked.map((b, i) => (
            <div key={b.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 border-4 ${i === 0 ? 'bg-yellow-100' : 'bg-slate-50'}`} style={{ borderColor: b.color }}>
              <div className="text-3xl w-9 text-center">{ORD[i]}</div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: b.color }}>
                <CatIcon id={b.animal} size={36} />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-800 truncate">{b.name}</div>
                <div className="text-[11px] text-slate-500">
                  ⏱ bertahan {fmt(b.time)} · 🎯 {b.ko} KO
                </div>
              </div>
              <div className="text-xl font-bold text-slate-700">{b.place === 1 ? '🏆' : `#${b.place}`}</div>
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

export function PlaneTouch({ engine }: { engine: PlaneEngine | null }) {
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
        <button
          className={`${btn} absolute right-0 bottom-0 w-24 h-24 bg-sky-500 text-4xl`}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            engine?.setTouchBrace(true);
          }}
          onPointerUp={() => engine?.setTouchBrace(false)}
          onPointerCancel={() => engine?.setTouchBrace(false)}
        >
          🫸
        </button>
        <button className={`${btn} absolute right-[104px] bottom-1 w-[66px] h-[66px] bg-emerald-500 text-2xl`} onPointerDown={() => engine?.touchJump()}>
          ⤴️
        </button>
        <button className={`${btn} absolute right-1 bottom-[104px] w-14 h-14 bg-fuchsia-500 text-xl`} onPointerDown={() => engine?.touchDive()}>
          🚀
        </button>
        <button className={`${btn} absolute right-[72px] bottom-[84px] w-14 h-14 bg-red-500 text-xl`} onPointerDown={() => engine?.touchShove()}>
          🤜
        </button>
      </div>
    </div>
  );
}
