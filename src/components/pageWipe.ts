/**
 * Page transition orchestration, kept out of React so it can be exercised
 * directly: the outgoing page slides away, two skewed panels sweep in from the
 * right, a badge holds while the screens swap, then everything keeps sliding
 * out to the left and the incoming page settles.
 */

export const EASE_IO = "cubic-bezier(.77,0,.175,1)";
export const EASE_OUT = "cubic-bezier(.16,1,.3,1)";

/** Sweep timings, in ms — same beats as the reference page transition. */
export const WIPE_TIMING = {
  /** panels sweep in from the right while the old page slides away */
  cover: 620,
  /** badge holds while the screens swap */
  hold: 520,
  /** panels keep sliding out to the left and the new page settles in */
  reveal: 700,
  /** the accent panel trails the main one */
  lag: 70,
} as const;

export type WipeTiming = { cover: number; hold: number; reveal: number; lag: number };

export interface WipeElements {
  root: HTMLElement;
  edge: HTMLElement | null;
  main: HTMLElement | null;
  logo: HTMLElement | null;
  sub: HTMLElement | null;
  label: HTMLElement | null;
  bar: HTMLElement | null;
  /** the page currently on screen (gets the slide-away) */
  outgoing: HTMLElement | null;
}

/** `calm` swaps the big sweep for a short cross-fade (reduced-motion preference). */
export type WipeMode = "sweep" | "calm";

export interface WipeOptions {
  mode?: WipeMode;
  timing?: WipeTiming;
  /** look up the page after the swap (defaults to document.querySelector) */
  getScreen?: () => HTMLElement | null;
  wait?: (ms: number) => Promise<void>;
  isAlive?: () => boolean;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

const PANEL_IN: Keyframe[] = [
  { transform: "translate3d(140vw,0,0) skewX(-18deg)" },
  { transform: "translate3d(-60vw,0,0) skewX(-18deg)" },
];
const PANEL_OUT: Keyframe[] = [
  { transform: "translate3d(-60vw,0,0) skewX(-18deg)" },
  { transform: "translate3d(-270vw,0,0) skewX(-18deg)" },
];

/** Play the whole sweep. Resolves once the new page is fully revealed. */
export async function runPageWipe(
  els: WipeElements,
  theme: { main: string; deep: string; ink: string; label: string; sub: string },
  onCover: () => void,
  options: WipeOptions = {},
): Promise<void> {
  const mode = options.mode ?? "sweep";
  const t = options.timing ?? WIPE_TIMING;
  const pause = options.wait ?? delay;
  const alive = options.isAlive ?? (() => true);
  const getScreen = options.getScreen ?? (() => document.querySelector<HTMLElement>("[data-screen]"));
  const { root, edge, main, logo, sub, label, bar } = els;
  const opts = (duration: number, at = 0, easing: string = EASE_IO): KeyframeAnimationOptions => ({
    duration,
    delay: at,
    easing,
    fill: "forwards",
  });
  const everyone = [edge, main, logo, sub, label, bar];

  root.style.setProperty("--wipe-main", theme.main);
  root.style.setProperty("--wipe-deep", theme.deep);
  root.style.setProperty("--wipe-ink", theme.ink);
  if (sub) sub.textContent = theme.sub;
  if (label) label.textContent = theme.label;

  if (mode === "calm") {
    // Reduced motion: a short, gentle cross-fade with no big movement.
    try {
      root.classList.add("is-active");
      root.classList.add("is-calm");
      edge?.animate?.([{ opacity: 0 }, { opacity: 1 }], opts(180));
      main?.animate?.([{ opacity: 0 }, { opacity: 1 }], opts(180, 40));
      await pause(240);
      if (!alive()) return;
      onCover();
      await pause(120);
      if (!alive()) return;
      edge?.animate?.([{ opacity: 1 }, { opacity: 0 }], opts(180));
      main?.animate?.([{ opacity: 1 }, { opacity: 0 }], opts(180, 40));
      await pause(260);
    } finally {
      for (const el of everyone) el?.getAnimations?.().forEach((a) => a.cancel());
      root.classList.remove("is-active", "is-calm");
      root.style.removeProperty("--wipe-main");
      root.style.removeProperty("--wipe-deep");
      root.style.removeProperty("--wipe-ink");
    }
    return;
  }

  try {
    // ---- COVER: old page slides left and dims, panels sweep in from the right
    root.classList.add("is-active");
    els.outgoing?.animate?.(
      [
        { transform: "none", filter: "brightness(1)", opacity: 1 },
        { transform: "translate3d(-6vw,0,0) scale(.965)", filter: "brightness(.82)", opacity: 1 },
      ],
      opts(t.cover + t.lag),
    );
    edge?.animate?.(PANEL_IN, opts(t.cover));
    main?.animate?.(PANEL_IN, opts(t.cover, t.lag));
    await pause(t.cover + t.lag);
    if (!alive()) return;

    // ---- HOLD: swap screens behind the panels, then pop the badge in
    onCover();
    logo?.animate?.(
      [
        { transform: "scale(.4) rotate(-10deg)", opacity: 0 },
        { transform: "scale(1.08) rotate(3deg)", opacity: 1, offset: 0.6 },
        { transform: "none", opacity: 1 },
      ],
      opts(440, 0, EASE_OUT),
    );
    sub?.animate?.([{ transform: "translateY(110%)", opacity: 0 }, { transform: "none", opacity: 1 }], opts(380, 80, EASE_OUT));
    label?.animate?.([{ transform: "translateY(110%)" }, { transform: "none" }], opts(460, 120, EASE_OUT));
    bar?.animate?.([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], opts(t.hold + 40, 100, "cubic-bezier(.4,0,.2,1)"));
    await pause(t.hold);
    if (!alive()) return;

    // ---- REVEAL: badge leaves, panels continue off-screen, new page settles
    [logo, sub, label].forEach((el, i) =>
      el?.animate?.(
        [{ transform: "none", opacity: 1 }, { transform: "translate3d(-60px,0,0)", opacity: 0 }],
        opts(260, i * 30, "cubic-bezier(.5,0,.75,0)"),
      ),
    );
    main?.animate?.(PANEL_OUT, opts(t.reveal, 90));
    edge?.animate?.(PANEL_OUT, opts(t.reveal, 90 + t.lag));
    getScreen()?.animate?.(
      [
        { transform: "translate3d(6vw,0,0) scale(1.03)", filter: "brightness(1.06)" },
        { transform: "none", filter: "brightness(1)" },
      ],
      opts(t.reveal + 200, 120, EASE_OUT),
    );
    await pause(t.reveal + t.lag + 120);
  } finally {
    // Always leave the overlay clean, even if a frame animation failed.
    for (const el of everyone) el?.getAnimations?.().forEach((a) => a.cancel());
    root.classList.remove("is-active");
    root.style.removeProperty("--wipe-main");
    root.style.removeProperty("--wipe-deep");
    root.style.removeProperty("--wipe-ink");
  }
}
