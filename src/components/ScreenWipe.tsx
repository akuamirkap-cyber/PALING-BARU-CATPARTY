import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { runPageWipe, WIPE_TIMING } from "./pageWipe";
import type { WipeTiming } from "./pageWipe";

/** Screens that can be swapped behind the wipe. */
export type ScreenKey = "menu" | "matching" | "game" | "games-view";

export interface WipeTheme {
  /** Wipe panel colour */
  main: string;
  /** Trailing edge panel + page background */
  deep: string;
  /** Ink used for the badge shadow */
  ink: string;
  label: string;
  sub: string;
}

export const WIPE_THEMES: Record<ScreenKey, WipeTheme> = {
  menu: { main: "#ffa412", deep: "#e57f00", ink: "#7a3d00", label: "MAIN MENU", sub: "Kembali ke markas" },
  matching: { main: "#ffa412", deep: "#e57f00", ink: "#7a3d00", label: "MATCHMAKING", sub: "Mencari lawan" },
  game: { main: "#1b8cf0", deep: "#0f63c4", ink: "#05325e", label: "SIAP GEBUK", sub: "Semua naik ke pesawat" },
  "games-view": { main: "#22b1e8", deep: "#0f93c9", ink: "#04304a", label: "GAME LAIN", sub: "Dari repo yang sama" },
};

export { WIPE_TIMING };
export type { WipeTiming };

export interface WipeHandle {
  /** Play the page sweep, swapping screens while the panels cover the viewport. */
  play: (target: ScreenKey, onCover: () => void) => Promise<void>;
}

function CatMark() {
  return (
    <svg viewBox="0 0 120 110" aria-hidden="true">
      <path d="M22 50 L28 10 Q30 4 35 8 L55 28Z" fill="#fff" />
      <path d="M98 50 L92 10 Q90 4 85 8 L65 28Z" fill="#fff" />
      <path d="M30 40 L33 18 L48 32Z" fill="#ffb4c0" />
      <path d="M90 40 L87 18 L72 32Z" fill="#ffb4c0" />
      <ellipse cx="60" cy="64" rx="46" ry="42" fill="#fff" />
      {[40, 80].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={62} r="11" fill="var(--wipe-ink, #7a3d00)" />
          <circle cx={cx + 3} cy={58} r="3.5" fill="#fff" />
          <path
            d={cx < 60 ? `M${cx - 12} 46 L${cx + 10} 51` : `M${cx + 12} 46 L${cx - 10} 51`}
            stroke="var(--wipe-ink, #7a3d00)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      ))}
      <ellipse cx="60" cy="76" rx="4" ry="3" fill="#ff8fa0" />
      <path d="M52 82 Q56 87 60 82 Q64 87 68 82" stroke="var(--wipe-ink, #7a3d00)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Full-screen page transition. The overlay markup lives here; the sweep itself
 * is orchestrated by `runPageWipe` so it stays testable.
 */
/** `full` plays the big sweep, `calm` swaps it for a short cross-fade. */
export type WipeMode = "full" | "calm";

export default function ScreenWipe({ handleRef, mode = "full" }: { handleRef: Ref<WipeHandle>; mode?: WipeMode }) {
  const modeRef = useRef<WipeMode>(mode);
  modeRef.current = mode;
  const root = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const play = useCallback(async (target: ScreenKey, onCover: () => void) => {
    const rootEl = root.current;
    if (!rootEl || busy.current) return;
    busy.current = true;
    try {
      // The page sweep is part of the game's look, so it plays by default; the
      // settings toggle (or a reduced-motion device) can switch to the calm fade.
      const calm = modeRef.current === "calm";
      // `?wipe=slow` plays the sweep at 2.5x so it can be inspected frame by frame.
      const slow = typeof location !== "undefined" && new URLSearchParams(location.search).get("wipe") === "slow";
      const timing = slow
        ? { cover: WIPE_TIMING.cover * 2.5, hold: WIPE_TIMING.hold * 2.5, reveal: WIPE_TIMING.reveal * 2.5, lag: WIPE_TIMING.lag * 2.5 }
        : WIPE_TIMING;
      await runPageWipe(
        {
          root: rootEl,
          edge: edge.current,
          main: main.current,
          logo: logo.current,
          sub: sub.current,
          label: label.current,
          bar: bar.current,
          outgoing: document.querySelector<HTMLElement>("[data-screen]"),
        },
        WIPE_THEMES[target],
        onCover,
        { isAlive: () => alive.current, mode: calm ? "calm" : "sweep", timing },
      );
    } catch {
      // Navigation must never be blocked by a failed transition.
    } finally {
      busy.current = false;
    }
  }, []);

  useImperativeHandle(handleRef, () => ({ play }), [play]);

  return (
    <div ref={root} className="wipe" aria-hidden="true">
      <div ref={edge} className="wipe-panel wipe-panel-edge" />
      <div ref={main} className="wipe-panel wipe-panel-main" />
      <div className="wipe-badge">
        <div ref={logo} className="wipe-logo">
          <CatMark />
        </div>
        <div className="wipe-clip">
          <div ref={sub} className="wipe-sub">
            Mencari lawan
          </div>
        </div>
        <div className="wipe-clip wipe-clip-label">
          <div ref={label} className="wipe-label">
            MATCHMAKING
          </div>
        </div>
        <div className="wipe-bar">
          <i ref={bar} />
        </div>
      </div>
    </div>
  );
}
