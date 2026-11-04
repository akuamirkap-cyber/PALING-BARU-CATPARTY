import { useCallback, useEffect, useMemo, useState } from "react";
import LineupPreview from "./components/LineupPreview";
import MobileMenu from "./components/MobileMenu";
import GameView from "./components/GameView";
import Portrait from "./components/Portrait";
import SettingsButton from "./components/SettingsButton";
import { BombIcon } from "./components/icons";
import TuningPanel from "./components/TuningPanel";
import { JuicyButton, RailTab, RoundBtn, Sheet, Sparkles, StatPill, Toggle, TONES, uiBtn } from "./components/ui";
import { ACCESSORIES, ANIMALS, animalById, type AccessoryId, type AnimalId } from "./game/animals";
import { initAudio } from "./game/audio";
import { renderPortrait } from "./game/portraits";
import { tuningKey, useTuning } from "./game/tuning";

type Screen = "select" | "game";
type SheetId = "char" | "acc" | "tuning" | "settings" | "info" | "mission" | null;

export default function App() {
  const [screen, setScreen] = useState<Screen>("select");
  const [p1, setP1] = useState<AnimalId>("oyen");
  const [p2, setP2] = useState<AnimalId>("item");
  const [acc1, setAcc1] = useState<AccessoryId>("capNewRed");
  const [acc2, setAcc2] = useState<AccessoryId>("capNewBlue");
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [bots, setBots] = useState(5);
  const [mode, setMode] = useState<"brawl" | "bomb">("brawl");
  const [camMode, setCamMode] = useState<"stumble" | "gang">(() => (localStorage.getItem("mb.camMode") === "stumble" ? "stumble" : "gang"));
  const [camZoom, setCamZoom] = useState<number>(() => {
    const z = parseFloat(localStorage.getItem("mb.camZoom") ?? "1");
    return [0.7, 1, 1.35].includes(z) ? z : 1;
  });
  useEffect(() => {
    localStorage.setItem("mb.camMode", camMode);
    localStorage.setItem("mb.camZoom", String(camZoom));
  }, [camMode, camZoom]);
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
      if (e.code === "Escape") {
        setSheet(null);
        return;
      }
      // Let focused controls handle Enter, Space and arrow keys themselves.
      const target = e.target as HTMLElement | null;
      if (sheet || target?.closest("button, input, select, textarea, [contenteditable='true']")) return;
      const idx = ANIMALS.findIndex((a) => a.id === p1);
      if (e.code === "ArrowRight" || e.code === "KeyD") setP1(ANIMALS[(idx + 1) % ANIMALS.length].id);
      if (e.code === "ArrowLeft" || e.code === "KeyA") setP1(ANIMALS[(idx - 1 + ANIMALS.length) % ANIMALS.length].id);
      if (e.code === "Enter" || e.code === "Space") {
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, p1, start, sheet]);

  if (screen === "game") {
    return (
      <GameView
        key={gameKey}
        options={{ p1Animal: p1, p2Animal: p2, twoPlayer, bots, p1Acc: acc1, p2Acc: acc2, mode, camMode, camZoom }}
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
      {/* drifting clouds */}
      <div className="cloud-drift pointer-events-none absolute left-[6%] top-[9%] h-9 w-32 rounded-full bg-white/90 blur-[1px]" />
      <div className="cloud-drift-slow pointer-events-none absolute right-[8%] top-[7%] hidden h-12 w-44 rounded-full bg-white/90 blur-[1px] sm:block" />
      <div className="cloud-drift pointer-events-none absolute left-[38%] top-[13%] h-6 w-24 rounded-full bg-white/70 blur-[1px]" style={{ animationDelay: "-4s" }} />
      <div className="cloud-drift-slow pointer-events-none absolute right-[30%] top-[20%] h-7 w-28 rounded-full bg-white/60 blur-[1px]" style={{ animationDelay: "-7s" }} />
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
            {(i === 2 || i === 5 || i === 8) && <span className="absolute left-1/2 top-[30%] -translate-x-1/2 text-sm drop-shadow">⭐</span>}
            {i === 6 && <span className="absolute left-1/2 top-[30%] -translate-x-1/2 text-sm drop-shadow">💗</span>}
          </div>
        ))}
      </div>
      {/* hills between wall and floor */}
      <div className="pointer-events-none absolute inset-x-[-10%] bottom-[27%] h-24 md:bottom-[33%]">
        <div className="absolute bottom-0 left-[4%] h-16 w-[34%] rounded-[50%] bg-[#a8ecb6]" />
        <div className="absolute bottom-0 right-[5%] h-20 w-[38%] rounded-[50%] bg-[#8fe0c0]" />
        <div className="absolute bottom-2 left-[30%] h-12 w-[40%] rounded-[50%] bg-[#c8f5d2]" />
      </div>
      {/* floor with texture + spotlight */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] md:h-[38%]" style={{ background: "linear-gradient(180deg,#ffedc9 0%,#ffdca8 45%,#ffbf8b 100%)" }}>
        <div className="floor-dots absolute inset-0 opacity-60" />
        <div className="absolute inset-x-0 top-0 h-2.5 bg-white/60" />
        <div className="absolute inset-x-0 top-2.5 h-1 bg-[#f0a35e]/40" />
        <div className="spot-glow absolute bottom-[46%] left-1/2 h-16 w-[300px] max-w-[70vw] rounded-[50%] bg-[#ffe27a]/70 blur-xl" />
        <div className="absolute bottom-[30%] left-[12%] hidden text-lg opacity-60 sm:block">🐾</div>
        <div className="absolute bottom-[22%] left-[18%] hidden text-sm opacity-40 sm:block">🐾</div>
        <div className="absolute bottom-[30%] right-[12%] hidden text-lg opacity-60 sm:block">🐾</div>
        <div className="absolute bottom-[22%] right-[18%] hidden text-sm opacity-40 sm:block">🐾</div>
      </div>

      {/* ---------- 3D stage (podium + spotlight live inside the 3D scene) ---------- */}
      <div className="absolute inset-x-0 top-[13%] bottom-[300px] z-10 md:top-[5%] md:bottom-[272px]">
        <LineupPreview selected={p1} accessory={acc1} />
      </div>

      {/* ---------- mobile menu (phones & small tablets) ---------- */}
      <MobileMenu
        p1={p1}
        setP1={setP1}
        acc1={acc1}
        setAcc1={setAcc1}
        bots={bots}
        setBots={setBots}
        twoPlayer={twoPlayer}
        showTouch={showTouch}
        setShowTouch={setShowTouch}
        fighters={fighters}
        setSheet={setSheet}
        start={start}
        mode={mode}
        setMode={setMode}
        camMode={camMode}
        setCamMode={setCamMode}
        camZoom={camZoom}
        setCamZoom={setCamZoom}
      />

      {/* ---------- logo (desktop) ---------- */}
      <div className="pointer-events-none absolute left-1/2 top-2 z-20 hidden -translate-x-1/2 text-center md:block">
        <span className="floaty absolute -left-9 top-1 hidden text-xl sm:block" style={{ animationDelay: "-1s" }}>🐾</span>
        <span className="floaty absolute -right-9 top-3 hidden text-lg sm:block" style={{ animationDelay: "-2.2s" }}>⭐</span>
        <span className="floaty absolute -bottom-3 left-6 hidden text-base sm:block" style={{ animationDelay: "-.5s" }}>🐟</span>
        <h1 className="sticker wiggle text-5xl font-black italic leading-none tracking-tight text-yellow-300 md:text-6xl">MEOW BRAWL</h1>
        <div className="mx-auto mt-1 flex w-max items-center gap-1.5 rounded-full border-2 border-white bg-white/90 px-3 py-0.5 text-[11px] font-black uppercase tracking-widest text-[#7a4a06] shadow-[0_3px_0_rgba(122,74,6,.25)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 dot-pulse" />
          Kucing meme saling gebuk · grab · lempar!
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ff6f8f] dot-pulse" style={{ animationDelay: "-.9s" }} />
        </div>
      </div>

      {/* ---------- top bar (desktop) ---------- */}
      <div className="absolute inset-x-0 top-0 z-30 hidden items-start justify-between gap-2 p-3 md:flex">
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
          <span className="hidden text-left sm:block">
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
          <span className="hidden sm:contents">
            <StatPill icon={<CatIcon />} value={`${ANIMALS.length}`} tone="pink" />
            <StatPill icon={<BotIcon />} value={`${bots}`} tone="blue" />
            <StatPill icon={<SwordsIcon />} value={`${fighters}`} tone="mint" />
          </span>
          <SettingsButton onClick={() => setSheet("settings")} />
        </div>
      </div>

      {/* ---------- left rail (desktop) ---------- */}
      <div className="absolute left-3 top-[44%] z-30 hidden -translate-y-1/2 rotate-[-1.5deg] flex-col gap-2.5 xl:flex">
        <RailTab icon={<CatIcon />} label="KARAKTER" tone="mint" onClick={() => setSheet("char")} />
        <RailTab icon={<HatIcon />} label="AKSESORIS" tone="pink" onClick={() => setSheet("acc")} />
        <RailTab icon={<GearIcon />} label="ATUR BENTUK" tone="blue" onClick={() => setSheet("tuning")} />
        <RailTab icon={<StarIcon />} label="MISI" tone="orange" badge={2} onClick={() => setSheet("mission")} />
      </div>

      {/* ---------- right rail (desktop) ---------- */}
      <div className="absolute right-3 top-[44%] z-30 hidden -translate-y-1/2 rotate-[1.5deg] flex-col items-center gap-2.5 xl:flex">
        <RoundBtn icon={<CatIcon />} label="Karakter" tone="pink" onClick={() => setSheet("char")} />
        <RoundBtn icon={<PeopleIcon />} label="Bot & pemain" tone="blue" onClick={() => setSheet("settings")} />
        <RoundBtn icon={<GearIcon />} label="Atur bentuk" tone="mint" onClick={() => setSheet("tuning")} />
        <RoundBtn icon={<HelpIcon />} label="Cara main" tone="orange" onClick={() => setSheet("info")} />
      </div>

      {/* ---------- bottom deck (desktop) ---------- */}
      <div className="absolute inset-x-0 bottom-0 z-30 hidden justify-center px-3 md:flex" style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
        <div className="w-full max-w-[940px] rounded-[26px] border-4 border-white bg-[#fff8ee]/95 p-2 shadow-[0_10px_0_rgba(122,74,6,.18),0_18px_34px_rgba(50,70,120,.25)] backdrop-blur-md sm:p-3">
          {/* accessory shelf */}
          <div className="flex items-center gap-2">
            <span className="hidden shrink-0 -rotate-3 rounded-lg bg-gradient-to-b from-[#ffb3d4] to-[#ff6fab] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_3px_0_#c23c74] sm:block">
              Aksesoris
            </span>
            <div className="no-sb flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
              {ACCESSORIES.map((a) => {
                const on = acc1 === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={(e) => {
                      uiBtn(e);
                      setAcc1(a.id);
                    }}
                    title={a.name}
                    className={`press card-pop flex shrink-0 items-center gap-1.5 rounded-full border-[3px] px-2 py-1 text-[11px] font-black transition-all ${
                      on
                        ? "scale-105 border-yellow-300 bg-gradient-to-b from-[#ffe45c] to-[#ffc400] text-[#6b4100] shadow-[0_3px_0_#c98a00,0_0_0_3px_rgba(255,210,63,.35)]"
                        : "border-white bg-white text-slate-500 shadow-[0_3px_0_rgba(0,0,0,.12)] hover:bg-yellow-50"
                    }`}
                  >
                    <AccessoryIcon id={a.id} size={20} />
                    <span className="hidden sm:inline">{a.name}</span>
                    {on && <span className="text-[10px]">✔</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-1 my-1.5 border-t-2 border-dashed border-[#f0c98a] sm:my-2" />

          {/* character shelf */}
          <div className="flex items-center gap-2">
            <span className="hidden shrink-0 rotate-3 rounded-lg bg-gradient-to-b from-[#b9f5a8] to-[#5fd65a] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_3px_0_#2f9b35] sm:block">
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
                    className={`press card-pop relative grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-2xl border-[3px] sm:h-[62px] sm:w-[62px] ${
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
                    <span className={`absolute inset-x-0 bottom-0 truncate px-1 py-px text-center text-[7px] font-black uppercase tracking-wide sm:text-[8px] ${on ? "bg-yellow-300/95 text-[#6b4100]" : "bg-black/35 text-white"}`}>
                      {a.name}
                    </span>
                    {on && <span className="absolute right-0.5 top-0.5 text-[11px] drop-shadow">⭐</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* action row */}
          <div className="mt-1 flex items-stretch justify-center gap-1.5 sm:mt-1.5 sm:gap-2">
            <div className="hidden flex-1 flex-col justify-end gap-1.5 md:flex">
              <div className="flex gap-1.5">
                <JuicyButton tone="blue" size="md" className="flex-1" onClick={() => setSheet("tuning")}>
                  ATUR BENTUK
                </JuicyButton>
                <JuicyButton tone="orange" size="md" className="flex-1" onClick={() => setSheet("mission")}>
                  MISI
                </JuicyButton>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#7a4a06]/80">
                <span className="rounded-md bg-white px-1.5 py-0.5 shadow-sm">◀ ▶ pilih kucing</span>
                <span className="rounded-md bg-white px-1.5 py-0.5 shadow-sm">ENTER untuk main</span>
              </div>
            </div>

            <button
              onClick={(e) => {
                uiBtn(e);
                setMode(mode === "brawl" ? "bomb" : "brawl");
              }}
              title="Ketuk untuk ganti mode"
              className="press flex min-w-0 flex-[1.1] items-center gap-1.5 rounded-2xl border-[3px] border-white bg-gradient-to-b from-white to-[#fff1d6] px-1.5 py-1 text-left shadow-[0_5px_0_rgba(60,90,140,.2)] sm:gap-2 sm:px-2 sm:py-1.5 md:max-w-[430px]"
            >
              <span className={`relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl shadow-[inset_0_-3px_0_rgba(0,0,0,.15)] sm:h-[52px] sm:w-[52px] ${mode === "bomb" ? "bg-gradient-to-b from-[#ff8f6b] to-[#e8343c]" : "bg-gradient-to-b from-[#ffe45c] to-[#ffb200]"}`}>
                {mode === "bomb" ? <BombIcon /> : <IslandIcon />}
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400 dot-pulse" />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <div className="hidden text-[9px] font-black uppercase tracking-wider text-[#ff6f8f] sm:block">Mode · Arena Langit · 👆 ganti</div>
                <div className="text-[13px] font-black leading-tight text-[#24364f] sm:truncate sm:text-lg">{mode === "bomb" ? "💣 LEMPAR BOM" : "BRAWL KUCING"}</div>
                <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold text-slate-500 sm:truncate sm:text-[10px]">
                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-emerald-700">● {fighters}</span>
                  <span className="rounded-full bg-sky-100 px-1.5 py-px text-sky-700">{twoPlayer ? "2P" : "1P"}</span>
                  <span className="hidden rounded-full bg-pink-100 px-1.5 py-px text-pink-700 lg:inline">{ACCESSORIES.find((a) => a.id === acc1)?.name}</span>
                </div>
              </div>
            </button>

            <JuicyButton tone="yellow" size="xl" shine glow icon={<PlayIcon />} className="flex-[1.35] px-2 !text-xl sm:px-8 sm:!text-2xl md:max-w-[280px]" onClick={start}>
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
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="text-sm font-black text-[#24364f]">🤖 Jumlah Bot</div>
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
                <div className="text-sm font-black text-[#24364f]">👥 2 Pemain</div>
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
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="text-sm font-black text-[#24364f]">📱 Kontrol Sentuh</div>
                <div className="text-[11px] font-bold text-slate-500">Joystick + tombol di layar</div>
              </div>
              <Toggle on={showTouch} tone="blue" onClick={() => setShowTouch(!showTouch)} />
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div className="text-sm font-black text-[#24364f]">📷 Mode Kamera</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">Stumble = kamera ngikut di belakang kucingmu · Gang = sudut sinematik tetap</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {([["stumble", "🏃 STUMBLE"], ["gang", "🥊 GANG BEASTS"]] as const).map(([m, label]) => (
                  <button key={m} onClick={(e) => { uiBtn(e); setCamMode(m); }} className={`press rounded-xl border-[3px] py-2 text-[12px] font-black ${camMode === m ? "border-yellow-300 bg-gradient-to-b from-[#ffe45c] to-[#ffc400] text-[#6b4100] shadow-[0_3px_0_#c98a00]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 text-sm font-black text-[#24364f]">🔍 Zoom Kamera</div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {([[0.7, "DEKAT"], [1, "NORMAL"], [1.35, "JAUH"]] as const).map(([z, label]) => (
                  <button key={z} onClick={(e) => { uiBtn(e); setCamZoom(z); }} className={`press rounded-xl border-[3px] py-1.5 text-[11px] font-black ${camZoom === z ? "border-sky-300 bg-gradient-to-b from-[#8fd8ff] to-[#41a6ff] text-[#083a66] shadow-[0_3px_0_#1b6ec2]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
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
              ["BAT", "🏏 + J", "Ambil tongkat dengan E, ayun dengan J. Bisa memukul lawan & peti."],
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
              ["🏆 Menang 1 ronde", "0/1", 40],
              ["🏏 Ayun tongkat 5 kali", "0/5", 25],
              ["🙌 Angkat lawan 3 kali", "0/3", 25],
              ["🎯 Lempar lawan keluar arena", "0/1", 50],
            ].map(([t, p, r]) => (
              <div key={t as string} className="flex items-center gap-2 rounded-2xl bg-white p-2.5 shadow-[0_3px_0_rgba(0,0,0,.08)]">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#ffe9c4] text-lg">🎯</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black text-[#24364f]">{t}</div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-0 rounded-full bg-emerald-400" /></div>
                </div>
                <span className="rounded-lg bg-yellow-300 px-2 py-1 text-[10px] font-black text-[#6b4100]">{p} · +{r} 🪙</span>
              </div>
            ))}
            <div className="text-center text-[11px] font-bold text-slate-500">Misi direset tiap hari. Mainkan ronde untuk menyelesaikannya!</div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function AccessoryIcon({ id, size = 20 }: { id: AccessoryId; size?: number }) {
  if (id === "capRed" || id === "capBlue" || id === "capNewRed" || id === "capNewBlue") {
    const isRed = id === "capRed" || id === "capNewRed";
    const isNew = id === "capNewRed" || id === "capNewBlue";
    const main = isRed ? "#e8343c" : "#2f6fe0";
    const dark = isRed ? "#a3121d" : "#1b4496";
    return (
      <Svg size={size}>
        <path d="M4 13c0-4.5 3.5-8 8-8s8 3.5 8 8" fill={isNew ? "#f7f4ee" : main} stroke={dark} strokeWidth="1.8" strokeLinejoin="round" />
        {isNew && <path d="M9 5.6C10.4 5 13.6 5 15 5.6L14.2 13H9.8L9 5.6Z" fill={main} stroke={dark} strokeWidth="1.2" strokeLinejoin="round" />}
        <path d="M3 13h18" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15 13c2.6 0 5 .7 5 1.6S18.6 16 15 16" fill={isNew ? main : "#fff"} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="5.4" r="1.1" fill={isNew ? main : "#fff"} stroke={dark} strokeWidth="1.2" />
        {isNew && <path d="m18.6 2.6.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2.7-1.5Z" fill="#ffd23f" stroke="#a36a00" strokeWidth="0.7" strokeLinejoin="round" />}
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
      <circle cx="12" cy="12" r="8" fill="#eef3fb" stroke="#b9c6db" strokeWidth="1.8" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="#b9c6db" strokeWidth="1.8" strokeLinecap="round" />
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
function CatIcon() {
  return (
    <Svg size={20}>
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
function GearIcon() {
  return (
    <Svg size={20}>
      <circle cx="12" cy="12" r="3.2" stroke="#12314f" strokeWidth="2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" stroke="#12314f" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function StarIcon() {
  return <Svg size={20}><path d="m12 3.5 2.6 5.3 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8L3.5 9.6l5.9-.8L12 3.5Z" fill="#ffd23f" stroke="#6b4100" strokeWidth="1.8" strokeLinejoin="round" /></Svg>;
}
function PeopleIcon() {
  return (
    <Svg size={20}>
      <circle cx="9" cy="9" r="3" stroke="#083a66" strokeWidth="2" /><circle cx="17" cy="10" r="2.2" stroke="#083a66" strokeWidth="2" />
      <path d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19M15 15c2 0 3.8 1.2 4.5 3.4" stroke="#083a66" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
function HelpIcon() {
  return <Svg size={20}><circle cx="12" cy="12" r="9" stroke="#5a2703" strokeWidth="2" /><path d="M9.3 9.2c.2-1.4 1.3-2.2 2.8-2.2 1.6 0 2.8 1 2.8 2.4 0 2.2-2.8 2.1-2.8 4.2" stroke="#5a2703" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.2" fill="#5a2703" /></Svg>;
}
function BotIcon() {
  return <Svg size={18}><rect x="4" y="7" width="16" height="12" rx="4" stroke="#083a66" strokeWidth="2" /><circle cx="9" cy="13" r="1.4" fill="#083a66" /><circle cx="15" cy="13" r="1.4" fill="#083a66" /><path d="M12 7V4" stroke="#083a66" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="3" r="1.3" fill="#083a66" /></Svg>;
}
function SwordsIcon() {
  return <Svg size={18}><path d="m4 4 9 9M14 4l6 6-3 3-6-6 3-3ZM4 20l6-6M3 15l6 6M18 20l3-3" stroke="#123d14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
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
