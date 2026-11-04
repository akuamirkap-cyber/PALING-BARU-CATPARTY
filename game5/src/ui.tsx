import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { isMuted, onMute, setMuted, sfx } from "./audio";

export function MuteButton({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMute(setM), []);
  return (
    <button
      onMouseEnter={() => sfx.hover()}
      onClick={() => { setMuted(!m); if (m) setTimeout(() => sfx.click(), 30); }}
      title={m ? "Unmute" : "Mute"}
      className={`group w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-90 ${dark ? "bg-black/30 text-white hover:bg-black/45 backdrop-blur-md ring-1 ring-white/10" : "bg-[#fff8ec] text-[#3b2a1a] shadow-[0_4px_0_rgba(150,80,0,.25),0_8px_20px_rgba(150,80,0,.2)]"} ${className}`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        {m ? (
          <path d="M17 9l5 6M22 9l-5 6" />
        ) : (
          <>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" className="origin-left group-hover:animate-[wiggle_.5s_ease]" />
            <path d="M19 6a8.5 8.5 0 0 1 0 12" />
          </>
        )}
      </svg>
    </button>
  );
}

type JProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; sound?: keyof typeof sfx; silentHover?: boolean };
export function JButton({ children, sound = "click", silentHover, onClick, onMouseEnter, className = "", ...rest }: JProps) {
  return (
    <button
      {...rest}
      onMouseEnter={(e) => { if (!silentHover) sfx.hover(); onMouseEnter?.(e); }}
      onClick={(e) => { (sfx[sound] as () => void)(); onClick?.(e); }}
      className={`transition-[transform,background,box-shadow,color,opacity] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)] active:scale-[.92] ${className}`}
    >
      {children}
    </button>
  );
}

export function KeyHint({ k, label, dark = true }: { k: string; label: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${dark ? "text-white/85" : "text-[#3b2a1a]/70"}`}>
      <kbd className={`min-w-7 h-7 px-1.5 rounded-lg text-xs flex items-center justify-center font-sans font-bold ${dark ? "bg-white/15 ring-1 ring-white/25" : "bg-[#3b2a1a]/10"}`}>{k}</kbd>
      {label}
    </span>
  );
}
