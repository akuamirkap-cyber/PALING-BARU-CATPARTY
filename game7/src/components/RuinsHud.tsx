import { useRef } from 'react';
import type { RuinsEngine, RuinsHudState } from '../game/ruins';
import { CatIcon } from './CatIcon';

const MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}.${String(Math.floor((t * 10) % 10))}`;
}

function Board({ hud }: { hud: RuinsHudState }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 w-[172px] sm:w-[208px]">
      {hud.board.map((b) => (
        <div key={b.id} className={`chunky flex items-center gap-2 rounded-2xl px-2 py-1 ${b.isPlayer ? 'bg-white scale-105 origin-left' : 'bg-white/85'}`} style={{ borderColor: b.isPlayer ? b.color : '#fff' }}>
          <div className="text-sm font-bold text-slate-500 w-4 text-center">{b.rank}</div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: b.color }}>
            <CatIcon id={b.animal} size={28} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{b.name}</div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mt-0.5">
              <div className="h-full rounded-full" style={{ width: `${b.progress * 100}%`, background: b.color }} />
            </div>
          </div>
          <div className="text-sm font-bold text-slate-700 tabular-nums w-10 text-right">{b.finished ? '🏆' : `${Math.round(b.progress * 100)}%`}</div>
        </div>
      ))}
    </div>
  );
}

function Track({ hud }: { hud: RuinsHudState }) {
  const H = 100;
  const Y = (p: number) => H - p * (H - 6) - 3;
  const X = (x: number) => 50 + (x / 11) * 30;
  return (
    <div className="absolute right-3 top-[64px] z-10 chunky rounded-2xl bg-amber-950/55 p-1.5 backdrop-blur-sm">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-[58px] h-[190px] sm:w-[72px] sm:h-[250px] rounded-xl" style={{ background: 'linear-gradient(#f3d98a,#c99a52 55%,#8a6a3a)' }}>
        <rect x={16} y={0} width={68} height={100} fill="rgba(60,36,12,0.28)" />
        {[16, 26, 36, 46, 56, 66, 76, 86, 96].map((z) => (
          <line key={z} x1={14} x2={18} y1={Y(z / 106)} y2={Y(z / 106)} stroke="#2a4a2a" strokeWidth={1.6} />
        ))}
        <rect x={10} y={0} width={80} height={5} fill="#ffd23f" />
        <text x={50} y={4.2} fontSize={5} textAnchor="middle" fill="#5a3a00" fontWeight="bold">
          PUNCAK
        </text>
        {hud.track.boulders.map((b, i) => (
          <circle key={i} cx={X(b.x)} cy={Y(b.p)} r={2.2 + b.r * 1.7} fill="#7a6a58" stroke="#ff5a3d" strokeWidth={1.6} />
        ))}
        {hud.track.cats.map((c, i) => (
          <circle key={i} cx={X(c.x)} cy={Y(c.p)} r={c.me ? 5 : 3.6} fill={c.color} stroke="#fff" strokeWidth={c.me ? 2 : 1.3} />
        ))}
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

const ALERT_BG = { small: 'from-amber-400 to-orange-500', med: 'from-orange-500 to-red-600', giant: 'from-red-600 to-rose-800', row: 'from-yellow-400 to-amber-600' } as const;
const ALERT_ICON = { small: '🪨', med: '🪨', giant: '🌋', row: '🪨🪨🪨' } as const;

export function RuinsHud({ hud, touch }: { hud: RuinsHudState; touch: boolean }) {
  const playing = hud.phase === 'playing';
  const active = playing || hud.phase === 'countdown';
  const showAll = active || hud.phase === 'finished';
  const m = hud.me;
  const s = Math.max(0, Math.ceil(hud.timeLeft));
  const urgent = s <= 10;
  const al = hud.alert;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {playing && m.danger > 0.25 && (
        <div className="absolute inset-0 z-[8]" style={{ background: 'radial-gradient(ellipse at center, rgba(255,40,40,0) 38%, rgba(255,60,30,0.62) 100%)', opacity: 0.3 + m.danger * 0.7, animation: 'pulse-soft 0.3s ease-in-out infinite' }} />
      )}

      {showAll && (
        <>
          <Board hud={hud} />
          <Track hud={hud} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5">
            <div className={`chunky flex items-center gap-2 rounded-full px-5 py-1.5 ${urgent || hud.grace ? 'bg-red-500 anim-pulse' : 'bg-white'}`}>
              <span className="text-2xl">{urgent || hud.grace ? '⏰' : '⏱️'}</span>
              <span className={`text-4xl font-bold tabular-nums leading-none ${urgent || hud.grace ? 'text-white text-outline' : 'text-slate-800'}`}>{s}</span>
            </div>
            {hud.grace && <div className="chunky rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-0.5 text-white font-bold text-sm text-outline whitespace-nowrap anim-pulse">🏺 ADA YANG SUDAH SAMPAI! Cepat naik!</div>}
          </div>
        </>
      )}

      {/* peringatan batu */}
      {playing && al && (
        <div className="absolute left-1/2 top-[132px] sm:top-[104px] -translate-x-1/2 z-20 anim-slide w-[min(470px,90vw)]">
          <div className={`chunky rounded-3xl bg-gradient-to-r ${ALERT_BG[al.kind]} px-4 py-2 text-white text-outline flex items-center gap-3`}>
            <div className="text-3xl anim-pulse">{ALERT_ICON[al.kind]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xl sm:text-2xl font-bold leading-tight">{al.text}</div>
              <div className="text-xs sm:text-sm opacity-95 leading-tight">{al.sub}</div>
            </div>
          </div>
        </div>
      )}

      {playing && m.danger > 0.45 && !m.inNiche && (
        <div className="absolute left-1/2 top-[34%] -translate-x-1/2 z-20 anim-pulse">
          <div className="chunky rounded-3xl bg-red-600 px-6 py-2 text-3xl font-bold text-white text-outline whitespace-nowrap">⚠ AWAS BATU!</div>
        </div>
      )}

      {active && !m.finished && (
        <div className="absolute left-1/2 bottom-[178px] sm:bottom-3 -translate-x-1/2 z-10 w-[min(380px,92vw)]">
          <div className="chunky rounded-3xl bg-amber-950/55 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-white text-outline font-bold text-xs mb-1">
              <span>⛰️ {Math.round(m.progress * 100)}% ke puncak</span>
              <span>💥 tertimpa {m.hits}×</span>
            </div>
            <div className="h-3 rounded-full bg-black/35 overflow-hidden border-2 border-white/60">
              <div className="h-full rounded-full" style={{ width: `${m.progress * 100}%`, background: 'linear-gradient(90deg,#ffd23f,#ff8a3d)' }} />
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <Cd label="SPASI LONCAT" v={1} color="#7cf05a" />
              <Cd label="⇧ TERJANG" v={m.diveReady} color="#b26bff" />
              <Cd label="E SENGGOL" v={m.shoveReady} color="#ff8a3d" />
            </div>
          </div>
        </div>
      )}

      {hud.banner && (playing || hud.phase === 'finished') && (
        <div key={hud.banner} className="absolute inset-x-0 top-[20%] flex justify-center anim-count z-20 px-2">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(8vw, 52px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      {active && hud.hint && (
        <div className="absolute left-1/2 top-[84px] sm:top-[92px] -translate-x-1/2 z-10 w-[92vw] sm:w-[52vw] flex justify-center" style={{ marginTop: playing && al ? 70 : 0 }}>
          <div className="rounded-full bg-slate-900/60 px-5 py-1.5 text-white font-semibold text-center text-xs sm:text-sm text-outline backdrop-blur-sm border-2 border-white/40">
            {touch ? hud.hint.replace('SPASI', 'tombol ⤴️').replace('SHIFT', 'tombol 💨') : hud.hint}
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
            NAIK! 🗿
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
            <b>WASD</b> naik (ke arah kamera) · <b>SPASI</b> loncat · <b>SHIFT</b> terjang · <b>E</b> senggol
          </div>
          <div>
            <b>Geser mouse</b> (klik dulu) atau <b>Q / R</b> = putar kamera
          </div>
        </div>
      )}
    </div>
  );
}

export function RuinsResults({ hud, onAgain, onMenu }: { hud: RuinsHudState; onAgain: () => void; onMenu: () => void }) {
  const me = hud.board.find((b) => b.isPlayer)!;
  const winner = hud.board[0];
  const msg = me.finished
    ? me.rank === 1
      ? '🏆 KAMU MERAIH BERHALA EMAS!'
      : `Selamat! Kamu sampai di puncak (juara ${me.rank}) 🎉`
    : me.rank === 1
      ? 'Tidak ada yang sampai, tapi kamu paling tinggi! 🥇'
      : 'Kamu tergilas batu sebelum sampai puncak 🪨😂';
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-3 pointer-events-none">
      <div className="pointer-events-auto chunky anim-slide w-full max-w-md rounded-[32px] bg-white/95 p-5 mb-2 sm:mb-0">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-500">{winner.finished ? 'PENAKLUK KUIL' : 'PALING TINGGI'}</div>
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
                <div className="text-[11px] text-slate-500">💥 tertimpa {b.hits}× · {b.finished ? 'sampai puncak' : `gugur di ${Math.round(b.progress * 100)}%`}</div>
              </div>
              <div className="text-xl font-bold text-slate-800 tabular-nums">{b.finished ? fmt(b.time) : `${Math.round(b.progress * 100)}%`}</div>
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

export function RuinsTouch({ engine }: { engine: RuinsEngine | null }) {
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
        <button className={`${btn} absolute right-0 bottom-0 w-24 h-24 bg-emerald-500 text-4xl`} onPointerDown={() => engine?.touchJump()}>
          ⤴️
        </button>
        <button className={`${btn} absolute right-[104px] bottom-1 w-[68px] h-[68px] bg-fuchsia-500 text-2xl`} onPointerDown={() => engine?.touchDive()}>
          💨
        </button>
        <button className={`${btn} absolute right-1 bottom-[104px] w-14 h-14 bg-red-500 text-xl`} onPointerDown={() => engine?.touchShove()}>
          🤜
        </button>
      </div>
    </div>
  );
}
