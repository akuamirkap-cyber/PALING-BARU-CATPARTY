import { useCallback, useEffect, useMemo, useState } from "react";
import LineupPreview from "./components/LineupPreview";
import GameView from "./components/GameView";
import Portrait from "./components/Portrait";
import TuningPanel from "./components/TuningPanel";
import { JuicyButton, RailTab, RoundBtn, Sheet, Sparkles, StatPill, Toggle, TONES, uiBtn } from "./components/ui";
import { ACCESSORIES, ANIMALS, animalById, type AccessoryId, type AnimalId } from "./game/animals";
import { initAudio } from "./game/audio";
import { renderPortrait } from "./game/portraits";
import type { Quality } from "./game/Game";
import { tuningKey, useTuning } from "./game/tuning";

type Screen = "select" | "game";
type SheetId = "char" | "acc" | "tuning" | "settings" | "info" | "mission" | null;

export default function App() {
  const [screen, setScreen] = useState<Screen>("select");
  const [p1, setP1] = useState<AnimalId>("oyen");
  const [p2, setP2] = useState<AnimalId>("item");
  const [acc1, setAcc1] = useState<AccessoryId>("capRed");
  const [acc2, setAcc2] = useState<AccessoryId>("capBlue");
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [bots, setBots] = useState(5);
  const [mode, setMode] = useState<"brawl" | "bomb">("bomb");
  const [quality, setQuality] = useState<Quality>(() => (localStorage.getItem("meow.quality") as Quality) || "auto");
  const isTouchDevice = useMemo(() => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0), []);
  const [showTouch, setShowTouch] = useState(isTouchDevice);
  const [gameKey, setGameKey] = useState(0);
  const [sheet, setSheet] = useState<SheetId>(null);

  const start = useCallback(() => {
    initAudio();
    setSheet(null);
    setGameKey((k) => k + 1);
    setScreen("game");
  }, []);
  const exit = useCallback(() => setScreen("select"), []);

  const tKey = tuningKey(useTuning());
  useEffect(() => {
    let i = 0;
    let timer = 0;
    const next = () => {
      if (i >= ANIMALS.length) return;
      renderPortrait(ANIMALS[i++]);
      timer = window.setTimeout(next, 150);
    };
    timer = window.setTimeout(next, 1200);
    return () => clearTimeout(timer);
  }, [tKey]);

  useEffect(() => {
    if (screen !== "select") return;
    const onKey = (e: KeyboardEvent) => {
      const idx = ANIMALS.findIndex((a) => a.id === p1);
      if (e.code === "ArrowRight" || e.code === "KeyD") setP1(ANIMALS[(idx + 1) % ANIMALS.length].id);
      if (e.code === "ArrowLeft" || e.code === "KeyA") setP1(ANIMALS[(idx - 1 + ANIMALS.length) % ANIMALS.length].id);
      if (e.code === "Escape") setSheet(null);
      if (e.code === "Enter" || e.code === "Space") {
        if (sheet) setSheet(null);
        else start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, p1, start, sheet]);

  if (screen === "game") {
    return (
      <GameView
        key={gameKey}
        options={{ p1Animal: p1, p2Animal: p2, twoPlayer, bots, p1Acc: acc1, p2Acc: acc2, bombMode: mode === "bomb", quality }}
        showTouch={showTouch && !twoPlayer}
        onExit={exit}
      />
    );
  }

  const sel = animalById(p1);
  const fighters = bots + (twoPlayer ? 2 : 1);

  return (
    <div className="fixed inset-0 select-none overflow-hidden font-sans" style={{ background: "linear-gradient(180deg,#63c8ff 0%,#9cc2ff 34%,#cdb4ff 56%,#ffc9de 74%,#ffe3b8 92%)" }}>
      {/* ---------- sky decorations ---------- */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72">
        <div className="sun-rays absolute inset-0 rounded-full" />
        <div className="absolute inset-[52px] rounded-full bg-gradient-to-b from-[#fff7c4] to-[#ffd93c] shadow-[0_0_50px_rgba(255,220,80,.9)]" />
      </div>
      <div className="pointer-events-none absolute -right-24 top-[8%] h-72 w-72 rounded-full bg-pink-200/50 blur-3xl" />
      <div className="pointer-events-none absolute left-[30%] top-[30%] h-40 w-40 rounded-full bg-white/25 blur-2xl" />
      {/* rainbow arch behind the lockers */}
      <div className="pointer-events-none absolute left-1/2 top-[2%] h-[420px] w-[720px] max-w-[130vw] -translate-x-1/2 opacity-50">
        <div className="absolute inset-0 rounded-t-full border-[22px] border-[#ff9eb5]/70" />
        <div className="absolute inset-[22px] rounded-t-full border-[22px] border-[#ffd93c]/70" />
        <div className="absolute inset-[44px] rounded-t-full border-[22px] border-[#8fe3a8]/70" />
        <div className="absolute inset-[66px] rounded-t-full border-[22px] border-[#8fd8ff]/70" />
      </div>
      {/* drifting clouds (real cloud shapes, kept behind the HUD) */}
      <div className="cloud-shape cloud-drift pointer-events-none absolute left-[7%] top-[10%] h-6 w-16 opacity-90" />
      <div className="cloud-shape cloud-drift-slow pointer-events-none absolute right-[10%] top-[9%] hidden h-7 w-24 opacity-90 sm:block" />
      <div className="cloud-shape cloud-drift pointer-events-none absolute left-[40%] top-[12%] h-5 w-14 opacity-70" style={{ animationDelay: "-4s" }} />
      <div className="cloud-shape cloud-drift-slow pointer-events-none absolute right-[32%] top-[17%] hidden h-5 w-16 opacity-60 sm:block" style={{ animationDelay: "-7s" }} />
      {/* bunting flags */}
      <div className="bunting pointer-events-none absolute inset-x-0 top-[86px] z-10 hidden justify-center gap-1.5 sm:flex md:top-[92px]">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="h-0 w-0 border-x-[9px] border-t-[14px] border-x-transparent drop-shadow-sm"
            style={{ borderTopColor: ["#ff6f8f", "#ffd23f", "#5fd65a", "#41a6ff", "#b36bff"][i % 5], animationDelay: `${(i % 6) * 0.18}s` }}
          />
        ))}
      </div>
      <Sparkles className="opacity-80" />

      {/* pastel lockers with depth + stickers */}
      <div className="pointer-events-none absolute inset-x-0 top-[15%] flex h-[44%] justify-center gap-1.5 px-3 sm:gap-2.5 md:top-[13%]">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="relative h-full w-[6.4%] min-w-[36px] max-w-[92px] rounded-3xl border-[3px] border-white/85 shadow-[0_10px_18px_rgba(70,90,150,.18),inset_0_-16px_22px_rgba(0,0,0,.06),inset_0_4px_0_rgba(255,255,255,.7)]"
            style={{
              background: `linear-gradient(180deg,${["#e3f5ff", "#ffe7f2", "#e2fbee", "#fff6cf", "#ece8ff"][i % 5]} 0%,${["#c4e7ff", "#ffc9de", "#bff0d2", "#ffe3a1", "#d3ccff"][i % 5]} 100%)`,
              transform: `rotate(${(i % 2 ? 1 : -1) * 0.7}deg)`,
            }}
          >
            <div className="mx-auto mt-3 h-1.5 w-1/2 rounded-full bg-white/90 shadow-sm" />
            <div className="mx-auto mt-1.5 h-1.5 w-1/2 rounded-full bg-white/80" />
            <div className="mx-auto mt-1.5 h-1.5 w-1/2 rounded-full bg-white/80" />
            <div className="absolute inset-x-3 top-1/2 h-px bg-white/70" />
            <div className="absolute bottom-4 left-1/2 h-6 w-2 -translate-x-1/2 rounded-full border-2 border-white bg-white/60 shadow" />
            {(i === 2 || i === 5 || i === 8) && <span className="absolute left-1/2 top-[30%] -translate-x-1/2 drop-shadow"><StarIcon size={13} /></span>}
            {i === 6 && <span className="absolute left-1/2 top-[30%] -translate-x-1/2 drop-shadow"><HeartIcon size={13} /></span>}
          </div>
        ))}
      </div>
      {/* hills between wall and floor */}
      <div className="pointer-events-none absolute inset-x-[-10%] bottom-[23%] h-24 md:bottom-[30%]">
        <div className="absolute bottom-0 left-[4%] h-16 w-[34%] rounded-[50%] bg-[#a8ecb6]" />
        <div className="absolute bottom-0 right-[5%] h-20 w-[38%] rounded-[50%] bg-[#8fe0c0]" />
        <div className="absolute bottom-2 left-[30%] h-12 w-[40%] rounded-[50%] bg-[#c8f5d2]" />
      </div>
      {/* floor with texture + spotlight */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[25%] md:h-[32%]" style={{ background: "linear-gradient(180deg,#ffedc9 0%,#ffdca8 45%,#ffbf8b 100%)" }}>
        <div className="floor-dots absolute inset-0 opacity-60" />
        <div className="absolute inset-x-0 top-0 h-2.5 bg-white/60" />
        <div className="absolute inset-x-0 top-2.5 h-1 bg-[#f0a35e]/40" />
        <div className="spot-glow absolute bottom-[44%] left-1/2 h-16 w-[340px] max-w-[70vw] rounded-[50%] bg-[#ffe27a]/75 blur-xl" />
        <div className="absolute bottom-[38%] left-[8%] rotate-[15deg] opacity-70"><PawIcon size={20} /></div>
        <div className="absolute bottom-[26%] left-[14%] -rotate-[15deg] opacity-45"><PawIcon size={17} /></div>
        <div className="absolute bottom-[38%] right-[8%] -rotate-[15deg] opacity-70"><PawIcon size={20} /></div>
        <div className="absolute bottom-[26%] right-[14%] rotate-[15deg] opacity-45"><PawIcon size={17} /></div>
        {/* props on the floor */}
        <div className="floaty absolute bottom-[24%] left-[6%] h-9 w-9 rounded-full shadow-md" style={{ background: "radial-gradient(circle at 32% 30%,#fff 0 12%,#ff5a5a 13% 40%,#fff 41% 55%,#ffd23f 56% 100%)", animationDelay: "-1s" }} />
        <div className="floaty absolute bottom-[20%] right-[6%] h-8 w-8 rotate-12" style={{ animationDelay: "-2s" }}>
          <span className="absolute left-1/2 top-1/2 h-2.5 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff6e0] shadow" />
          <span className="absolute left-[38%] top-[20%] h-3 w-1.5 rounded-full bg-[#fff6e0] shadow" />
          <span className="absolute right-[38%] top-[20%] h-3 w-1.5 rounded-full bg-[#fff6e0] shadow" />
        </div>
      </div>

      {/* balloons on the empty sides */}
      <div className="pointer-events-none absolute left-[2%] top-[34%] hidden flex-col items-center gap-3 sm:flex">
        {[
          { c: "#ff6f8f", d: "0s", s: 52 },
          { c: "#41a6ff", d: "-1.4s", s: 40 },
          { c: "#ffd23f", d: "-2.6s", s: 34 },
        ].map((b, i) => (
          <div key={i} className="floaty flex flex-col items-center" style={{ animationDelay: b.d }}>
            <span className="grid place-items-center rounded-[50%] shadow-lg" style={{ width: b.s, height: b.s * 1.16, background: `radial-gradient(circle at 32% 26%, #fff9 0 18%, ${b.c} 19%)` }}><span className="mx-auto block h-1.5 w-2.5 rounded-b-full bg-white/60" /></span>
            <span className="h-6 w-px bg-white/70" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute right-[2%] top-[36%] hidden flex-col items-center gap-3 sm:flex">
        {[
          { c: "#8fe3a8", d: "-.6s", s: 46 },
          { c: "#b36bff", d: "-2s", s: 38 },
        ].map((b, i) => (
          <div key={i} className="floaty flex flex-col items-center" style={{ animationDelay: b.d }}>
            <span className="grid place-items-center rounded-[50%] shadow-lg" style={{ width: b.s, height: b.s * 1.16, background: `radial-gradient(circle at 32% 26%, #fff9 0 18%, ${b.c} 19%)` }}><span className="mx-auto block h-1.5 w-2.5 rounded-b-full bg-white/60" /></span>
            <span className="h-6 w-px bg-white/70" />
          </div>
        ))}
      </div>

      {/* ---------- 3D stage ---------- */}
      <div className="stage-area absolute inset-x-0 top-[13%] bottom-[236px] sm:top-[10%] md:top-[4%] md:bottom-[300px] [@media(max-height:560px)_and_(orientation:landscape)]:!top-[2%] [@media(max-height:560px)_and_(orientation:landscape)]:!bottom-[196px]">
        <LineupPreview selected={p1} accessory={acc1} />
      </div>

      {/* ---------- stage confetti fills the gap above the deck ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[215px] z-10 flex justify-center gap-6 md:hidden">
        {[
          { c: "#ffd23f", x: "-120px", y: 0, s: 9 },
          { c: "#ff8fb3", x: "-64px", y: 14, s: 6 },
          { c: "#8fd8ff", x: "-22px", y: 2, s: 7 },
          { c: "#b9f5a8", x: "26px", y: 16, s: 6 },
          { c: "#ffb3d4", x: "70px", y: 4, s: 9 },
          { c: "#ffd23f", x: "118px", y: 12, s: 6 },
        ].map((d, i) => (
          <span
            key={i}
            className="floaty absolute h-2 w-2 rounded-full opacity-80"
            style={{ background: d.c, left: `calc(50% + ${d.x})`, bottom: `${d.y}px`, width: d.s, height: d.s, animationDelay: `${-i * 0.6}s` }}
          />
        ))}
      </div>

      {/* ---------- stage skirt (fills the band above the deck on phones) ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[306px] z-10 h-[78px] sm:hidden">
        <div className="absolute inset-x-[-8%] bottom-0 h-16 rounded-t-[50%] bg-gradient-to-b from-[#c9f7c0] to-[#8fe3a8]" />
        <div className="absolute inset-x-[-2%] bottom-0 h-10 rounded-t-[50%] bg-gradient-to-b from-[#b9f5a8] to-[#5fd65a]" />
        <div className="absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-2">
          {[
            { icon: <BatIcon size={15} />, bg: "#fff3d6", d: "0s" },
            { icon: <PawIcon size={14} />, bg: "#ffe3ee", d: "-.8s" },
            { icon: <StarIcon size={14} />, bg: "#fff6c2", d: "-1.6s" },
            { icon: <TargetIcon size={14} />, bg: "#e3f3ff", d: "-2.4s" },
          ].map((p, i) => (
            <span key={i} className="floaty grid h-7 w-7 place-items-center rounded-full border-2 border-white shadow-md" style={{ background: p.bg, animationDelay: p.d }}>{p.icon}</span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-1 mx-auto flex w-max items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#2f7a3d] shadow">
          Kapal Langit · musim 1
        </div>
      </div>

      {/* ---------- confetti above the deck (phone) ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[300px] z-10 h-16 sm:hidden">
        {[
          ["#ffd23f", "12%", 6, 0],
          ["#ff8fb3", "24%", 10, -0.7],
          ["#8fd8ff", "40%", 5, -1.4],
          ["#b9f5a8", "58%", 9, -2.1],
          ["#ffb3d4", "72%", 6, -2.8],
          ["#ffd23f", "86%", 10, -3.5],
        ].map(([c, l, s, d], i) => (
          <span key={i} className="floaty absolute rounded-full shadow-sm" style={{ background: c as string, left: l as string, width: s as number, height: s as number, bottom: `${(i % 3) * 18 + 10}px`, animationDelay: `${d}s` }} />
        ))}
      </div>

      {/* ---------- filler for tall screens (tablet portrait) ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[310px] z-10 hidden h-40 [@media(min-height:900px)]:block md:bottom-[340px]">
        <div className="absolute inset-x-[-6%] bottom-0 h-24 rounded-t-[50%] bg-gradient-to-b from-[#c9f7c0] to-[#8fe3a8]" />
        <div className="absolute inset-x-[2%] bottom-0 h-14 rounded-t-[50%] bg-gradient-to-b from-[#b9f5a8] to-[#5fd65a]" />
        <div className="absolute left-[10%] bottom-[84px] floaty grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-[#fff3d6] shadow-lg"><BatIcon size={20} /></div>
        <div className="absolute left-[26%] bottom-[110px] floaty grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-[#ffe3ee] shadow-lg" style={{animationDelay:"-.9s"}}><PawIcon size={18} /></div>
        <div className="absolute right-[28%] bottom-[104px] floaty grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-[#fff6c2] shadow-lg" style={{animationDelay:"-1.6s"}}><StarIcon size={18} /></div>
        <div className="absolute right-[12%] bottom-[78px] floaty grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-[#e3f3ff] shadow-lg" style={{animationDelay:"-2.3s"}}><TargetIcon size={18} /></div>
        <div className="absolute inset-x-0 bottom-2 mx-auto w-max rounded-full border-2 border-white bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#2f7a3d] shadow">Kapal Langit · Musim 1</div>
      </div>

      {/* ---------- hero name plate (fills the empty floor) ---------- */}
      <div className="hero-plate pointer-events-none absolute inset-x-0 bottom-[250px] z-20 hidden justify-center sm:flex md:bottom-[286px]">
        <div className="flex items-center gap-2 rounded-2xl border-[3px] border-white bg-white/95 px-2 py-1 shadow-[0_6px_0_rgba(60,90,140,.2)] backdrop-blur">
          <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-xl border-2 border-yellow-300" style={{ background: sel.ui }}>
            <Portrait id={p1} fallback={sel.emoji} />
          </span>
          <span className="pr-1 text-left leading-tight">
            <span className="block text-[12px] font-black text-[#24364f]">{sel.name}</span>
            <span className="block text-[9px] font-bold text-slate-500">{sel.tagline}</span>
          </span>
          <span className="rounded-lg bg-[#fff2d6] px-1.5 py-0.5 text-[9px] font-black text-[#7a4a06]">ATK ★★★</span>
          <span className="rounded-lg bg-[#e9f6ff] px-1.5 py-0.5 text-[9px] font-black text-[#083a66]">SPD ★★☆</span>
        </div>
      </div>

      {/* ---------- logo ---------- */}
      <div className="logo-wrap pointer-events-none absolute left-1/2 top-[44px] z-20 -translate-x-1/2 text-center sm:top-2 [@media(max-height:560px)]:!top-0.5">
        <span className="floaty absolute -left-9 top-1 hidden sm:block" style={{ animationDelay: "-1s" }}><PawIcon size={22} /></span>
        <span className="floaty absolute -right-9 top-3 hidden sm:block" style={{ animationDelay: "-2.2s" }}><StarIcon size={19} /></span>
        <span className="floaty absolute -bottom-2 left-6 hidden sm:block" style={{ animationDelay: "-.5s" }}><FishIcon size={18} /></span>
        <h1 className="logo-title sticker wiggle whitespace-nowrap text-[27px] font-black italic leading-none tracking-tight text-yellow-300 sm:text-[clamp(34px,4.6vw,60px)] [@media(max-height:560px)]:!text-[24px]">MEOW BRAWL</h1>
        <div className="logo-sub mx-auto mt-1 [@media(max-height:560px)]:!hidden flex w-max items-center gap-1.5 rounded-full border-2 border-white bg-white/90 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#7a4a06] shadow-[0_3px_0_rgba(122,74,6,.25)] sm:px-3 sm:text-[11px]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 dot-pulse" />
          Kucing meme saling gebuk · grab · lempar!
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ff6f8f] dot-pulse" style={{ animationDelay: "-.9s" }} />
        </div>
      </div>

      {/* ---------- top bar ---------- */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2 sm:p-3">
        {/* profile */}
        <button
          onClick={(e) => {
            uiBtn(e);
            setSheet("char");
          }}
          className="press flex items-center gap-2 rounded-2xl border-[3px] border-white bg-white/95 p-1.5 pr-3 shadow-[0_5px_0_rgba(60,90,140,.22)] backdrop-blur"
        >
          <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-xl border-2 border-yellow-300" style={{ background: sel.ui }}>
            <Portrait id={p1} fallback={sel.emoji} />
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-gradient-to-b from-[#ffb3d4] to-[#ff6fab] text-[9px] font-black text-white shadow">1</span>
          </span>
          <span className="profile-info hidden text-left sm:block">
            <span className="flex items-center gap-1.5 text-[13px] font-black leading-tight text-[#24364f]">
              KAMU
              <span className="rounded-full bg-gradient-to-b from-[#ffe45c] to-[#ffb200] px-1.5 py-px text-[9px] text-[#6b4100] shadow-[0_2px_0_#c98a00]">LV 12</span>
            </span>
            <span className="block max-w-[150px] truncate text-[10px] font-bold text-slate-500">{sel.name} · {sel.tagline}</span>
            <span className="mt-0.5 block h-1.5 w-[130px] overflow-hidden rounded-full bg-slate-200">
              <span className="block h-full w-3/4 rounded-full bg-gradient-to-r from-[#5fd65a] to-[#b9f5a8]" />
            </span>
          </span>
        </button>

        {/* currencies / quick stats */}
        <div className="flex items-center gap-1.5">
          <span className="contents sm:hidden">
            <StatPill icon={<StarIcon size={14} />} value="128" tone="yellow" />
          </span>
          <span className="hidden sm:contents">
            <StatPill icon={<CatIcon />} value={`${ANIMALS.length}`} tone="pink" />
            <StatPill icon={<BotIcon />} value={`${bots}`} tone="blue" />
            <StatPill icon={<SwordsIcon />} value={`${fighters}`} tone="mint" />
          </span>
          <button
            onClick={(e) => {
              uiBtn(e);
              setSheet("settings");
            }}
            className="press grid h-9 w-9 place-items-center rounded-xl border-2 border-white bg-white/90 shadow-[0_4px_0_rgba(60,90,140,.2)]"
            title="Setelan"
          >
            <GearIcon size={19} />
          </button>
        </div>
      </div>

      {/* ---------- left rail (wide desktop only, so it never covers a cat) ---------- */}
      <div className="absolute left-3 top-[44%] z-30 hidden -translate-y-1/2 rotate-[-1.5deg] flex-col gap-2.5 min-[1180px]:flex">
        <RailTab icon={<CatIcon />} label="KARAKTER" tone="mint" onClick={() => setSheet("char")} />
        <RailTab icon={<HatIcon />} label="AKSESORIS" tone="pink" onClick={() => setSheet("acc")} />
        <RailTab icon={<GearIcon />} label="ATUR BENTUK" tone="blue" onClick={() => setSheet("tuning")} />
        <RailTab icon={<StarIcon />} label="MISI" tone="orange" badge={2} onClick={() => setSheet("mission")} />
      </div>

      {/* ---------- right rail (wide desktop only) ---------- */}
      <div className="absolute right-3 top-[44%] z-30 hidden -translate-y-1/2 rotate-[1.5deg] flex-col items-center gap-2.5 min-[1180px]:flex">
        <RoundBtn icon={<CatIcon />} label="Karakter" tone="pink" onClick={() => setSheet("char")} />
        <RoundBtn icon={<PeopleIcon />} label="Bot & pemain" tone="blue" onClick={() => setSheet("settings")} />
        <RoundBtn icon={<GearIcon />} label="Atur bentuk" tone="mint" onClick={() => setSheet("tuning")} />
        <RoundBtn icon={<HelpIcon />} label="Cara main" tone="orange" onClick={() => setSheet("info")} />
      </div>

      {/* ---------- selected ribbon above the cat ---------- */}
      <div className="pointer-events-none absolute left-1/2 top-[97px] z-20 -translate-x-1/2 sm:hidden">
        <div className="floaty relative flex items-center gap-2 rounded-2xl border-[3px] border-white bg-white/95 px-4 py-1.5 shadow-[0_6px_16px_rgba(60,90,140,.25)]">
          <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-b-[3px] border-l-[3px] border-white bg-white/95" />
          <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-r-[3px] border-t-[3px] border-white bg-white/95" />
          <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border-2 border-yellow-300" style={{ background: sel.ui }}>
            <Portrait id={p1} fallback={sel.emoji} />
          </span>
          <span className="text-sm font-black text-[#24364f]">{sel.name}</span>
          <span className="rounded-full bg-gradient-to-b from-[#ffe45c] to-[#ffb200] px-2 py-0.5 text-[9px] font-black uppercase text-[#6b4100] shadow-[0_2px_0_#c98a00]">Kamu</span>
        </div>
      </div>

      {/* ---------- bottom deck ---------- */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 sm:px-3" style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
        <div className="deck-compact w-full max-w-[1080px] rounded-[26px] border-4 border-white bg-[#fff8ee]/95 p-2 shadow-[0_10px_0_rgba(122,74,6,.18),0_18px_34px_rgba(50,70,120,.25)] backdrop-blur-md sm:p-3">
          {/* party ticker inside the deck (never clipped, never covers the cats) */}
          <div className="deck-ticker mb-1.5 hidden items-center gap-2 overflow-hidden rounded-full bg-[#2c3550] px-2 py-1 sm:flex sm:mb-2">
            <span className="shrink-0 rounded-full bg-gradient-to-b from-[#ffb3d4] to-[#ff6fab] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">Baru</span>
            <div className="marquee-mask relative min-w-0 flex-1 overflow-hidden">
              <div className="marquee flex w-max gap-6 whitespace-nowrap text-[9px] font-black uppercase tracking-wider text-white/95 sm:text-[10px]">
                {Array.from({ length: 2 }).map((_, k) => (
                  <span key={k} className="flex gap-6">
                    <span className="flex items-center gap-1.5"><BatIcon size={12} /> Tongkat dan teflon ada di pesawat!</span>
                    <span className="flex items-center gap-1.5"><MuscleIcon size={12} /> Tekan E untuk angkat &amp; lempar</span>
                    <span className="flex items-center gap-1.5"><CatIcon size={12} /> 11 kucing meme siap gebuk</span>
                    <span className="flex items-center gap-1.5"><TargetIcon size={12} /> Lempar lawan keluar arena!</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          {/* accessory shelf */}
          <div className="deck-acc relative flex items-center gap-2 pb-1.5 sm:pb-0">
            <span className="deck-label hidden shrink-0 -rotate-3 rounded-lg bg-gradient-to-b from-[#ffb3d4] to-[#ff6fab] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_3px_0_#c23c74] sm:block">
              Topi
            </span>
            <div className="no-sb flex flex-1 items-center justify-between gap-1 overflow-x-auto py-0.5 sm:justify-start sm:gap-1.5">
              {ACCESSORIES.map((a) => {
                const on = acc1 === a.id;
                const tint: Record<string, string> = {
                  none: "#eef3fb",
                  capRed: "#ffe0e2",
                  capBlue: "#dcebff",
                  capSportRed: "#ffd6da",
                  capSportBlue: "#d2e4ff",
                  dolit: "#ffe6cf",
                  helmet: "#fff3b8",
                };
                return (
                  <button
                    key={a.id}
                    onClick={(e) => {
                      uiBtn(e);
                      setAcc1(a.id);
                    }}
                    title={a.name}
                    className={`press card-pop flex shrink-0 items-center gap-1.5 rounded-full border-[3px] px-1.5 py-1 text-[11px] font-black transition-all ${
                      on
                        ? "scale-105 border-yellow-300 bg-gradient-to-b from-[#ffe45c] to-[#ffc400] text-[#6b4100] shadow-[0_3px_0_#c98a00,0_0_0_3px_rgba(255,210,63,.35)]"
                        : "border-white bg-white text-slate-600 shadow-[0_3px_0_rgba(0,0,0,.12)] hover:-translate-y-0.5"
                    }`}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white shadow-sm sm:h-7 sm:w-7" style={{ background: tint[a.id] }}>
                      <AccessoryIcon id={a.id} size={21} />
                    </span>
                    <span className="hidden sm:inline">{a.name}</span>
                    {on && <span className="text-[10px]">✔</span>}
                    {!on && <span className="absolute inset-x-0 -bottom-3 text-center text-[7px] font-black uppercase tracking-wide text-[#7a4a06]/70 sm:hidden">{a.name.split(" ")[0]}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-1 my-1.5 border-t-2 border-dashed border-[#f0c98a] sm:my-2" />

          {/* character shelf */}
          <div className="deck-chars flex items-center gap-2">
            <span className="deck-label hidden shrink-0 rotate-3 rounded-lg bg-gradient-to-b from-[#b9f5a8] to-[#5fd65a] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_3px_0_#2f9b35] sm:block">
              Kucing
            </span>
            <div className="no-sb flex flex-1 items-end gap-1.5 overflow-x-auto px-0.5 pb-1 pt-1 sm:gap-2">
              {ANIMALS.map((a, i) => {
                const on = p1 === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={(e) => {
                      uiBtn(e);
                      setP1(a.id);
                    }}
                    title={`${a.name} — ${a.tagline}`}
                    style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}
                    className={`char-card press card-pop relative grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-2xl border-[3px] sm:h-[62px] sm:w-[62px] ${
                      on
                        ? "z-10 -translate-y-1 scale-110 border-yellow-300 shadow-[0_0_0_3px_rgba(255,210,63,.55),0_8px_14px_rgba(0,0,0,.22)]"
                        : "border-white shadow-[0_4px_0_rgba(0,0,0,.14)] hover:-translate-y-0.5"
                    }`}
                  >
                    <span className="absolute inset-0" style={{ background: `linear-gradient(180deg,${a.ui} 0%,${a.ui} 62%,rgba(0,0,0,.18) 100%)` }} />
                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                    <span className="relative h-full w-full p-0.5">
                      <Portrait id={a.id} fallback={a.emoji} />
                    </span>
                    <span className={`char-name absolute inset-x-0 bottom-0 truncate px-1 py-px text-center text-[7px] font-black uppercase tracking-wide sm:text-[8px] ${on ? "bg-yellow-300/95 text-[#6b4100]" : "bg-black/35 text-white"}`}>
                      {a.name}
                    </span>
                    {on && <span className="absolute right-0.5 top-0.5 drop-shadow"><StarIcon size={12} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* quick nav for phones / small tablets */}
          <div className="deck-quick mt-1 flex gap-1.5 md:hidden">
            <JuicyButton tone="mint" size="sm" icon={<CatIcon size={15} />} className="flex-1" onClick={() => setSheet("char")}>
              KUCING
            </JuicyButton>
            <JuicyButton tone="pink" size="sm" icon={<HatIcon size={15} />} className="flex-1" onClick={() => setSheet("acc")}>
              TOPI
            </JuicyButton>
            <JuicyButton tone="blue" size="sm" icon={<GearIcon size={15} />} className="flex-1" onClick={() => setSheet("tuning")}>
              BENTUK
            </JuicyButton>
            <JuicyButton tone="orange" size="sm" icon={<StarIcon size={15} />} className="flex-1" onClick={() => setSheet("mission")}>
              MISI
            </JuicyButton>
          </div>

          {/* action row */}
          <div className="deck-actions mt-1 flex items-stretch justify-center gap-1.5 sm:mt-1.5 sm:gap-2">
            <div className="hidden w-[248px] shrink-0 flex-col justify-end gap-1 md:flex">
              <div className="grid grid-cols-2 gap-1">
                <JuicyButton tone="mint" size="sm" icon={<CatIcon size={14} />} onClick={() => setSheet("char")}>
                  KUCING
                </JuicyButton>
                <JuicyButton tone="pink" size="sm" icon={<HatIcon size={14} />} onClick={() => setSheet("acc")}>
                  TOPI
                </JuicyButton>
                <JuicyButton tone="blue" size="sm" icon={<GearIcon size={14} />} onClick={() => setSheet("tuning")}>
                  BENTUK
                </JuicyButton>
                <JuicyButton tone="orange" size="sm" icon={<StarIcon size={14} />} onClick={() => setSheet("mission")}>
                  MISI
                </JuicyButton>
              </div>
            </div>

            <button
              onClick={(e) => {
                uiBtn(e);
                setMode((m) => (m === "brawl" ? "bomb" : "brawl"));
              }}
              className="press flex min-w-0 flex-[1.25] items-center gap-1.5 rounded-2xl border-[3px] border-white bg-gradient-to-b from-white to-[#fff1d6] px-1.5 py-1 text-left shadow-[0_5px_0_rgba(60,90,140,.2)] sm:gap-2 sm:px-2 sm:py-1.5"
              title="Ketuk untuk ganti mode"
            >
              <span className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl shadow-[inset_0_-3px_0_rgba(0,0,0,.15)] sm:h-[52px] sm:w-[52px] ${mode === "bomb" ? "bg-gradient-to-b from-[#ffb37a] to-[#ff6b3d]" : "bg-gradient-to-b from-[#ffe45c] to-[#ffb200]"}`}>
                {mode === "bomb" ? <BombIcon size={26} /> : <IslandIcon />}
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400 dot-pulse" />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <div className="hidden text-[9px] font-black uppercase tracking-wider text-[#ff6f8f] sm:block">Mode · Kapal Langit · ketuk ganti</div>
                <div className="deck-mode-name text-[13px] font-black leading-tight text-[#24364f] sm:truncate sm:text-lg">{mode === "bomb" ? "BOM PARTY" : "BRAWL KUCING"}</div>
                <div className="deck-mode-chips flex flex-wrap items-center gap-1 text-[9px] font-bold text-slate-500 sm:truncate sm:text-[10px]">
                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-emerald-700">● {fighters}</span>
                  <span className="rounded-full bg-sky-100 px-1.5 py-px text-sky-700">{twoPlayer ? "2P" : "1P"}</span>
                  <span className={`rounded-full px-1.5 py-px ${mode === "bomb" ? "bg-orange-100 text-orange-700" : "hidden bg-pink-100 text-pink-700 lg:inline"}`}>{mode === "bomb" ? "💣 lempar & hindari" : ACCESSORIES.find((a) => a.id === acc1)?.name}</span>
                </div>
              </div>
            </button>

            <JuicyButton tone="yellow" size="xl" shine glow icon={<PlayIcon />} className="flex-[1] px-2 !text-xl sm:px-6 sm:!text-2xl md:max-w-[240px]" onClick={start}>
              MAIN!
            </JuicyButton>
          </div>
        </div>
      </div>

      {/* ---------- sheets ---------- */}
      {sheet === "char" && (
        <Sheet title="Pilih Kucing" icon={<CatIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => { setSheet(null); start(); }}>MAIN PAKAI {sel.name.toUpperCase()}!</JuicyButton>}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ANIMALS.map((a) => {
              const on = p1 === a.id;
              return (
                <button
                  key={a.id}
                  onClick={(e) => {
                    uiBtn(e);
                    setP1(a.id);
                  }}
                  className={`press overflow-hidden rounded-2xl border-[3px] text-left shadow-[0_4px_0_rgba(0,0,0,.14)] ${on ? "border-yellow-400 ring-4 ring-yellow-300/50" : "border-white"}`}
                  style={{ background: a.ui }}
                >
                  <div className="relative aspect-square w-full">
                    <Portrait id={a.id} fallback={a.emoji} />
                    {on && <span className="absolute left-1 top-1 rounded-full bg-yellow-300 px-1.5 text-[9px] font-black text-[#6b4100]">DIPILIH</span>}
                  </div>
                  <div className="bg-white/95 px-2 py-1">
                    <div className="text-[12px] font-black leading-tight text-[#24364f]">{a.name}</div>
                    <div className="truncate text-[9px] font-bold text-slate-500">{a.tagline}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {sheet === "acc" && (
        <Sheet title="Aksesoris Kepala" icon={<HatIcon />} onClose={() => setSheet(null)} footer={<div className="text-center text-[11px] font-bold text-slate-500">Topi & topeng bisa copot kalau kena pukulan tongkat. Helm mengurangi damage kepala.</div>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACCESSORIES.map((a) => {
              const on = acc1 === a.id;
              return (
                <button
                  key={a.id}
                  onClick={(e) => {
                    uiBtn(e);
                    setAcc1(a.id);
                  }}
                  className={`press flex items-center gap-2 rounded-2xl border-[3px] bg-white p-2 text-left shadow-[0_4px_0_rgba(0,0,0,.12)] ${on ? "border-yellow-400 ring-4 ring-yellow-300/40" : "border-white"}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: TONES[on ? "yellow" : "blue"].soft }}>
                    <AccessoryIcon id={a.id} size={26} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-black text-[#24364f]">{a.name}</span>
                    <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">{on ? "dipakai" : "pakai"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {sheet === "tuning" && (
        <Sheet title="Atur Bentuk Kucing" icon={<GearIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="mint" size="lg" block onClick={() => setSheet(null)}>SELESAI</JuicyButton>}>
          <div className="rounded-2xl bg-[#2c3550] p-1">
            <TuningPanel inline />
          </div>
        </Sheet>
      )}

      {sheet === "settings" && (
        <Sheet title="Setelan Pertandingan" icon={<GearIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>SIMPAN</JuicyButton>}>
          <div className="space-y-2.5">
            <div className="rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-[#24364f]">Grafis</div>
                  <div className="text-[11px] font-bold text-slate-500">Turbo = lebih lancar</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">FPS+</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["performance", "auto", "high"] as Quality[]).map((q) => (
                  <button
                    key={q}
                    onClick={(e) => {
                      uiBtn(e);
                      setQuality(q);
                      localStorage.setItem("meow.quality", q);
                    }}
                    className={`press rounded-xl border-[3px] px-1 py-2 text-[11px] font-black ${
                      quality === q ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-white bg-slate-50 text-slate-500"
                    }`}
                  >
                    {q === "performance" ? "TURBO" : q === "auto" ? "AUTO" : "ULTRA"}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] font-bold text-slate-400">TURBO = tanpa bayangan + resolusi ringan · AUTO = menyesuaikan FPS</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-black text-[#24364f]"><BotIcon size={16} /> Jumlah Bot</div>
                <div className="text-[11px] font-bold text-slate-500">Lawan komputer di arena</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { uiBtn(e); setBots(Math.max(1, bots - 1)); }} className="press grid h-9 w-9 place-items-center rounded-xl bg-[#ffe9c4] text-lg font-black text-[#7a4a06] shadow-[0_3px_0_#e8b96a]">−</button>
                <span className="w-6 text-center text-lg font-black text-[#24364f]">{bots}</span>
                <button onClick={(e) => { uiBtn(e); setBots(Math.min(7, bots + 1)); }} className="press grid h-9 w-9 place-items-center rounded-xl bg-[#c9f7c1] text-lg font-black text-[#1d5a1f] shadow-[0_3px_0_#78c96a]">+</button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-black text-[#24364f]"><PeopleIcon size={16} /> 2 Pemain</div>
                <div className="text-[11px] font-bold text-slate-500">Satu keyboard (P2 pakai panah)</div>
              </div>
              <Toggle on={twoPlayer} onClick={() => setTwoPlayer(!twoPlayer)} />
            </div>
            {twoPlayer && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#e9f6ff] p-3 shadow-[0_3px_0_rgba(0,0,0,.08)]">
                <div className="text-sm font-black text-[#083a66]">P2 pakai</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { uiBtn(e); const i = ANIMALS.findIndex((a) => a.id === p2); setP2(ANIMALS[(i + 1) % ANIMALS.length].id); }}
                    className="press flex items-center gap-1.5 rounded-xl bg-white px-2 py-1 text-[12px] font-black text-[#24364f] shadow-[0_2px_0_#b9c6db]"
                  >
                    <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-md" style={{ background: animalById(p2).ui }}><Portrait id={p2} fallback={animalById(p2).emoji} /></span>
                    {animalById(p2).name} ⟳
                  </button>
                  <button
                    onClick={(e) => { uiBtn(e); const i = ACCESSORIES.findIndex((x) => x.id === acc2); setAcc2(ACCESSORIES[(i + 1) % ACCESSORIES.length].id); }}
                    className="press flex items-center gap-1 rounded-xl bg-white px-2 py-1.5 text-[12px] font-black text-[#24364f] shadow-[0_2px_0_#b9c6db]"
                  >
                    <AccessoryIcon id={acc2} size={18} /> ⟳
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-[#24364f]">Mode Permainan</div>
                  <div className="text-[11px] font-bold text-slate-500">Brawl biasa atau pesta bom?</div>
                </div>
                <span className="text-lg">{mode === "bomb" ? "BOM" : "BRAWL"}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={(e) => { uiBtn(e); setMode("brawl"); }}
                  className={`press rounded-xl border-[3px] px-2 py-2 text-[12px] font-black ${mode === "brawl" ? "border-yellow-300 bg-yellow-100 text-[#6b4100]" : "border-white bg-slate-50 text-slate-500"}`}
                >
                  BRAWL KUCING
                </button>
                <button
                  onClick={(e) => { uiBtn(e); setMode("bomb"); }}
                  className={`press rounded-xl border-[3px] px-2 py-2 text-[12px] font-black ${mode === "bomb" ? "border-orange-300 bg-orange-100 text-[#7a2d00]" : "border-white bg-slate-50 text-slate-500"}`}
                >
                  BOM PARTY
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-black text-[#24364f]"><TouchIcon size={16} /> Kontrol Sentuh</div>
                <div className="text-[11px] font-bold text-slate-500">Joystick + tombol di layar</div>
              </div>
              <Toggle on={showTouch} tone="blue" onClick={() => setShowTouch(!showTouch)} />
            </div>
          </div>
        </Sheet>
      )}

      {sheet === "info" && (
        <Sheet title="Cara Main" icon={<HelpIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>SIAP!</JuicyButton>}>
          <div className="space-y-2">
            {[
              ["WSAD", "WASD / Panah", "Jalan ke segala arah. Tahan Shift untuk lari."],
              ["J", "J", "Pukul bergantian kiri-kanan. Pukulan beruntun bikin lawan pusing."],
              ["E", "E", "Sekali tekan untuk angkat lawan/peti ke atas kepala, tekan lagi untuk melempar."],
              ["K", "K", "Grab & bergantung di tepi arena. Lepas untuk lempar."],
              ["E + J", "Tongkat / Teflon", "Ambil senjata dengan E, ayun dengan J. Teflon berbunyi PANG! saat kena."],
              ["L", "L", "Sundul (di darat) atau dropkick (di udara)."],
              ["KO", "Pingsan", "Kalau pusing penuh, kucing pingsan. Angkat dan lempar ke luar arena!"],
            ].map(([i, t, d]) => (
              <div key={t} className="flex gap-2 rounded-2xl bg-white p-2.5 shadow-[0_3px_0_rgba(0,0,0,.08)]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ffe9c4] text-base font-black text-[#7a4a06]">{i}</span>
                <div>
                  <div className="text-[13px] font-black text-[#24364f]">{t}</div>
                  <div className="text-[11px] font-bold leading-snug text-slate-500">{d}</div>
                </div>
              </div>
            ))}
            <div className="rounded-2xl bg-[#e9f6ff] p-3 text-[11px] font-bold text-[#083a66]">P2: panah · Num0/Enter lompat · Num1 pukul · Num2 grab · Num3 sundul · Num4 angkat · RShift lari.</div>
          </div>
        </Sheet>
      )}

      {sheet === "mission" && (
        <Sheet title="Misi Harian" icon={<StarIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>SEMANGAT!</JuicyButton>}>
          <div className="space-y-2">
            {[
              ["Menang 1 ronde", "0/1", 40, <TrophyIcon size={16} />],
              ["Ayun senjata 5 kali", "0/5", 25, <BatIcon size={16} />],
              ["Angkat lawan 3 kali", "0/3", 25, <MuscleIcon size={16} />],
              ["Lempar lawan keluar arena", "0/1", 50, <TargetIcon size={16} />],
                    ].map((m) => { const [t, p, r] = m as [string, string, number]; return (
              <div key={t as string} className="flex items-center gap-2 rounded-2xl bg-white p-2.5 shadow-[0_3px_0_rgba(0,0,0,.08)]">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#ffe9c4] text-[#7a4a06]">{m[3]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black text-[#24364f]">{t}</div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-0 rounded-full bg-emerald-400" /></div>
                </div>
                <span className="rounded-lg bg-yellow-300 px-2 py-1 text-[10px] font-black text-[#6b4100]">{p} · +{r}</span>
              </div>
            ); })}
            <div className="text-center text-[11px] font-bold text-slate-500">Misi direset tiap hari. Mainkan ronde untuk menyelesaikannya!</div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function AccessoryIcon({ id, size = 20 }: { id: AccessoryId; size?: number }) {
  if (id === "capSportRed" || id === "capSportBlue") {
    const main = id === "capSportRed" ? "#e8343c" : "#2f6fe0";
    const dark = id === "capSportRed" ? "#a3121d" : "#1b4496";
    return (
      <Svg size={size}>
        <path d="M3.5 10.5C4.2 6.4 7.7 3.6 12 3.6s7.8 2.8 8.5 6.9l.6 3.4H2.9l.6-3.4Z" fill={main} stroke={dark} strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M7 6.6c1.4-1.5 3.1-2.3 5-2.3s3.6.8 5 2.3" stroke="#fff" strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2.9 13.9h18.2c.9 0 1.8.5 1.8 1.2 0 .9-1.6 1.6-3.2 1.6H4.7c-1.6 0-3.2-.7-3.2-1.6 0-.7.9-1.2 1.4-1.2Z" fill="#fff" stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m15.6 8.4.6 1.3 1.4.2-1 .9.3 1.4-1.3-.7-1.3.7.3-1.4-1-.9 1.4-.2.6-1.3Z" fill="#ffd23f" stroke={dark} strokeWidth=".8" />
        <circle cx="12" cy="3.4" r="1.1" fill={main} stroke={dark} strokeWidth="1.2" />
      </Svg>
    );
  }
  if (id === "capRed" || id === "capBlue") {
    const main = id === "capRed" ? "#e8343c" : "#2f6fe0";
    const dark = id === "capRed" ? "#a3121d" : "#1b4496";
    return (
      <Svg size={size}>
        <path d="M4 13c0-4.5 3.5-8 8-8s8 3.5 8 8" fill={main} stroke={dark} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 13h18" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15 13c2.6 0 5 .7 5 1.6S18.6 16 15 16" fill="#fff" stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="5.4" r="1.1" fill="#fff" stroke={dark} strokeWidth="1.2" />
      </Svg>
    );
  }
  if (id === "dolit") {
    return (
      <Svg size={size}>
        <circle cx="8" cy="11" r="4.4" fill="#fff" stroke="#16141a" strokeWidth="1.8" />
        <circle cx="16" cy="11" r="4.4" fill="#fff" stroke="#16141a" strokeWidth="1.8" />
        <circle cx="8" cy="12" r="1.7" fill="#16141a" />
        <circle cx="16" cy="12" r="1.7" fill="#16141a" />
        <ellipse cx="12" cy="18.4" rx="2.2" ry="1.7" fill="#f2ad94" stroke="#7a3a32" strokeWidth="1.2" />
      </Svg>
    );
  }
  if (id === "helmet") {
    return (
      <Svg size={size}>
        <path d="M5 13a7 7 0 0 1 14 0v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3Z" fill="#ffcc2e" stroke="#7a4a06" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="7.5" y="10.5" width="9" height="4.4" rx="2.2" fill="#9ad8ff" stroke="#7a4a06" strokeWidth="1.4" />
        <path d="M11 6h2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg size={size}>
      <path d="M5 12.5c0-3.9 3.1-7 7-7s7 3.1 7 7" fill="none" stroke="#6f89a8" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="M3.5 12.5h17" stroke="#6f89a8" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m4.5 19.5 15-15" stroke="#ff6f8f" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}
function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}
function PlayIcon() {
  return <Svg size={22}><path d="M7 4.5v15c0 .9 1 1.5 1.8 1L21 12.9c.8-.5.8-1.6 0-2.1L8.8 3.5C8 3 7 3.6 7 4.5Z" fill="#5b3a00" /></Svg>;
}
function CatIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 9.5 4 3l5 3.2a8 8 0 0 1 6 0L20 3v6.5" stroke="#3b2a12" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 10a8 8 0 1 0 16 0" stroke="#3b2a12" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="12" r="1.3" fill="#3b2a12" /><circle cx="15" cy="12" r="1.3" fill="#3b2a12" />
      <path d="M12 14.5v1m-2 .5h4" stroke="#3b2a12" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}
function HatIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 13c0-4 3-7 7-7s7 3 7 7" fill="#ff6fab" stroke="#5b1338" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 13h16" stroke="#5b1338" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 13c2.4 0 4 .6 4 1.4S18.4 16 16 16" fill="#fff" stroke="#5b1338" strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}
function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3.2" stroke="#12314f" strokeWidth="2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" stroke="#12314f" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function StarIcon({ size = 20 }: { size?: number }) {
  return <Svg size={size}><path d="m12 3.5 2.6 5.3 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.6l5.9-.8L12 3.5Z" fill="#ffd23f" stroke="#6b4100" strokeWidth="1.8" strokeLinejoin="round" /></Svg>;
}
function PeopleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="9" cy="9" r="3" stroke="#083a66" strokeWidth="2" /><circle cx="17" cy="10" r="2.2" stroke="#083a66" strokeWidth="2" />
      <path d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19M15 15c2 0 3.8 1.2 4.5 3.4" stroke="#083a66" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function HelpIcon({ size = 20 }: { size?: number }) {
  return <Svg size={size}><circle cx="12" cy="12" r="9" stroke="#5a2703" strokeWidth="2" /><path d="M9.3 9.2c.2-1.4 1.3-2.2 2.8-2.2 1.6 0 2.8 1 2.8 2.4 0 2.2-2.8 2.1-2.8 4.2" stroke="#5a2703" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.2" fill="#5a2703" /></Svg>;
}
function BotIcon({ size = 18 }: { size?: number }) {
  return <Svg size={size}><rect x="4" y="7" width="16" height="12" rx="4" stroke="#083a66" strokeWidth="2" /><circle cx="9" cy="13" r="1.4" fill="#083a66" /><circle cx="15" cy="13" r="1.4" fill="#083a66" /><path d="M12 7V4" stroke="#083a66" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="3" r="1.3" fill="#083a66" /></Svg>;
}
function SwordsIcon({ size = 18 }: { size?: number }) {
  return <Svg size={size}><path d="m4 4 9 9M14 4l6 6-3 3-6-6 3-3ZM4 20l6-6M3 15l6 6M18 20l3-3" stroke="#123d14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function IslandIcon() {
  return (
    <Svg size={30}>
      <circle cx="23" cy="8" r="3.6" fill="#ffd23f" />
      <path d="M4 21c4-3 8-3 12 0s9 3 12 0v6H4v-6Z" fill="#5fd65a" />
      <path d="M4 24h24v3.5c0 1-1.5 1.5-2 1.5H6c-.5 0-2-.5-2-1.5V24Z" fill="#2f9b35" />
      <path d="M11 21V12l3-2 3 2v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function PawIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <ellipse cx="12" cy="15.5" rx="5" ry="4" fill="#c98a4b" opacity=".85" />
      <ellipse cx="6.4" cy="10.5" rx="2.1" ry="2.6" fill="#c98a4b" opacity=".85" />
      <ellipse cx="10" cy="7.6" rx="2.1" ry="2.7" fill="#c98a4b" opacity=".85" />
      <ellipse cx="14" cy="7.6" rx="2.1" ry="2.7" fill="#c98a4b" opacity=".85" />
      <ellipse cx="17.6" cy="10.5" rx="2.1" ry="2.6" fill="#c98a4b" opacity=".85" />
    </Svg>
  );
}
function HeartIcon({ size = 20 }: { size?: number }) {
  return <Svg size={size}><path d="M12 20.5s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8.6a4.1 4.1 0 0 1 7.5 2.5c0 4.8-7.5 9.4-7.5 9.4Z" fill="#ff6f8f" stroke="#c23c5e" strokeWidth="1.6" /></Svg>;
}
function FishIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <ellipse cx="10" cy="12" rx="6.4" ry="4.4" fill="#8fd8ff" stroke="#1b6ec2" strokeWidth="1.5" />
      <path d="M16.4 12l4-3v6l-4-3Z" fill="#8fd8ff" stroke="#1b6ec2" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7.6" cy="11" r="1.1" fill="#083a66" />
    </Svg>
  );
}
function BatIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 20 14.5 9.5" stroke="#c98a4b" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M13.2 4.2 19.8 10.8" stroke="#c98a4b" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M4 20l1.6 1.6" stroke="#ff4d6d" strokeWidth="3.4" strokeLinecap="round" />
    </Svg>
  );
}
function MuscleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 18c0-4 2.5-6 5-6.5-1.6-1.4-1.4-4 .6-4.6 1.6-.5 3 .6 3.4 2.1.8-1.4 2.8-1.6 3.9-.4 1.2 1.3.7 3.4-.9 4.2 2 .8 3 2.6 3 5.2" stroke="#c25a12" strokeWidth="2.2" strokeLinecap="round" fill="#ffe0b3" />
    </Svg>
  );
}
function BombIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="14" r="7" fill="#2a2c3a" stroke="#0f1016" strokeWidth="1.6" />
      <circle cx="8.4" cy="11.6" r="1.7" fill="#fff" />
      <circle cx="8.8" cy="11.8" r="0.8" fill="#11121a" />
      <rect x="15" y="4.2" width="2.6" height="5" rx="1.2" transform="rotate(24 16 7)" fill="#d9b27a" />
      <circle cx="18.2" cy="3.6" r="2.1" fill="#ffd23f" />
      <circle cx="18.2" cy="3.6" r="1" fill="#ff7a2f" />
    </Svg>
  );
}
function TargetIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8" stroke="#c25a12" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.4" stroke="#c25a12" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" fill="#c25a12" />
    </Svg>
  );
}
function TrophyIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" fill="#ffd23f" stroke="#6b4100" strokeWidth="1.7" />
      <path d="M8 5.5H5.5V8A3 3 0 0 0 8 10.8M16 5.5h2.5V8A3 3 0 0 1 16 10.8" stroke="#6b4100" strokeWidth="1.7" fill="none" />
      <path d="M10.4 13.4h3.2l.6 4h-4.4l.6-4Z" fill="#ffd23f" stroke="#6b4100" strokeWidth="1.7" />
      <path d="M8.6 19.4h6.8" stroke="#6b4100" strokeWidth="1.9" strokeLinecap="round" />
    </Svg>
  );
}
function TouchIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="7" y="3" width="10" height="18" rx="2.6" stroke="#12314f" strokeWidth="2" />
      <path d="M11 18h2" stroke="#12314f" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}
