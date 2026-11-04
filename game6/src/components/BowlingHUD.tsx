import { useCallback, useEffect, useRef, useState } from 'react';
import type { BowlingController, BowlingMessage, BowlingSnapshot } from '../bowling/controller';
import { BOARD_W, PIN_SPOTS } from '../bowling/dims';
import { ChunkyButton } from './ui';
import { cn } from '../utils/cn';

export function useBowling(ctl?: BowlingController) {
  const [snap, setSnap] = useState<BowlingSnapshot | null>(null);
  useEffect(() => {
    if (!ctl) {
      setSnap(null);
      return;
    }
    return ctl.subscribe(setSnap);
  }, [ctl]);
  return snap;
}

function PinDiagram({ standing }: { standing: boolean[] }) {
  return (
    <svg viewBox="-0.55 -0.12 1.1 0.98" className="h-14 w-14 shrink-0" aria-label="Pin tersisa">
      {PIN_SPOTS.map(([dx, dz], k) => (
        <g key={k}>
          <circle cx={dz} cy={0.8 - dx} r={0.105} fill={standing[k] ? '#ffffff' : 'rgba(31,36,48,0.15)'} stroke="#1f2430" strokeWidth={0.035} />
          {standing[k] && (
            <text x={dz} y={0.8 - dx + 0.045} textAnchor="middle" fontSize={0.12} fontWeight={700} fill="#d0202a">
              {k + 1}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function BowlingScoreboard({ snap }: { snap: BowlingSnapshot }) {
  const g = snap.game;
  return (
    <div className="pointer-events-auto flex max-w-full items-stretch gap-1.5 overflow-x-auto rounded-2xl border-[3px] border-ink bg-cream p-1.5 shadow-[0_5px_0_#1f2430]">
      <div className="flex flex-col items-center justify-center rounded-xl bg-ink px-2 text-cream">
        <span className="text-[9px] font-bold uppercase tracking-wider text-cream/70">Lane 3</span>
        <span className="text-sm font-bold">KAMU</span>
      </div>
      <div className="flex">
        {g.frames.map((f, i) => (
          <div
            key={i}
            className={cn(
              'flex w-8 shrink-0 flex-col border-y-2 border-l-2 border-ink/70 bg-white text-center sm:w-9',
              i === 9 && 'w-11 border-r-2 sm:w-12',
              i === g.frame && !g.done && 'bg-sun/70',
            )}
          >
            <div className="border-b border-ink/25 text-[9px] font-bold leading-3 text-ink/50">{i + 1}</div>
            <div className="flex h-5 border-b border-ink/25">
              {f.marks.map((m, k) => (
                <span key={k} className={cn('flex-1 text-[12px] font-bold leading-5', k > 0 && 'border-l border-ink/15', m === 'X' && 'text-coral', m === '/' && 'text-[#0e9fb3]')}>
                  {m}
                </span>
              ))}
            </div>
            <div className="h-5 text-[12px] font-bold leading-5">{f.total ?? ''}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-ink bg-sun px-2">
        <span className="text-[9px] font-bold uppercase">Total</span>
        <span className="text-xl font-bold leading-none">{g.total}</span>
      </div>
      <PinDiagram standing={snap.standing} />
    </div>
  );
}

function Slider({ label, value, display, min, max, onChange, accent }: { label: string; value: number; display: string; min: number; max: number; onChange: (v: number) => void; accent: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-ink/60">
        {label}
        <span className="rounded-md bg-ink px-1.5 font-mono text-[10px] normal-case text-cream">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={0.005} value={value} onChange={(e) => onChange(Number(e.target.value))} className="bowl-range" style={{ accentColor: accent }} />
    </label>
  );
}

export function BowlingControls({ ctl, snap }: { ctl: BowlingController; snap: BowlingSnapshot }) {
  const [charging, setCharging] = useState(false);
  const [power, setPower] = useState(0);
  const startRef = useRef(0);
  const powerRef = useRef(0);
  const chargingRef = useRef(false);
  const canRef = useRef(snap.canThrow);
  canRef.current = snap.canThrow;

  const start = useCallback(() => {
    if (!canRef.current || chargingRef.current) return;
    ctl.audio.ensure();
    startRef.current = performance.now();
    chargingRef.current = true;
    setCharging(true);
  }, [ctl]);
  const release = useCallback(() => {
    if (!chargingRef.current) return;
    chargingRef.current = false;
    setCharging(false);
    ctl.throwBall(powerRef.current);
  }, [ctl]);

  useEffect(() => {
    if (!charging) return;
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - startRef.current) / 1000;
      const p = 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.95);
      powerRef.current = p;
      setPower(p);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [charging]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const a = ctl.aim;
      const st = e.shiftKey ? 0.01 : 0.04;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft') ctl.setAim({ position: a.position - st });
      else if (e.key === 'ArrowRight') ctl.setAim({ position: a.position + st });
      else if (k === 'a') ctl.setAim({ angle: a.angle - st * 0.4 });
      else if (k === 'd') ctl.setAim({ angle: a.angle + st * 0.4 });
      else if (k === 'q') ctl.setAim({ spin: a.spin + st });
      else if (k === 'e') ctl.setAim({ spin: a.spin - st });
      else if (k === 'f') ctl.autoAim();
      else if (k === 'r') ctl.newGame();
      else if (e.key === ' ') {
        if (!e.repeat) start();
      } else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        release();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [ctl, start, release]);

  const a = snap.aim;
  const board = Math.max(1, Math.min(39, Math.round(20 - (a.position * 0.42) / BOARD_W)));
  const g = snap.game;
  const status = !snap.ready
    ? '⏳ Memuat mesin fisika…'
    : snap.state === 'approach'
      ? '🏃 Ancang-ancang…'
      : snap.state === 'rolling'
        ? `🎳 Menggelinding · ${snap.speedKmh.toFixed(1)} km/j`
        : snap.state === 'settling'
          ? '⏱️ Menghitung pin…'
          : snap.state === 'reset'
            ? '🤖 Pinsetter bekerja…'
            : snap.state === 'done'
              ? `🏁 Selesai — skor ${g.total}`
              : `Frame ${g.frame + 1} · Lemparan ${g.ball + 1}${g.rackFresh ? '' : ` · sisa ${g.standingBefore} pin`}`;
  const shown = charging ? power : snap.aim.power;

  return (
    <div className="flex w-[min(92vw,420px)] flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded-lg bg-ink px-2 py-0.5 text-xs font-bold text-cream">{status}</span>
        {snap.entryAngle !== null && snap.state !== 'ready' && (
          <span className="shrink-0 text-[11px] font-semibold text-ink/60">
            sudut masuk {snap.entryAngle.toFixed(1)}°
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Slider label="Posisi" value={a.position} min={-1} max={1} display={`papan ${board}`} accent="#ff6b6b" onChange={(v) => ctl.setAim({ position: v })} />
        <Slider label="Arah" value={a.angle} min={-1} max={1} display={`${(a.angle * 5).toFixed(2)}°`} accent="#3fc1c9" onChange={(v) => ctl.setAim({ angle: v })} />
        <Slider
          label="Spin"
          value={-a.spin}
          min={-1}
          max={1}
          display={a.spin > 0.04 ? `hook ↙ ${Math.round(a.spin * 100)}%` : a.spin < -0.04 ? `hook ↘ ${Math.round(-a.spin * 100)}%` : 'lurus'}
          accent="#b07cff"
          onChange={(v) => ctl.setAim({ spin: -v })}
        />
      </div>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1 overflow-hidden rounded-xl border-[3px] border-ink bg-white">
          <div className="absolute inset-y-0 left-[48%] w-[30%] bg-[#7CFC9A]/40" />
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal via-sun to-coral transition-[width] duration-75" style={{ width: `${shown * 100}%` }} />
          <div className="relative flex h-full items-center justify-between px-2 text-[11px] font-bold">
            <span>⚡ TENAGA</span>
            <span>{Math.round(shown * 100)}% · {((5.6 + shown * 4.4) * 3.6).toFixed(0)} km/j</span>
          </div>
        </div>
        <button
          type="button"
          disabled={!snap.canThrow}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            start();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          className={cn(
            'select-none rounded-xl border-[3px] border-ink px-4 py-2 font-display text-base font-bold shadow-[0_4px_0_#1f2430] transition-all',
            snap.canThrow ? 'bg-coral text-white hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-[0_1px_0_#1f2430]' : 'cursor-not-allowed bg-ink/20 text-ink/50',
            charging && 'translate-y-[2px] bg-sun text-ink shadow-[0_2px_0_#1f2430]',
          )}
        >
          {charging ? 'LEPAS!' : '🎳 TAHAN'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ChunkyButton tone="teal" className="px-2.5 py-1 text-xs" onClick={() => ctl.autoAim()} disabled={!snap.ready}>
          🎯 Bidik Pocket
        </ChunkyButton>
        <ChunkyButton tone={snap.state === 'done' ? 'yellow' : 'white'} className="px-2.5 py-1 text-xs" onClick={() => ctl.newGame()} disabled={snap.state !== 'done' && snap.state !== 'ready'}>
          🔄 Main Lagi
        </ChunkyButton>
        <span className="hidden text-[10px] leading-tight text-ink/50 lg:block">
          <kbd className="rounded border border-ink/30 bg-white px-1">Spasi</kbd> tahan-lepas · <kbd className="rounded border border-ink/30 bg-white px-1">←→</kbd> posisi ·{' '}
          <kbd className="rounded border border-ink/30 bg-white px-1">A D</kbd> arah · <kbd className="rounded border border-ink/30 bg-white px-1">Q E</kbd> spin
        </span>
      </div>
    </div>
  );
}

const POP_STYLE: Record<BowlingMessage['kind'], string> = {
  strike: 'linear-gradient(180deg,#fff275 0%,#ff9a3c 45%,#ff2fa8 100%)',
  spare: 'linear-gradient(180deg,#e0fbff 0%,#3fd2ff 55%,#2a6bff 100%)',
  gutter: 'linear-gradient(180deg,#e9edf5 0%,#94a3b8 100%)',
  miss: 'linear-gradient(180deg,#e9edf5 0%,#94a3b8 100%)',
  split: 'linear-gradient(180deg,#fff1c2 0%,#ff8a3d 100%)',
  count: 'linear-gradient(180deg,#ffffff 0%,#dbeafe 100%)',
  end: 'linear-gradient(90deg,#ff4fd8,#ffe14d,#6dff7a,#29e7ff,#b07cff)',
};

export function BowlingPopup({ message }: { message: BowlingMessage | null }) {
  const [shown, setShown] = useState<BowlingMessage | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    const id = window.setTimeout(() => setShown((s) => (s?.id === message.id ? null : s)), message.kind === 'end' ? 4500 : 2400);
    return () => window.clearTimeout(id);
  }, [message]);
  if (!shown) return null;
  const big = shown.kind === 'strike' || shown.kind === 'spare' || shown.kind === 'end';
  return (
    <div key={shown.id} className="pointer-events-none absolute inset-x-0 top-[35%] z-30 flex flex-col items-center px-4 text-center">
      <div className={cn('bowl-pop bowl-text', big ? 'text-[56px] sm:text-[96px]' : 'text-[40px] sm:text-[64px]')} style={{ backgroundImage: POP_STYLE[shown.kind] }}>
        {shown.text}
      </div>
      {shown.sub && <div className="bowl-sub mt-1 rounded-xl border-[3px] border-ink bg-white px-3 py-1 text-sm font-bold shadow-[0_4px_0_#1f2430] sm:text-base">{shown.sub}</div>}
    </div>
  );
}
