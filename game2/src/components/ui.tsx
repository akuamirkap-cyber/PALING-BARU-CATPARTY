import React from "react";
import { sfx, initAudio } from "../game/audio";

export type Tone = "yellow" | "blue" | "pink" | "mint" | "white" | "orange";
export const TONES: Record<Tone, { top: string; bot: string; edge: string; text: string; soft: string }> = {
  yellow: { top: "#ffe45c", bot: "#ffc400", edge: "#c98a00", text: "#5b3a00", soft: "#fff3c4" },
  blue: { top: "#8fd8ff", bot: "#41a6ff", edge: "#1b6ec2", text: "#083a66", soft: "#dff3ff" },
  pink: { top: "#ffb3d4", bot: "#ff6fab", edge: "#c23c74", text: "#5e1335", soft: "#ffe1ee" },
  mint: { top: "#b9f5a8", bot: "#5fd65a", edge: "#2f9b35", text: "#123d14", soft: "#e2ffd9" },
  orange: { top: "#ffc182", bot: "#ff8f3c", edge: "#c25a12", text: "#5a2703", soft: "#ffe6cd" },
  white: { top: "#ffffff", bot: "#eef3fb", edge: "#b9c6db", text: "#2b3a56", soft: "#ffffff" },
};

export function uiBtn(e?: React.MouseEvent) {
  initAudio();
  sfx.ui("tap");
  try {
    navigator.vibrate?.(8); // tiny haptic on phones
  } catch {
    /* ignore */
  }
  if (e) {
    const el = e.currentTarget as HTMLElement;
    el.animate?.([{ transform: "scale(1)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: 160, easing: "ease-out" });
  }
}

interface JProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: React.ReactNode;
  block?: boolean;
  shine?: boolean;
  glow?: boolean;
}
const SIZES = {
  sm: "h-9 px-3 text-[12px] rounded-xl",
  md: "h-11 px-4 text-sm rounded-2xl",
  lg: "h-14 px-6 text-lg rounded-2xl",
  xl: "h-[72px] px-8 text-2xl rounded-3xl",
};

/** chunky cartoon button: stacked 3D edge, glossy top, squishes when pressed */
export function JuicyButton({ tone = "yellow", size = "md", icon, block, shine, glow, children, className = "", onClick, ...rest }: JProps) {
  const t = TONES[tone];
  return (
    <button
      {...rest}
      onClick={(e) => {
        uiBtn(e);
        onClick?.(e);
      }}
      className={`juicy relative inline-flex items-center justify-center gap-2 overflow-hidden font-black tracking-wide ${SIZES[size]} ${block ? "w-full" : ""} ${glow ? "idle-bounce" : ""} ${className}`}
      style={{
        background: `linear-gradient(180deg, ${t.top} 0%, ${t.bot} 100%)`,
        color: t.text,
        ["--edge" as string]: t.edge,
        borderColor: "rgba(255,255,255,.55)",
      }}
    >
      {icon && <span className="grid place-items-center leading-none [&_svg]:h-[1.15em] [&_svg]:w-[1.15em]">{icon}</span>}
      <span className="relative z-10 whitespace-nowrap drop-shadow-[0_1px_0_rgba(255,255,255,.45)]">{children}</span>
      {shine && <span className="juicy-shine" />}
    </button>
  );
}

/** big rectangular menu tab (left rail): icon bubble + label + optional badge */
export function RailTab({
  icon,
  label,
  tone = "blue",
  badge,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  tone?: Tone;
  badge?: number | string;
  onClick?: () => void;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <button
      onClick={(e) => {
        uiBtn(e);
        onClick?.();
      }}
      className={`press relative flex w-[82px] flex-col items-center gap-0.5 rounded-2xl border-2 border-white/80 px-1 pb-1.5 pt-1.5 font-black shadow-[0_4px_0_rgba(0,0,0,.12),0_8px_16px_rgba(30,60,110,.14)] active:shadow-[0_1px_0_rgba(0,0,0,.12)] ${className}`}
      style={{ background: t.soft, color: "#233a5c" }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl shadow-[inset_0_-3px_0_rgba(0,0,0,.12)] [&_svg]:h-6 [&_svg]:w-6" style={{ background: `linear-gradient(180deg,${t.top},${t.bot})` }}>
        {icon}
      </span>
      <span className="text-[10px] leading-tight">{label}</span>
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-[#ff3d6e] px-1 text-[10px] text-white shadow">
          {badge}
        </span>
      )}
    </button>
  );
}

/** small round icon button (right rail) */
export function RoundBtn({ icon, label, onClick, tone = "white", active }: { icon: React.ReactNode; label?: string; onClick?: () => void; tone?: Tone; active?: boolean }) {
  const t = TONES[tone];
  return (
    <button
      onClick={(e) => {
        uiBtn(e);
        onClick?.();
      }}
      title={label}
      className={`press grid h-11 w-11 place-items-center rounded-2xl shadow-[0_4px_0_rgba(0,0,0,.14)] [&_svg]:h-6 [&_svg]:w-6 ${active ? "ring-4 ring-yellow-300" : ""}`}
      style={{ background: `linear-gradient(180deg,${t.top},${t.bot})`, color: t.text }}
    >
      {icon}
    </button>
  );
}

export function StatPill({ icon, value, tone = "blue" }: { icon: React.ReactNode; value: React.ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-full border-2 border-white/80 bg-white/85 pl-1 pr-3 shadow-[0_2px_0_rgba(0,0,0,.12)] backdrop-blur">
      <span className="grid h-6 w-6 place-items-center rounded-full [&_svg]:h-[15px] [&_svg]:w-[15px]" style={{ background: t.soft }}>
        {icon}
      </span>
      <span className="text-[12px] font-black tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

export function Toggle({ on, onClick, tone = "mint" }: { on: boolean; onClick: () => void; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <button
      onClick={(e) => {
        uiBtn(e);
        onClick();
      }}
      className="relative h-7 w-12 rounded-full border-2 border-white shadow-inner transition-colors"
      style={{ background: on ? `linear-gradient(180deg,${t.top},${t.bot})` : "#c9d3e2" }}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-0.5"}`} />
    </button>
  );
}

export function Sheet({
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 backdrop-blur-[3px] md:items-center md:p-6" onClick={onClose}>
      <div
        className="sheet flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border-4 border-white/80 bg-[#fff8ee] shadow-[0_-10px_40px_rgba(20,40,80,.3)] md:max-w-2xl md:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-4 border-[#ffe4bd] bg-gradient-to-b from-[#fffdf7] to-[#fff2da] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-b from-[#ffe45c] to-[#ffc400] shadow-[inset_0_-3px_0_rgba(0,0,0,.15)] [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
          <div className="flex-1 text-lg font-black text-[#3a2b12]">{title}</div>
          <button
            onClick={(e) => {
              uiBtn(e);
              onClose();
            }}
            className="press grid h-9 w-9 place-items-center rounded-xl bg-[#ff6f8f] text-lg font-black text-white shadow-[0_4px_0_#c23c5e]"
          >
            ✕
          </button>
        </div>
        <div className="nice-scroll flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t-4 border-[#ffe4bd] bg-[#fff2da] p-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Sparkles({ className = "" }: { className?: string }) {
  const stars = [
    { x: "8%", y: "18%", d: "0s", s: 16 },
    { x: "22%", y: "62%", d: ".8s", s: 10 },
    { x: "78%", y: "22%", d: ".4s", s: 14 },
    { x: "88%", y: "58%", d: "1.2s", s: 9 },
    { x: "64%", y: "10%", d: "1.7s", s: 12 },
  ];
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {stars.map((s, i) => (
        <span key={i} className="sparkle absolute select-none text-white" style={{ left: s.x, top: s.y, fontSize: s.s, animationDelay: s.d }}>
          ✦
        </span>
      ))}
    </div>
  );
}
