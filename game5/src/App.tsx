import { useCallback, useEffect, useRef, useState } from "react";
import { MainMenu } from "./MainMenu";
import { Lobby } from "./Lobby";
import { Game, type Loadout } from "./Game";
import { ErrorBoundary } from "./ErrorBoundary";
import { playMusic, sfx } from "./audio";

type Screen = "menu" | "lobby" | "game";
type Theme = { main: string; edge: string; deep: string; ink: string; label: string; sub: string };
const THEMES: Record<Screen, Theme> = {
  menu: { main: "#ffa412", edge: "#ffe08a", deep: "#e57f00", ink: "#7a3d00", label: "MAIN MENU", sub: "Heading home" },
  lobby: { main: "#ffa412", edge: "#ffe08a", deep: "#e57f00", ink: "#7a3d00", label: "LOCKER ROOM", sub: "Finding players" },
  game: { main: "#1b8cf0", edge: "#9be0ff", deep: "#0f63c4", ink: "#05325e", label: "THE BOAT", sub: "All aboard" },
};

const EASE_IO = "cubic-bezier(.77,0,.175,1)";
const EASE_OUT = "cubic-bezier(.16,1,.3,1)";
const COVER = 680, HOLD = 520, REVEAL = 760, LAG = 70;
const DEFAULT: Loadout = { color: "#f5c542", metal: true, hat: "crown", glasses: null, duck: false, gloves: false, hammer: false };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function CatLogo({ ink }: { ink: string }) {
  return (
    <svg viewBox="0 0 120 110" className="w-full h-full">
      <path d="M22 50 L28 10 Q30 4 35 8 L55 28Z" fill="#fff" />
      <path d="M98 50 L92 10 Q90 4 85 8 L65 28Z" fill="#fff" />
      <path d="M30 40 L33 18 L48 32Z" fill="#ffb4c0" />
      <path d="M90 40 L87 18 L72 32Z" fill="#ffb4c0" />
      <ellipse cx="60" cy="64" rx="46" ry="42" fill="#fff" />
      {[40, 80].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="62" r="11" fill={ink} />
          <circle cx={cx + 3} cy="58" r="3.5" fill="#fff" />
          <path d={cx < 60 ? `M${cx - 12} 46 L${cx + 10} 51` : `M${cx + 12} 46 L${cx - 10} 51`} stroke={ink} strokeWidth="5" strokeLinecap="round" />
        </g>
      ))}
      <ellipse cx="60" cy="76" rx="4" ry="3" fill="#ff8fa0" />
      <path d="M52 82 Q56 87 60 82 Q64 87 68 82" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [to, setTo] = useState<Screen>("lobby");
  const [active, setActive] = useState(false);
  const [loadout, setLoadout] = useState<Loadout>(DEFAULT);
  const busy = useRef(false);

  const stage = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => { playMusic("menu"); }, []);

  const go = useCallback(async (dest: Screen) => {
    if (busy.current) return;
    busy.current = true;
    setTo(dest);
    setActive(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const E = edge.current!, M = main.current!, S = stage.current!;
    const opts = (d: number, delay = 0, easing = EASE_IO): KeyframeAnimationOptions => ({ duration: d, delay, easing, fill: "forwards" });

    // ---- COVER: panels sweep in from the right
    sfx.whoosh();
    E.animate([{ transform: "translate3d(140vw,0,0) skewX(-18deg)" }, { transform: "translate3d(-60vw,0,0) skewX(-18deg)" }], opts(COVER));
    M.animate([{ transform: "translate3d(140vw,0,0) skewX(-18deg)" }, { transform: "translate3d(-60vw,0,0) skewX(-18deg)" }], opts(COVER, LAG));
    S.animate([{ transform: "none", filter: "brightness(1)" }, { transform: "translate3d(-5vw,0,0) scale(.97)", filter: "brightness(.8)" }], opts(COVER + LAG));
    await wait(COVER + LAG);

    // ---- HOLD: swap screen, show badge
    setScreen(dest);
    playMusic(dest);
    S.getAnimations().forEach((a) => a.cancel());
    S.style.transform = "translate3d(6vw,0,0) scale(1.03)";
    logo.current!.animate([{ transform: "scale(.4) rotate(-10deg)", opacity: 0 }, { transform: "scale(1.08) rotate(3deg)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], opts(480, 0, EASE_OUT));
    sub.current!.animate([{ transform: "translateY(110%)", opacity: 0 }, { transform: "none", opacity: 1 }], opts(420, 80, EASE_OUT));
    text.current!.animate([{ transform: "translateY(110%)" }, { transform: "none" }], opts(480, 120, EASE_OUT));
    bar.current!.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], opts(HOLD + 60, 100, "cubic-bezier(.4,0,.2,1)"));
    sfx.pop();
    await wait(HOLD + 120);

    // ---- REVEAL: content exits left, panels continue off-screen left
    sfx.whooshOut();
    [logo, sub, text].forEach((r, i) => r.current!.animate([{ transform: "none", opacity: 1 }, { transform: "translate3d(-60px,0,0)", opacity: 0 }], opts(260, i * 30, "cubic-bezier(.5,0,.75,0)")));
    M.animate([{ transform: "translate3d(-60vw,0,0) skewX(-18deg)" }, { transform: "translate3d(-270vw,0,0) skewX(-18deg)" }], opts(REVEAL, 120));
    E.animate([{ transform: "translate3d(-60vw,0,0) skewX(-18deg)" }, { transform: "translate3d(-270vw,0,0) skewX(-18deg)" }], opts(REVEAL, 120 + LAG));
    S.animate([{ transform: "translate3d(6vw,0,0) scale(1.03)" }, { transform: "none" }], opts(REVEAL + 200, 160, EASE_OUT));
    await wait(REVEAL + LAG + 200);
    S.style.transform = "";
    S.getAnimations().forEach((a) => a.cancel());

    setActive(false);
    busy.current = false;
  }, []);

  const th = THEMES[to];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: th.deep }}>
      <div ref={stage} className="w-full h-full origin-center will-change-transform">
        <ErrorBoundary key={screen} onReset={() => setScreen("menu")}>
          {screen === "menu" && <MainMenu onPlay={() => go("lobby")} />}
          {screen === "lobby" && <Lobby onBack={() => go("menu")} onStart={(l) => { setLoadout(l); go("game"); }} />}
          {screen === "game" && <Game loadout={loadout} onExit={() => go("menu")} />}
        </ErrorBoundary>
      </div>

      <div className={`absolute inset-0 z-50 overflow-hidden ${active ? "pointer-events-auto" : "pointer-events-none invisible"}`} style={{ fontFamily: "'Lilita One', sans-serif" }}>
        {/* accent edge panel (leads in, trails out) */}
        <div ref={edge} className="absolute top-[-15vh] left-0 h-[130vh] w-[220vw] will-change-transform"
          style={{ transform: "translate3d(140vw,0,0) skewX(-18deg)", background: th.deep }} />
        {/* main panel */}
        <div ref={main} className="absolute top-[-15vh] left-0 h-[130vh] w-[220vw] will-change-transform"
          style={{ transform: "translate3d(140vw,0,0) skewX(-18deg)", background: th.main }}>
        </div>

        {/* badge */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center">
            <div ref={logo} className="w-24 h-24 mb-5 opacity-0 drop-shadow-[0_10px_16px_rgba(0,0,0,.18)]"><CatLogo ink={th.ink} /></div>
            <div className="overflow-hidden"><div ref={sub} className="opacity-0 text-white/75 text-[11px] font-sans font-extrabold tracking-[.32em] uppercase">{th.sub}</div></div>
            <div className="overflow-hidden pb-1"><div ref={text} className="text-white text-[clamp(36px,5vw,60px)] leading-[1.05] tracking-wide translate-y-[110%]" style={{ textShadow: `0 4px 0 ${th.ink}30` }}>{th.label}</div></div>
            <div className="mt-4 w-36 h-[5px] rounded-full bg-white/25 overflow-hidden">
              <div ref={bar} className="h-full w-full rounded-full bg-white origin-left scale-x-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
