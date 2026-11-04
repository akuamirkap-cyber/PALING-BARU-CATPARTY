import { useEffect, useRef, useState } from "react";
import { touch } from "../game/input";
import { initAudio } from "../game/audio";

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);

  const update = (e: React.PointerEvent) => {
    const r = baseRef.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width / 2;
    let dx = (e.clientX - cx) / max;
    let dy = (e.clientY - cy) / max;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    touch.mx = dx;
    touch.mz = dy;
    setKnob({ x: dx * max * 0.6, y: dy * max * 0.6 });
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative h-36 w-36 touch-none rounded-full border-4 border-white/50 bg-white/20 backdrop-blur-sm"
      onPointerDown={(e) => {
        initAudio();
        pid.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) update(e);
      }}
      onPointerUp={() => {
        pid.current = null;
        touch.mx = 0;
        touch.mz = 0;
        setKnob({ x: 0, y: 0 });
      }}
      onPointerCancel={() => {
        pid.current = null;
        touch.mx = 0;
        touch.mz = 0;
        setKnob({ x: 0, y: 0 });
      }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 rounded-full border-4 border-white bg-white/70 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function Btn({
  label,
  icon,
  size,
  onDown,
  onUp,
  className = "",
}: {
  label: string;
  icon: string;
  size: number;
  onDown: () => void;
  onUp?: () => void;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <div className={`pointer-events-auto flex flex-col items-center ${className}`}>
      <button
        className="flex touch-none select-none items-center justify-center rounded-full border-4 border-white/80 bg-white/30 text-3xl shadow-lg backdrop-blur-sm transition-transform"
        style={{ width: size, height: size, transform: pressed ? "scale(0.88)" : "scale(1)" }}
        onPointerDown={(e) => {
          initAudio();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setPressed(true);
          onDown();
        }}
        onPointerUp={() => {
          setPressed(false);
          onUp?.();
        }}
        onPointerCancel={() => {
          setPressed(false);
          onUp?.();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {icon}
      </button>
      <span className="mt-0.5 text-xs font-bold text-white drop-shadow">{label}</span>
    </div>
  );
}

export default function TouchControls() {
  useEffect(() => {
    touch.active = true;
    return () => {
      touch.active = false;
      touch.mx = touch.mz = 0;
      touch.grab = false;
      touch.grabPress = false;
      touch.punchHeld = false;
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <div className="absolute bottom-8 left-6">
        <Joystick />
      </div>
      <div className="absolute bottom-6 right-4 h-56 w-56">
        <Btn
          label="Angkat"
          icon="✋"
          size={84}
          className="absolute bottom-0 right-0"
          onDown={() => {
            touch.grab = true;
            touch.grabPress = true;
          }}
          onUp={() => (touch.grab = false)}
        />
        <Btn
          label="Punch"
          icon="🥊"
          size={76}
          className="absolute bottom-24 right-6"
          onDown={() => {
            touch.punch = true;
            touch.punchHeld = true;
          }}
          onUp={() => (touch.punchHeld = false)}
        />
        <Btn label="Jump" icon="🦘" size={72} className="absolute bottom-0 right-28" onDown={() => (touch.jump = true)} />
        <Btn label="Terjang" icon="💥" size={58} className="absolute bottom-44 right-0" onDown={() => (touch.headbutt = true)} />
        <Btn label="Angkat/Rebut" icon="🏋️" size={62} className="absolute bottom-40 right-24" onDown={() => (touch.lift = true)} />
      </div>
    </div>
  );
}
