import { useRef } from 'react';
import type { GameEngine } from '../game/engine';

export function TouchControls({ engine }: { engine: GameEngine | null }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);

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
    activeId.current = null;
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
    engine?.setJoy(0, 0);
  };

  const btn = 'chunky rounded-full flex items-center justify-center font-bold text-white text-outline select-none active:scale-90 transition-transform';

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none h-44">
      <div
        ref={base}
        className="absolute left-5 bottom-5 w-32 h-32 rounded-full bg-white/30 border-4 border-white/70 pointer-events-auto"
        onPointerDown={(e) => {
          activeId.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (activeId.current === e.pointerId) move(e);
        }}
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
            engine?.setTouchHold(true);
          }}
          onPointerUp={() => engine?.setTouchHold(false)}
          onPointerCancel={() => engine?.setTouchHold(false)}
        >
          🎣
        </button>
        <button className={`${btn} absolute right-28 bottom-0 w-16 h-16 bg-red-500 text-2xl`} onPointerDown={() => engine?.touchPunch()}>
          👊
        </button>
        <button className={`${btn} absolute right-24 bottom-[72px] w-14 h-14 bg-emerald-500 text-xl`} onPointerDown={() => engine?.touchJump()}>
          ⤴️
        </button>
        <button className={`${btn} absolute right-2 bottom-[104px] w-14 h-14 bg-orange-500 text-xl`} onPointerDown={() => engine?.touchDive()}>
          🚀
        </button>
      </div>
    </div>
  );
}
