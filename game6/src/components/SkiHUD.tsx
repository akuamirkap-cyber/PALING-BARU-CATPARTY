import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkiController, SkiMessage, SkiSnapshot } from '../ski/controller';
import { formatTime } from '../ski/controller';
import { COURSE } from '../ski/course';
import { ChunkyButton } from './ui';
import { cn } from '../utils/cn';

export function useSki(ctl?: SkiController) {
  const [snap, setSnap] = useState<SkiSnapshot | null>(null);
  useEffect(() => {
    if (!ctl) {
      setSnap(null);
      return;
    }
    return ctl.subscribe(setSnap);
  }, [ctl]);
  return snap;
}

const MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];

function Minimap({ snap }: { snap: SkiSnapshot }) {
  const geo = useMemo(() => {
    const c = COURSE;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const pts: [number, number][] = [];
    for (let i = 0; i < c.N; i += 12) {
      pts.push([c.xs[i], c.zs[i]]);
      x0 = Math.min(x0, c.xs[i]);
      x1 = Math.max(x1, c.xs[i]);
      z0 = Math.min(z0, c.zs[i]);
      z1 = Math.max(z1, c.zs[i]);
    }
    const W = 230;
    const pad = 8;
    const sc = (W - pad * 2) / (x1 - x0);
    const H = (z1 - z0) * sc + pad * 2;
    const map = (x: number, z: number) => [pad + (x - x0) * sc, pad + (z - z0) * sc] as const;
    const d = pts.map(([x, z], k) => `${k ? 'L' : 'M'}${map(x, z)[0].toFixed(1)},${map(x, z)[1].toFixed(1)}`).join(' ');
    const fin = c.frame(c.finishS);
    const st = c.frame(c.startS);
    return { W, H, d, map, fin: map(fin.x, fin.z), st: map(st.x, st.z), jumps: c.jumps.map((j) => map(c.frame(j.s).x, c.frame(j.s).z)) };
  }, []);
  return (
    <svg viewBox={`0 0 ${geo.W} ${geo.H}`} className="w-full" aria-label="Peta lintasan">
      <path d={geo.d} fill="none" stroke="#1f2430" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d={geo.d} fill="none" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      {geo.jumps.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={2.4} fill="#2563eb" />
      ))}
      <text x={geo.st[0]} y={geo.st[1] - 6} fontSize={8} fontWeight={700} textAnchor="middle" fill="#1f2430">
        START
      </text>
      <text x={geo.fin[0]} y={geo.fin[1] - 6} fontSize={8} fontWeight={700} textAnchor="middle" fill="#e63946">
        🏁
      </text>
      {snap.dots.map((d, k) => {
        const [x, y] = geo.map(d.x, d.z);
        return <circle key={k} cx={x} cy={y} r={d.player ? 5 : 3.6} fill={d.color} stroke="#1f2430" strokeWidth={d.player ? 2 : 1.2} />;
      })}
    </svg>
  );
}

export function SkiStatus({ snap }: { snap: SkiSnapshot }) {
  const racing = snap.phase === 'race' || snap.phase === 'results';
  return (
    <div className="pointer-events-auto flex w-[min(92vw,330px)] flex-col gap-1.5 rounded-2xl border-[3px] border-ink bg-cream p-2 shadow-[0_5px_0_#1f2430]">
      <div className="flex items-stretch gap-1.5">
        <div className="flex flex-col items-center justify-center rounded-xl bg-ink px-2.5 text-cream">
          <span className="text-[9px] font-bold uppercase tracking-wider text-cream/70">Posisi</span>
          <span className="text-2xl font-bold leading-none">
            {racing ? snap.position : '-'}
            <span className="text-xs text-cream/60">/{snap.racers}</span>
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center rounded-xl border-2 border-ink bg-white px-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink/50">Waktu</span>
          <span className="font-mono text-xl font-bold leading-none tabular-nums">{formatTime(racing ? snap.raceTime : 0)}</span>
          {snap.penalty > 0 && <span className="text-[10px] font-bold text-coral">termasuk +{snap.penalty}s penalti</span>}
        </div>
        <div className="flex w-20 flex-col items-center justify-center rounded-xl border-2 border-ink bg-sun">
          <span className="text-2xl font-bold leading-none tabular-nums">{Math.round(snap.speedKmh)}</span>
          <span className="text-[9px] font-bold uppercase">km/jam</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
        <div className="h-full bg-gradient-to-r from-teal to-coral transition-[width]" style={{ width: `${Math.min(100, snap.speedKmh)}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold">
        <span className="rounded-md bg-white px-1.5 py-0.5 ring-2 ring-ink/15">🚩 {snap.gatesOk}/{snap.gatesTotal}</span>
        {snap.missed > 0 && <span className="rounded-md bg-coral px-1.5 py-0.5 text-white">✖ {snap.missed} terlewat</span>}
        <span className="rounded-md bg-white px-1.5 py-0.5 ring-2 ring-ink/15">🪂 {snap.bestAir.toFixed(2)}s</span>
        {snap.tuck && <span className="rounded-md bg-teal px-1.5 py-0.5">TUCK ⚡</span>}
        {snap.air && <span className="rounded-md bg-sky-300 px-1.5 py-0.5">MELAYANG</span>}
        {snap.crashed && <span className="rounded-md bg-coral px-1.5 py-0.5 text-white">JATUH!</span>}
      </div>
      <div className="rounded-xl border-2 border-ink/20 bg-gradient-to-b from-sky-100 to-white px-1 [@media(max-height:820px)]:hidden">
        <Minimap snap={snap} />
      </div>
      <div className="flex flex-col gap-0.5 [@media(max-height:700px)]:hidden">
        {snap.standings.map((s, k) => (
          <div key={s.id} className={cn('flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[11px] font-bold', s.player ? 'bg-sun' : 'bg-white/70')}>
            <span className="w-4 text-center">{k + 1}</span>
            <span className="h-3 w-3 rounded-full border-2 border-ink" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="font-mono tabular-nums">{s.finished ? formatTime(s.time) : `${Math.round(s.progress * 100)}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldButton({ label, onChange, className }: { label: string; onChange: (on: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onPointerLeave={() => onChange(false)}
      className={cn('select-none rounded-xl border-[3px] border-ink bg-white px-3 py-2 text-sm font-bold shadow-[0_3px_0_#1f2430] active:translate-y-[2px] active:bg-sun active:shadow-[0_1px_0_#1f2430]', className)}
    >
      {label}
    </button>
  );
}

export function SkiControls({ ctl, snap, opponents, setOpponents }: { ctl: SkiController; snap: SkiSnapshot; opponents: number; setOpponents: (n: number) => void }) {
  const keys = useRef({ l: false, r: false });
  useEffect(() => {
    const apply = () => ctl.setInput({ steer: (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0) });
    const handle = (down: boolean) => (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keys.current.l = down;
      else if (k === 'arrowright' || k === 'd') keys.current.r = down;
      else if (k === 'arrowup' || k === 'w') ctl.setInput({ tuck: down });
      else if (k === 'arrowdown' || k === 's') ctl.setInput({ brake: down });
      else if (k === ' ') {
        if (down && ctl.phase === 'pre') ctl.startRace();
        else ctl.setInput({ jump: down });
      } else if (k === 'enter' && down) {
        if (ctl.phase === 'pre') ctl.startRace();
        else if (ctl.phase === 'results') ctl.resetRace();
      } else if (k === 'r' && down) ctl.resetRace();
      else return;
      apply();
      e.preventDefault();
    };
    const kd = handle(true);
    const ku = handle(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      ctl.setInput({ steer: 0, tuck: false, brake: false, jump: false });
    };
  }, [ctl]);

  const steer = (side: 'l' | 'r') => (on: boolean) => {
    keys.current[side] = on;
    ctl.setInput({ steer: (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0) });
  };

  return (
    <div className="flex w-[min(92vw,400px)] flex-col gap-2">
      {snap.phase === 'pre' ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/60">Lawan</span>
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setOpponents(n)}
                className={cn('h-8 w-8 rounded-lg border-2 text-sm font-bold', opponents === n ? 'border-ink bg-sun shadow-[0_2px_0_#1f2430]' : 'border-ink/25 bg-white')}
              >
                {n}
              </button>
            ))}
            <span className="text-[11px] text-ink/50">{opponents === 0 ? 'latihan solo' : 'beast AI'}</span>
          </div>
          <ChunkyButton tone="coral" className="w-full py-3 text-lg" onClick={() => ctl.startRace()}>
            🏁 MULAI BALAPAN
          </ChunkyButton>
        </>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          <HoldButton label="◀" onChange={steer('l')} className="text-lg" />
          <HoldButton label="TUCK" onChange={(on) => ctl.setInput({ tuck: on })} className="bg-teal" />
          <HoldButton label="LOMPAT" onChange={(on) => ctl.setInput({ jump: on })} className="bg-sun text-xs" />
          <HoldButton label="REM" onChange={(on) => ctl.setInput({ brake: on })} className="bg-coral/80 text-white" />
          <HoldButton label="▶" onChange={steer('r')} className="text-lg" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ChunkyButton tone="white" className="px-2.5 py-1 text-xs" onClick={() => ctl.resetRace()} disabled={snap.phase === 'pre'}>
          🔄 Ulangi
        </ChunkyButton>
        <span className="hidden text-[10px] leading-tight text-ink/55 lg:block">
          <kbd className="rounded border border-ink/30 bg-white px-1">← →</kbd> belok · <kbd className="rounded border border-ink/30 bg-white px-1">↑</kbd> tuck · <kbd className="rounded border border-ink/30 bg-white px-1">↓</kbd> rem ·{' '}
          <kbd className="rounded border border-ink/30 bg-white px-1">Spasi</kbd> lompat/putar di udara · <kbd className="rounded border border-ink/30 bg-white px-1">R</kbd> ulang
        </span>
      </div>
    </div>
  );
}

const POP: Record<SkiMessage['kind'], string> = {
  go: 'linear-gradient(180deg,#d9ffe1 0%,#2fd36b 60%,#0b8f3a 100%)',
  gate: 'linear-gradient(180deg,#ffffff,#bfdbfe)',
  miss: 'linear-gradient(180deg,#fff1c2 0%,#ff8a3d 100%)',
  air: 'linear-gradient(180deg,#e0fbff 0%,#3fd2ff 55%,#2a6bff 100%)',
  trick: 'linear-gradient(180deg,#fff275 0%,#ff9a3c 45%,#ff2fa8 100%)',
  crash: 'linear-gradient(180deg,#ffe0e0 0%,#ff6b6b 60%,#c81e1e 100%)',
  finish: 'linear-gradient(180deg,#ffffff 0%,#dbeafe 100%)',
  win: 'linear-gradient(90deg,#ff4fd8,#ffe14d,#6dff7a,#29e7ff,#b07cff)',
  info: 'linear-gradient(180deg,#ffffff 0%,#dbeafe 100%)',
};

export function SkiOverlays({ ctl, snap }: { ctl: SkiController; snap: SkiSnapshot }) {
  const [shown, setShown] = useState<SkiMessage | null>(null);
  useEffect(() => {
    const m = snap.message;
    if (!m) return;
    setShown(m);
    const id = window.setTimeout(() => setShown((s) => (s?.id === m.id ? null : s)), m.kind === 'win' ? 3800 : 2000);
    return () => window.clearTimeout(id);
  }, [snap.message]);

  return (
    <>
      {snap.phase === 'countdown' && snap.countdown > 0 && (
        <div key={snap.countdown} className="pointer-events-none absolute inset-x-0 top-[28%] z-30 flex justify-center">
          <div className="bowl-pop bowl-text text-[120px] sm:text-[170px]" style={{ backgroundImage: 'linear-gradient(180deg,#fff 0%,#ffd23f 50%,#ff6b6b 100%)' }}>
            {snap.countdown}
          </div>
        </div>
      )}
      {shown && snap.phase !== 'results' && (
        <div key={shown.id} className="pointer-events-none absolute inset-x-0 top-[30%] z-30 flex flex-col items-center px-4 text-center">
          <div className={cn('bowl-pop bowl-text', shown.kind === 'go' || shown.kind === 'win' ? 'text-[64px] sm:text-[104px]' : 'text-[38px] sm:text-[60px]')} style={{ backgroundImage: POP[shown.kind] }}>
            {shown.text}
          </div>
          {shown.sub && <div className="bowl-sub mt-1 rounded-xl border-[3px] border-ink bg-white px-3 py-1 text-sm font-bold shadow-[0_4px_0_#1f2430]">{shown.sub}</div>}
        </div>
      )}
      {snap.phase === 'results' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]">
          <div className="toast-pop w-[min(94vw,440px)] rounded-3xl border-[3px] border-ink bg-cream p-4 shadow-[0_8px_0_#1f2430]" style={{ transform: 'translate(0,0)' }}>
            <div className="text-center">
              <div className="text-5xl">{MEDAL[snap.position - 1] ?? '🏁'}</div>
              <h2 className="mt-1 text-3xl font-bold">{snap.position === 1 ? 'JUARA!' : `Posisi ${snap.position}`}</h2>
              <p className="text-sm font-semibold text-ink/60">
                Waktu kamu <b className="text-ink">{formatTime(snap.finishTime)}</b>
                {snap.penalty > 0 && <span className="text-coral"> (+{snap.penalty}s penalti)</span>}
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {snap.standings.map((s, k) => (
                <div key={s.id} className={cn('flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-sm font-bold', s.player ? 'border-ink bg-sun' : 'border-ink/15 bg-white')}>
                  <span className="w-6 text-center text-lg">{MEDAL[k]}</span>
                  <span className="h-4 w-4 rounded-full border-2 border-ink" style={{ background: s.color }} />
                  <span className="flex-1">{s.name}</span>
                  {s.missed > 0 && <span className="text-[11px] text-coral">+{s.penalty}s</span>}
                  <span className="font-mono tabular-nums">{s.finished ? formatTime(s.time) : `${Math.round(s.progress * 100)}%…`}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px] font-bold">
              <div className="rounded-xl bg-white p-1.5 ring-2 ring-ink/10">
                ⚡ {Math.round(snap.maxKmh)} km/j
                <div className="text-[9px] text-ink/50">kecepatan maks</div>
              </div>
              <div className="rounded-xl bg-white p-1.5 ring-2 ring-ink/10">
                🪂 {snap.bestAir.toFixed(2)} dtk
                <div className="text-[9px] text-ink/50">lompatan terlama</div>
              </div>
              <div className="rounded-xl bg-white p-1.5 ring-2 ring-ink/10">
                🚩 {snap.gatesOk}/{snap.gatesTotal}
                <div className="text-[9px] text-ink/50">gerbang</div>
              </div>
            </div>
            <ChunkyButton tone="coral" className="mt-3 w-full py-2.5 text-base" onClick={() => ctl.resetRace()}>
              🔄 Balapan Lagi
            </ChunkyButton>
          </div>
        </div>
      )}
    </>
  );
}
