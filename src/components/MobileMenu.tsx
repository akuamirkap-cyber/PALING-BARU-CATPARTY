import { useEffect, useRef, useState } from "react";
import Portrait from "./Portrait";
import SettingsButton from "./SettingsButton";
import { ConfettiBurst, DeckTab, JuicyButton, StatPill, Toggle, uiBtn } from "./ui";
import {
  AccessoryIcon,
  BombIcon,
  BotIcon,
  CatIcon,
  ChevronIcon,
  CoinIcon,
  GearIcon,
  HatIcon,
  HelpIcon,
  IslandIcon,
  PawIcon,
  PlayIcon,
  StarIcon,
} from "./icons";
import { ACCESSORIES, ANIMALS, animalById, type AccessoryId, type AnimalId } from "../game/animals";
import { initAudio } from "../game/audio";

export type MobileSheet = "char" | "acc" | "tuning" | "settings" | "info" | "mission" | null;

interface Props {
  p1: AnimalId;
  setP1: (a: AnimalId) => void;
  acc1: AccessoryId;
  setAcc1: (a: AccessoryId) => void;
  bots: number;
  setBots: (n: number) => void;
  twoPlayer: boolean;
  showTouch: boolean;
  setShowTouch: (b: boolean) => void;
  fighters: number;
  setSheet: (s: MobileSheet) => void;
  start: () => void;
  mode: "brawl" | "bomb" | "teams";
  setMode: (m: "brawl" | "bomb" | "teams") => void;
  camMode: "stumble" | "gang";
  setCamMode: (m: "stumble" | "gang") => void;
  camZoom: number;
  setCamZoom: (z: number) => void;
}

const TIPS = [
  "Tekan E untuk angkat lawan, tekan lagi untuk lempar!",
  "Ambil tongkat baseball dengan E, ayun dengan J!",
  "Tahan K di tepi arena, lalu lompat untuk memanjat!",
  "Pukul lawan sampai pusing, lalu lempar keluar arena!",
  "Topi bisa copot kena tongkat. Helm melindungi kepala!",
];

const cleanTagline = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s{2,}/g, " ").trim();

/** deterministic fun stats per cat (1..5) */
function statsFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return {
    pukul: 2 + (h % 4),
    lari: 2 + ((h >> 3) % 4),
    gemes: 3 + ((h >> 6) % 3),
  };
}

const ACC_TONE: Record<string, string> = {
  none: "from-slate-100 to-slate-200 text-slate-500",
  capRed: "from-red-400 to-red-500 text-white",
  capBlue: "from-sky-400 to-blue-500 text-white",
  capNewRed: "from-red-400 to-red-500 text-white",
  capNewBlue: "from-sky-400 to-blue-500 text-white",
  dolit: "from-violet-400 to-purple-500 text-white",
  helmet: "from-amber-300 to-yellow-400 text-[#6b4100]",
};

export default function MobileMenu(props: Props) {
  const { p1, setP1, acc1, setAcc1, bots, setBots, showTouch, setShowTouch, fighters, setSheet, start, mode, setMode, camMode, setCamMode, camZoom, setCamZoom } = props;
  const sel = animalById(p1);
  const idx = ANIMALS.findIndex((a) => a.id === p1);
  const stats = statsFor(p1);
  const [tab, setTab] = useState<"cats" | "acc" | "setup">("cats");
  const [burst, setBurst] = useState(0);
  const starting = useRef(false);
  const touchX = useRef<number | null>(null);

  const prev = () => setP1(ANIMALS[(idx - 1 + ANIMALS.length) % ANIMALS.length].id);
  const next = () => setP1(ANIMALS[(idx + 1) % ANIMALS.length].id);

  // keep the selected cat / accessory scrolled into view
  useEffect(() => {
    document.getElementById(`mcat-${p1}`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [p1, tab]);
  useEffect(() => {
    document.getElementById(`macc-${acc1}`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [acc1, tab]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0]?.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 36) return;
    initAudio();
    if (dx < 0) next();
    else prev();
  };

  const onMain = () => {
    if (starting.current) return;
    starting.current = true;
    setBurst((b) => b + 1);
    window.setTimeout(() => {
      starting.current = false;
      start();
    }, 320);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* ===== TOP HUD ===== */}
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <button
          onClick={(e) => {
            uiBtn(e);
            setSheet("char");
          }}
          className="press flex min-w-0 items-center gap-1.5 rounded-2xl border-[3px] border-white bg-white/95 p-1 pr-2 shadow-[0_4px_0_rgba(60,90,140,.22)]"
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-yellow-300" style={{ background: sel.ui }}>
            <Portrait id={p1} fallback={sel.emoji} />
          </span>
          <span className="min-w-0 text-left leading-none">
            <span className="flex items-center gap-1 text-[11px] font-black text-[#24364f]">
              KAMU
              <span className="rounded-full bg-gradient-to-b from-[#ffe45c] to-[#ffb200] px-1 text-[8px] text-[#6b4100]">LV 12</span>
            </span>
            <span className="block max-w-[86px] truncate text-[9px] font-bold text-slate-500">{sel.name}</span>
          </span>
        </button>
        <div className="min-w-0 flex-1" />
        <StatPill icon={<CoinIcon />} value="1.250" tone="yellow" />
        <button
          onClick={(e) => {
            uiBtn(e);
            setSheet("mission");
          }}
          className="press relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-white bg-white/95 shadow-[0_4px_0_rgba(60,90,140,.22)] [&_svg]:h-5 [&_svg]:w-5"
          title="Misi"
        >
          <StarIcon />
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-white bg-[#ff3d6e] px-0.5 text-[8px] font-black text-white">
            2
          </span>
        </button>
        <button
          onClick={(e) => {
            uiBtn(e);
            setSheet("info");
          }}
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-white bg-white/95 shadow-[0_4px_0_rgba(60,90,140,.22)] [&_svg]:h-5 [&_svg]:w-5"
          title="Cara main"
        >
          <HelpIcon />
        </button>
        <SettingsButton onClick={() => setSheet("settings")} />
      </div>

      {/* ===== compact brand masthead ===== */}
      <div className="pointer-events-none relative z-20 mt-0.5 flex flex-col items-center text-center">
        <div className="relative">
          <span className="float-slow absolute -left-7 top-0 text-sm" style={{ ["--rot" as string]: "-12deg" }}>✦</span>
          <h1 className="sticker font-display text-[32px] font-black italic leading-none text-yellow-300">MEOW BRAWL</h1>
          <span className="float-slow absolute -right-6 top-1 text-sm" style={{ ["--rot" as string]: "14deg", animationDelay: "-2s" }}>✦</span>
        </div>
        <div className="mx-auto mt-1 flex w-max items-center gap-1.5 rounded-full border-2 border-white bg-white/90 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#7a4a06] shadow-[0_2px_0_rgba(122,74,6,.2)]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${mode === "bomb" ? "bg-red-500" : mode === "teams" ? "bg-sky-500" : "bg-emerald-500"} dot-pulse`} />
          {mode === "bomb" ? "Mode Bom · siap meledak!" : mode === "teams" ? "Tim 5v5 · MERAH vs BIRU!" : "Kucing meme saling gebuk!"}
        </div>
      </div>

      {/* ===== HERO STAGE (3D is behind) ===== */}
      <div className="relative min-h-0 flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* stage spotlight + soft hero halo */}
        <div className="stage-beam pointer-events-none absolute left-1/2 top-0 h-[72%] w-[62%] -translate-x-1/2 opacity-55" />
        <div className="pointer-events-none absolute bottom-[23%] left-1/2 h-7 w-[48%] -translate-x-1/2 rounded-[50%] border-2 border-white/75 bg-white/20" />
        <div className="podium-glow pointer-events-none absolute bottom-[22%] left-1/2 h-9 w-[43%] -translate-x-1/2 rounded-[50%] bg-yellow-200/75 blur-xl" />
        {/* side arrows */}
        <button
          onClick={(e) => {
            uiBtn(e);
            prev();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="press arrow-l absolute left-1.5 top-[31%] z-30 grid h-11 w-11 place-items-center rounded-2xl border-[3px] border-white bg-gradient-to-b from-[#fff8d6] to-[#ffc83f] shadow-[0_5px_0_#c98a00,0_8px_16px_rgba(60,90,140,.2)]"
          aria-label="Kucing sebelumnya"
        >
          <ChevronIcon dir={-1} />
        </button>
        <button
          onClick={(e) => {
            uiBtn(e);
            next();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="press arrow-r absolute right-1.5 top-[31%] z-30 grid h-11 w-11 place-items-center rounded-2xl border-[3px] border-white bg-gradient-to-b from-[#fff8d6] to-[#ffc83f] shadow-[0_5px_0_#c98a00,0_8px_16px_rgba(60,90,140,.2)]"
          aria-label="Kucing berikutnya"
        >
          <ChevronIcon dir={1} />
        </button>
        {/* stage color accents */}
        <span className="float-slow pointer-events-none absolute left-[14%] top-[20%] text-base text-white drop-shadow" style={{ ["--rot" as string]: "-12deg" }}>✦</span>
        <span className="float-slow pointer-events-none absolute right-[15%] top-[23%] text-lg text-yellow-300 drop-shadow" style={{ ["--rot" as string]: "10deg", animationDelay: "-2s" }}>★</span>

        {/* hero card */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3">
          <button
            key={p1}
            onClick={(e) => {
              uiBtn(e);
              setSheet("char");
            }}
            className="hero-pop pointer-events-auto relative w-full max-w-[350px] overflow-hidden rounded-[22px] border-[3px] border-white bg-gradient-to-br from-white/98 via-[#fffaf0] to-[#fff0cf] p-2 text-left shadow-[0_6px_0_rgba(122,74,6,.14),0_13px_22px_rgba(50,70,120,.2)] backdrop-blur"
            style={{ boxShadow: `0 7px 0 rgba(122,74,6,.14),0 15px 26px rgba(50,70,120,.22),0 0 0 3px ${sel.ui}44` }}
          >
            <div className="absolute right-0 top-0 h-9 w-14 rounded-bl-[24px] bg-gradient-to-bl from-yellow-200/70 to-transparent" />
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 rounded-full bg-[#fff0d1] px-2 py-0.5 text-[7px] font-black uppercase tracking-[.12em] text-[#bd6a32]">✦ fighter pilihan</span>
              <span className="rounded-full border border-white bg-white/80 px-2 py-0.5 text-[7px] font-black tabular-nums text-slate-400">{String(idx + 1).padStart(2, "0")} / {String(ANIMALS.length).padStart(2, "0")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl border-[3px] border-yellow-300 shadow-[0_3px_0_#d9a92e]" style={{ background: sel.ui }}>
                <Portrait id={p1} fallback={sel.emoji} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-display text-[18px] font-black leading-tight text-[#24364f]">{sel.name}</span>
                  <span className="shrink-0 rounded-full bg-gradient-to-b from-[#ffe45c] to-[#ffb200] px-1.5 py-px text-[7px] font-black uppercase text-[#6b4100]">Kamu</span>
                </span>
                <span className="block truncate text-[9px] font-bold text-slate-500">{cleanTagline(sel.tagline)}</span>
                <span className="mt-0.5 flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={`text-[9px] leading-none ${i < 3 + (idx % 3) ? "text-yellow-400 drop-shadow" : "text-slate-200"}`}>
                      ★
                    </span>
                  ))}
                  <span className="ml-1 text-[7px] font-black uppercase tracking-wide text-slate-400">fighter</span>
                </span>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border-2 border-slate-100 bg-white shadow-[inset_0_-3px_0_rgba(0,0,0,.08)]">
                <AccessoryIcon id={acc1} size={22} />
              </span>
            </div>
            {/* stats */}
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {[
                ["PUKUL", stats.pukul, "from-[#ffb3d4] to-[#ff6fab]"],
                ["LARI", stats.lari, "from-[#8fd8ff] to-[#41a6ff]"],
                ["GEMES", stats.gemes, "from-[#b9f5a8] to-[#5fd65a]"],
              ].map(([label, val, grad]) => (
                <div key={label as string} className="rounded-lg border border-white bg-gradient-to-b from-white to-[#e9eff8] px-1.5 py-0.5">
                  <div className="flex items-center justify-between text-[6px] font-black tracking-wider text-slate-500"><span>{label}</span><span>{val}/5</span></div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${(Number(val) / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </button>
        </div>
      </div>

      {/* ===== TIPS marquee ===== */}
      <div className="relative z-20 mx-2 overflow-hidden rounded-full border-2 border-white/90 bg-gradient-to-r from-[#4d5983]/90 via-[#657298]/85 to-[#4d5983]/90 py-1.5 shadow-[0_3px_0_rgba(40,50,90,.18)] backdrop-blur">
        <div className="tips-marquee flex w-max items-center gap-8 whitespace-nowrap px-4 text-[10px] font-black text-white drop-shadow">
          {[...TIPS, ...TIPS].map((t, i) => (
            <span key={i} className="flex items-center gap-1.5">
          <span className="text-yellow-300">✦</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* ===== BOTTOM DECK ===== */}
      <div className="px-2 pb-1 pt-1.5" style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
        <div className="rounded-[24px] border-4 border-white bg-[#fff8ee]/97 p-2 shadow-[0_10px_0_rgba(122,74,6,.16),0_18px_30px_rgba(50,70,120,.28)] backdrop-blur-md">
          {/* tabs */}
          <div className="flex gap-1.5">
            <DeckTab active={tab === "cats"} icon={<CatIcon />} label="KUCING" tone="mint" onClick={() => setTab("cats")} />
            <DeckTab active={tab === "acc"} icon={<HatIcon />} label="AKSESORIS" tone="pink" onClick={() => setTab("acc")} />
            <DeckTab active={tab === "setup"} icon={<GearIcon />} label="SETELAN" tone="blue" onClick={() => setTab("setup")} badge={bots} />
          </div>

          {/* tab content (fixed height so the 3D stage never jumps when switching tabs) */}
          <div className={`mt-1.5 ${tab === "setup" ? "h-auto" : "h-[122px]"}`}>
          {tab === "cats" && (
            <div className="tab-slide h-full">
              <div className="no-sb snap-row flex h-full items-center gap-2 overflow-x-auto px-2 pb-1 pt-1">
                {ANIMALS.map((a) => {
                  const on = p1 === a.id;
                  return (
                    <button
                      id={`mcat-${a.id}`}
                      key={a.id}
                      onClick={(e) => {
                        uiBtn(e);
                        setP1(a.id);
                      }}
                      className={`press-card relative grid shrink-0 place-items-center overflow-hidden rounded-[19px] border-[3px] ${
                        on ? "z-10 -translate-y-1 scale-[1.12] border-yellow-300 ring-pulse" : "border-white shadow-[0_4px_0_rgba(0,0,0,.14)]"
                      }`}
                      style={{ width: on ? 72 : 56, height: on ? 86 : 68 }}
                    >
                      <span className="absolute inset-0" style={{ background: `linear-gradient(180deg,${a.ui} 0%,${a.ui} 60%,rgba(0,0,0,.22) 100%)` }} />
                      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent" />
                      <span className="relative h-full w-full p-1">
                        <Portrait id={a.id} fallback={a.emoji} />
                      </span>
                      <span
                        className={`absolute inset-x-0 bottom-0 truncate px-0.5 py-px text-center text-[7px] font-black uppercase tracking-wide ${
                          on ? "bg-yellow-300/95 text-[#6b4100]" : "bg-black/40 text-white"
                        }`}
                      >
                        {a.name}
                      </span>
                      {on && <span className="absolute right-0.5 top-0.5 text-[11px] drop-shadow">⭐</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "acc" && (
            <div className="tab-slide no-sb flex h-full items-center gap-1.5 overflow-x-auto px-0.5 pb-1">
              {ACCESSORIES.map((a) => {
                const on = acc1 === a.id;
                return (
                  <button
                    id={`macc-${a.id}`}
                    key={a.id}
                    onClick={(e) => {
                      uiBtn(e);
                      setAcc1(a.id);
                    }}
                    className={`press-card flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-2xl border-[3px] p-1.5 ${
                      on ? "border-yellow-300 bg-gradient-to-b from-[#fff6d8] to-[#ffe9a8] shadow-[0_4px_0_#c98a00]" : "border-white bg-white shadow-[0_3px_0_rgba(0,0,0,.12)]"
                    }`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b shadow-[inset_0_-3px_0_rgba(0,0,0,.12)] ${ACC_TONE[a.id]}`}>
                      <AccessoryIcon id={a.id} size={26} />
                    </span>
                    <span className="text-[9px] font-black leading-tight text-[#24364f]">{a.name}</span>
                    <span className={`rounded-full px-1.5 text-[7px] font-black uppercase ${on ? "bg-yellow-400 text-[#6b4100]" : "bg-slate-100 text-slate-400"}`}>
                      {on ? "✔ dipakai" : "pakai"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "setup" && (
            <div className="tab-slide flex h-full flex-col justify-center gap-1.5 px-0.5">
              <div className="flex items-center justify-between rounded-2xl bg-white px-2.5 py-1.5 shadow-[0_3px_0_rgba(0,0,0,.1)]">
                <span className="flex items-center gap-1.5 text-[12px] font-black text-[#24364f]">
                  <BotIcon /> Bot lawan
                </span>
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      uiBtn(e);
                      setBots(Math.max(1, bots - 1));
                    }}
                    className="press grid h-8 w-8 place-items-center rounded-xl bg-[#ffe9c4] text-base font-black text-[#7a4a06] shadow-[0_3px_0_#e8b96a]"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-base font-black tabular-nums text-[#24364f]">{bots}</span>
                  <button
                    onClick={(e) => {
                      uiBtn(e);
                      setBots(Math.min(7, bots + 1));
                    }}
                    className="press grid h-8 w-8 place-items-center rounded-xl bg-[#c9f7c1] text-base font-black text-[#1d5a1f] shadow-[0_3px_0_#78c96a]"
                  >
                    +
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-1 items-center justify-between rounded-2xl bg-white px-2.5 py-1.5 shadow-[0_3px_0_rgba(0,0,0,.1)]">
                  <span className="text-[11px] font-black text-[#24364f]">📱 Sentuh</span>
                  <Toggle on={showTouch} tone="blue" onClick={() => setShowTouch(!showTouch)} />
                </div>
                <button
                  onClick={(e) => {
                    uiBtn(e);
                    setSheet("tuning");
                  }}
                  className="press flex-1 rounded-2xl border-[3px] border-white bg-gradient-to-b from-[#8fd8ff] to-[#41a6ff] py-2 text-[11px] font-black text-[#083a66] shadow-[0_3px_0_#1b6ec2]"
                >
                  🎛️ BENTUK
                </button>
                <button
                  onClick={(e) => {
                    uiBtn(e);
                    setSheet("info");
                  }}
                  className="press flex-1 rounded-2xl border-[3px] border-white bg-gradient-to-b from-[#ffc182] to-[#ff8f3c] py-2 text-[11px] font-black text-[#5a2703] shadow-[0_3px_0_#c25a12]"
                >
                  ❔ INFO
                </button>
              </div>
              <div className="rounded-2xl bg-white px-2.5 py-1.5 shadow-[0_3px_0_rgba(0,0,0,.1)]">
                <div className="text-[11px] font-black text-[#24364f]">📷 Kamera</div>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {([["stumble", "🏃 STUMBLE"], ["gang", "🥊 GANG"]] as const).map(([m, label]) => (
                    <button key={m} onClick={(e) => { uiBtn(e); setCamMode(m); }} className={`press rounded-lg border-2 py-1.5 text-[10px] font-black ${camMode === m ? "border-yellow-300 bg-gradient-to-b from-[#ffe45c] to-[#ffc400] text-[#6b4100]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {([[0.7, "DEKAT"], [1, "NORMAL"], [1.35, "JAUH"]] as const).map(([z, label]) => (
                    <button key={z} onClick={(e) => { uiBtn(e); setCamZoom(z); }} className={`press rounded-lg border-2 py-1 text-[9px] font-black ${camZoom === z ? "border-sky-300 bg-gradient-to-b from-[#8fd8ff] to-[#41a6ff] text-[#083a66]" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      🔍 {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>

          {/* action row */}
          <div className="mt-1 flex items-stretch gap-1.5">
            <button
              onClick={(e) => {
                uiBtn(e);
                setMode(mode === "brawl" ? "bomb" : mode === "bomb" ? "teams" : "brawl");
              }}
              title="Ketuk untuk ganti mode"
              className="press flex min-w-[92px] flex-col items-center justify-center gap-0.5 rounded-2xl border-[3px] border-white bg-gradient-to-b from-white to-[#dff3ff] px-1.5 py-1 shadow-[0_4px_0_rgba(60,90,140,.2)]"
            >
              <span className={`grid h-7 w-7 place-items-center overflow-hidden rounded-lg shadow-[inset_0_-2px_0_rgba(0,0,0,.15)] [&_svg]:h-6 [&_svg]:w-6 ${mode === "bomb" ? "bg-gradient-to-b from-[#ff8f6b] to-[#e8343c]" : mode === "teams" ? "bg-gradient-to-b from-[#ff8a8a] to-[#7da8ff]" : "bg-gradient-to-b from-[#ffe45c] to-[#ffb200]"}`}>
                {mode === "bomb" ? <BombIcon /> : mode === "teams" ? "🚩" : <IslandIcon />}
              </span>
              <span className="text-[8px] font-black uppercase leading-none tracking-wide text-[#ff6f8f]">{mode === "bomb" ? "💣 Mode Bom" : mode === "teams" ? "🚩 Tim 5v5" : "Brawl 👆"}</span>
              <span className="flex items-center gap-1 text-[9px] font-black text-[#24364f]">
                <PawIcon /> {fighters} <span className="text-slate-400">·</span> {bots}🤖
              </span>
            </button>
            <div className="relative min-w-0 flex-1">
              <ConfettiBurst burstKey={burst} />
              <JuicyButton tone="yellow" size="lg" shine glow icon={<PlayIcon />} block className="!h-full min-h-[64px] !text-[26px]" onClick={onMain}>
                MAIN!
              </JuicyButton>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

