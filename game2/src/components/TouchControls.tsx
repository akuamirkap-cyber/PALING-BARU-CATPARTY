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
  icon: React.ReactNode;
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
        <span className="grid place-items-center [&_svg]:h-8 [&_svg]:w-8">{icon}</span>
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
          label="Grab"
          icon={<GrabIcon />}
          size={84}
          className="absolute bottom-0 right-0"
          onDown={() => (touch.grab = true)}
          onUp={() => (touch.grab = false)}
        />
        <Btn
          label="Punch"
          icon={<PunchIcon />}
          size={76}
          className="absolute bottom-24 right-6"
          onDown={() => {
            touch.punch = true;
            touch.punchHeld = true;
          }}
          onUp={() => (touch.punchHeld = false)}
        />
        <Btn label="Jump" icon={<JumpIcon />} size={72} className="absolute bottom-0 right-28" onDown={() => (touch.jump = true)} />
        <Btn label="HeadButt" icon={<HeadIcon />} size={58} className="absolute bottom-44 right-0" onDown={() => (touch.headbutt = true)} />
        <Btn label="Angkat/Lempar" icon={<LiftIcon />} size={62} className="absolute bottom-40 right-24" onDown={() => (touch.lift = true)} />
      </div>
    </div>
  );
}

const Ico = ({ children, size = 34 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>{children}</svg>
);
function JumpIcon() {
  return <Ico><path d="M12 3.5 6 10h4v4h4v-4h4L12 3.5Z" fill="#ffffff" stroke="#1d3557" strokeWidth="1.7" strokeLinejoin="round" /><path d="M5 20h14" stroke="#1d3557" strokeWidth="2.4" strokeLinecap="round" /></Ico>;
}
function PunchIcon() {
  return <Ico><rect x="4.5" y="8.5" width="11" height="9" rx="3.2" fill="#fff" stroke="#1d3557" strokeWidth="1.7" /><path d="M15.5 10.5h2.2a2.2 2.2 0 0 1 0 4.4h-2.2M7.5 8.5V6.8a1.8 1.8 0 0 1 3.6 0v1.7" stroke="#1d3557" strokeWidth="1.7" strokeLinecap="round" /><path d="M8 8.5v2M11 8.5v2" stroke="#1d3557" strokeWidth="1.4" strokeLinecap="round" /></Ico>;
}
function GrabIcon() {
  return <Ico><path d="M8 12V6.6a1.6 1.6 0 0 1 3.2 0V11M11.2 11V5.4a1.6 1.6 0 0 1 3.2 0V11M14.4 11V6.6a1.6 1.6 0 0 1 3.2 0V15c0 3.2-2.4 5.4-5.4 5.4-2.5 0-3.7-1-5.1-3l-2-3a1.7 1.7 0 0 1 2.7-2L8 14" stroke="#1d3557" strokeWidth="1.7" strokeLinejoin="round" fill="#ffffff" /></Ico>;
}
function HeadIcon() {
  return <Ico><path d="M12 3.5l2 3.7 4.2.7-3 3 .7 4.2-3.9-2-3.9 2 .7-4.2-3-3 4.2-.7 2-3.7Z" fill="#fff3b8" stroke="#7a4a06" strokeWidth="1.7" strokeLinejoin="round" /><path d="M6 20h12" stroke="#7a4a06" strokeWidth="2.2" strokeLinecap="round" /></Ico>;
}
function LiftIcon() {
  return <Ico><path d="M12 3v10M12 3l-3 3M12 3l3 3" stroke="#1d3557" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M6.5 11.5h11v6.8a2.2 2.2 0 0 1-2.2 2.2H8.7a2.2 2.2 0 0 1-2.2-2.2v-6.8Z" fill="#fff" stroke="#1d3557" strokeWidth="1.7" /></Ico>;
}
