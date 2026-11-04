import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MenuScreen, { type MenuSheet } from "./components/MenuScreen";
import MatchLobby from "./components/MatchLobby";
import GameViewer from "./components/GameViewer";
import ScreenWipe, { type WipeHandle } from "./components/ScreenWipe";
import ErrorBoundary from "./components/ErrorBoundary";
import EyePreview from "./components/EyePreview";
import GameView from "./components/GameView";
import Portrait from "./components/Portrait";
import TuningPanel from "./components/TuningPanel";
import { JuicyButton, Sheet, Toggle, TONES, uiBtn } from "./components/ui";
import { Cat, Eye, Gamepad2, Smile } from "lucide-react";
import { ACCESSORIES, ANIMALS, animalById, type AccessoryId, type AnimalId } from "./game/animals";
import { EYE_STYLES, EXPRESSIONS, type EyeStyleId, type ExpressionId } from "./game/eyes";
import { initAudio } from "./game/audio";
import { hasPortrait, resetPortraitsForCurrentTuning, storeWorkerPortrait } from "./game/portraits";
import { preloadCharacters } from "./game/characterPreload";
import { disposePortraitFallback, renderPortraitFallback } from "./game/portraitFallback";
import { setShapeMode, tuningKey, useShapeMode, useTuning } from "./game/tuning";

type Screen = "menu" | "matching" | "game" | "games-view";
type SheetId = MenuSheet | null;

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [p1, setP1] = useState<AnimalId>("oyen");
  const [p2, setP2] = useState<AnimalId>("item");
  const [acc1, setAcc1] = useState<AccessoryId>("capNewRed");
  const [eyes, setEyes] = useState<EyeStyleId>("default");
  const [expression, setExpression] = useState<ExpressionId>("default");
  const [faceTab, setFaceTab] = useState<"eyes" | "expression">("eyes");
  const [acc2, setAcc2] = useState<AccessoryId>("capNewBlue");
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [bots, setBots] = useState(5);
  const [mode, setMode] = useState<"brawl" | "bomb" | "teams">("brawl");
  const matchBots = mode === "teams" ? (twoPlayer ? 8 : 9) : bots;
  const [camMode, setCamMode] = useState<"stumble" | "gang">(() => (localStorage.getItem("mb.camMode") === "stumble" ? "stumble" : "gang"));
  const [camZoom, setCamZoom] = useState<number>(() => {
    const z = parseFloat(localStorage.getItem("mb.camZoom") ?? "1");
    return [0.7, 1, 1.35].includes(z) ? z : 1;
  });
  useEffect(() => {
    localStorage.setItem("mb.camMode", camMode);
    localStorage.setItem("mb.camZoom", String(camZoom));
  }, [camMode, camZoom]);
  const isTouchDevice = useMemo(() =>
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches === true),
  []);
  const [showTouch, setShowTouch] = useState(isTouchDevice);
  // Page sweep: on by default (it is part of the menu look), calm fade optional.
  const [wipeMode, setWipeMode] = useState<"full" | "calm">(() => (localStorage.getItem("mb.wipeMode") === "calm" ? "calm" : "full"));
  useEffect(() => {
    localStorage.setItem("mb.wipeMode", wipeMode);
  }, [wipeMode]);
  const [gameKey, setGameKey] = useState(0);
  const [bundled, setBundled] = useState<{ path: string; name: string } | null>(null);
  const [sheet, setSheet] = useState<SheetId>(null);

  const wipe = useRef<WipeHandle>(null);
  /** Swap screens behind the page-wipe transition. */
  const go = useCallback((dest: Screen, sheetAfter: SheetId = null) => {
    initAudio();
    void wipe.current?.play(dest, () => {
      if (dest === "game") setGameKey((k) => k + 1);
      setScreen(dest);
      setSheet(sheetAfter);
    });
  }, []);
  const start = useCallback(() => go("matching"), [go]);

  const tKey = tuningKey(useTuning());
  const shapeMode = useShapeMode();
  useEffect(() => {
    // Generate full-detail portraits and reusable body meshes in a worker so
    // the menu stays responsive instead of repeatedly blocking the main thread.
    if (screen !== "menu" || sheet === "tuning" || sheet === "eyes") return;
    resetPortraitsForCurrentTuning();
    const controller = new AbortController();
    const seen = new Set<string>();
    const ordered = [
      { id: p1, noEars: false, portrait: { eyeStyle: eyes, expression } },
      ...ANIMALS.map(def => ({ id: def.id, noEars: false, portrait: { eyeStyle: "default" as const, expression: "default" as const } })),
    ].filter(job => {
      const key = `${job.id}:${job.portrait.eyeStyle}:${job.portrait.expression}`;
      if (seen.has(key) || hasPortrait(job.id, job.portrait.eyeStyle, job.portrait.expression)) return false;
      seen.add(key);
      return true;
    });
    // A failed/unsupported worker leaves the existing emoji fallbacks intact.
    const timer = window.setTimeout(() => {
      void preloadCharacters(ordered, { signal: controller.signal, onPortrait: result => {
        if (result.portrait) storeWorkerPortrait(result);
        else renderPortraitFallback(result);
      }, delayMs: 120 }).catch(() => {}).finally(disposePortraitFallback);
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tKey, screen, p1, eyes, expression, sheet]);

  useEffect(() => {
    if (screen !== "menu") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const sel = animalById(p1);

  return (
    <>
      {screen === "games-view" && bundled ? (
        <ErrorBoundary key="games-view" label="games-view" onReset={() => go("menu")}>
          <div className="contents">
            <GameViewer path={bundled.path} name={bundled.name} onExit={() => go("menu")} />
          </div>
        </ErrorBoundary>
      ) : screen === "game" ? (
        <ErrorBoundary key="arena" label="arena" onReset={() => go("menu")}>
        <GameView
          key={gameKey}
          options={{ p1Animal: p1, p2Animal: p2, twoPlayer, bots: matchBots, p1Acc: acc1, p2Acc: acc2, p1Eyes: eyes, p1Expression: expression, mode, camMode, camZoom }}
          showTouch={showTouch && !twoPlayer}
          onExit={() => go("menu")}
        />
        </ErrorBoundary>
      ) : screen === "matching" ? (
        <ErrorBoundary key="matching" label="matching" onReset={() => setScreen("menu")}>
        <MatchLobby
          you={{ animal: p1, accessory: acc1, eyeStyle: eyes, expression }}
          friend={twoPlayer ? { animal: p2, accessory: acc2 } : null}
          bots={matchBots}
          mode={mode}
          onChangeAnimal={(step) => setP1((cur) => {
            const i = ANIMALS.findIndex((a) => a.id === cur);
            return ANIMALS[(i + step + ANIMALS.length) % ANIMALS.length].id;
          })}
          onPickAnimal={(id) => setP1(id)}
          onWardrobe={() => go("menu", "acc")}
          onCancel={() => go("menu")}
          onStart={() => go("game")}
        />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary key="menu" label="menu">
          <MenuScreen
            selected={p1}
            accessory={acc1}
            eyeStyle={eyes}
            expression={expression}
            mode={mode}
            bots={matchBots}
            twoPlayer={twoPlayer}
            active={sheet === null}
            onPlay={start}
            onOpenSheet={(next) => setSheet(next)}
            onBundledGame={(path, name) => {
              setBundled({ path, name });
              go("games-view");
            }}
            onMode={setMode}
            onBots={setBots}
            onTwoPlayer={setTwoPlayer}
            onSelectAnimal={(step) => setP1((cur) => {
              const i = ANIMALS.findIndex((a) => a.id === cur);
              return ANIMALS[(i + step + ANIMALS.length) % ANIMALS.length].id;
            })}
          />
        </ErrorBoundary>
      )}
      {/* the page wipe stays mounted so it can cover the screen swap */}
      <ScreenWipe handleRef={wipe} mode={wipeMode} />
      {/* ---------- sheets ---------- */}
      {sheet === "char" && (
        <Sheet title="Pilih Kucing" icon={<CatIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>PILIH {sel.name.toUpperCase()}</JuicyButton>}>
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
        <Sheet title="Aksesoris" icon={<HatIcon />} onClose={() => setSheet(null)} footer={<div className="text-center text-[11px] font-bold text-slate-500">Topi, topeng & hidung badut bisa copot kalau kena pukulan tongkat. Helm mengurangi damage kepala.</div>}>
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

      {sheet === "eyes" && (
        <Sheet title="Mata & Ekspresi" icon={<Eye size={22} />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>SELESAI</JuicyButton>}>
          <div className="eye-sheet">
            <div className="eye-preview-wrap">
              <EyePreview animal={p1} accessory={acc1} eyeStyle={eyes} expression={expression} />
              <span className="eye-preview-label">{sel.name} · {EYE_STYLES.find(s => s.id === eyes)?.name} · {EXPRESSIONS.find(s => s.id === expression)?.name}</span>
            </div>
            <p className="eye-sheet-hint">Padukan mata dan ekspresi sesukamu. Gaya asli tetap jadi pilihan awal.</p>
            <div className="face-tabs" role="group" aria-label="Kategori wajah">
              <button type="button" aria-pressed={faceTab === "eyes"} onClick={() => setFaceTab("eyes")}><Eye size={16} /> Mata</button>
              <button type="button" aria-pressed={faceTab === "expression"} onClick={() => setFaceTab("expression")}><Smile size={16} /> Ekspresi</button>
            </div>
            {faceTab === "eyes" ? (
              <div className="eye-options" role="group" aria-label="Pilihan bentuk mata">
                {EYE_STYLES.map(style => (
                  <button type="button" key={style.id} aria-pressed={eyes === style.id} className={`eye-option ${eyes === style.id ? "is-selected" : ""}`} onClick={(e) => { uiBtn(e); setEyes(style.id); }}>
                    <EyeSample style={style.id} />
                    <span><strong>{style.name}</strong><small>{style.description}</small></span>
                    {eyes === style.id && <span className="eye-check" aria-label="Dipilih">✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="eye-options" role="group" aria-label="Pilihan ekspresi">
                {EXPRESSIONS.map(style => (
                  <button type="button" key={style.id} aria-pressed={expression === style.id} className={`eye-option ${expression === style.id ? "is-selected" : ""}`} onClick={(e) => { uiBtn(e); setExpression(style.id); }}>
                    <ExpressionSample style={style.id} />
                    <span><strong>{style.name}</strong><small>{style.description}</small></span>
                    {expression === style.id && <span className="eye-check" aria-label="Dipilih">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Sheet>
      )}

      {sheet === "tuning" && (
        <Sheet title="Atur Bentuk Kucing" icon={<GearIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="mint" size="lg" block onClick={() => setSheet(null)}>SELESAI</JuicyButton>}>
          <div className="shape-sheet">
            <div className="shape-preview-wrap">
              <EyePreview animal={p1} accessory={acc1} eyeStyle={eyes} expression={expression} framing="body" revision={tKey} />
              <span className="shape-preview-label">{sel.name} · {shapeMode === "figure" ? "Figur Bulat" : "Bentuk Lama"}</span>
            </div>
            <p className="shape-hint">Pilih versi bentuk. Corak, mata, dan ekspresi tetap sama.</p>
            <div className="shape-options" role="group" aria-label="Versi bentuk kucing">
              <button type="button" aria-pressed={shapeMode === "classic"} className={shapeMode === "classic" ? "is-selected" : ""} onClick={(e) => { uiBtn(e); setShapeMode("classic"); }}>
                <span className="shape-option-icon">◯</span><span><strong>Bentuk Lama</strong><small>Proporsi yang sekarang</small></span>{shapeMode === "classic" && <b>✓</b>}
              </button>
              <button type="button" aria-pressed={shapeMode === "figure"} className={shapeMode === "figure" ? "is-selected" : ""} onClick={(e) => { uiBtn(e); setShapeMode("figure"); }}>
                <span className="shape-option-icon shape-option-figure">✦</span><span><strong>Figur Bulat</strong><small>Terinspirasi gambar 1</small></span>{shapeMode === "figure" && <b>✓</b>}
              </button>
            </div>
            <p className="shape-note">Versi bentuk berlaku untuk semua kucing di menu dan pertandingan.</p>
            <details className="shape-advanced">
              <summary>Atur proporsi lebih lanjut</summary>
              <TuningPanel inline />
            </details>
          </div>
        </Sheet>
      )}

      {sheet === "settings" && (
        <Sheet title="Setelan Pertandingan" icon={<GearIcon />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>SIMPAN</JuicyButton>}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-[0_3px_0_rgba(0,0,0,.1)]">
              <div>
                <div className="text-sm font-black text-[#24364f]">🤖 Jumlah Bot</div>
                <div className="text-[11px] font-bold text-slate-500">{mode === "teams" ? "Mode 5v5: tim dibagi otomatis 5 lawan 5" : "Lawan komputer di arena"}</div>
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
                <div className="text-sm font-black text-[#24364f]">🎬 Animasi Ganti Halaman</div>
                <div className="text-[11px] font-bold text-slate-500">Panel menyapu layar + badge halaman</div>
              </div>
              <Toggle on={wipeMode === "full"} tone="blue" onClick={() => setWipeMode(wipeMode === "full" ? "calm" : "full")} />
            </div>
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
              ["E", "E", "Angkat / lempar. Dekati musuh bersenjata untuk rebut: tekan 3× cepat!"],
              ["K", "K", "Angkat lawan ke atas kepala; tekan K lagi untuk melempar. K juga untuk bergantung di tepi arena."],
              ["BAT", "🏏 + J", "Ambil tongkat dengan E, ayun dengan J. Bisa memukul lawan & peti."],
              ["L", "L", "Lompat menerjang ke arah gerak; bisa dipakai di darat maupun udara."],
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
            <div className="rounded-2xl bg-[#e9f6ff] p-3 text-[11px] font-bold text-[#083a66]">P2: panah · Num0/Enter lompat · Num1 pukul · Num2 angkat/lempar · Num3 terjang · Num4 angkat/rebut · RShift lari.</div>
          </div>
        </Sheet>
      )}

      {sheet === "games" && (
        <Sheet title="Game Lain di Repo Ini" icon={<Gamepad2 size={22} />} onClose={() => setSheet(null)} footer={<JuicyButton tone="yellow" size="lg" block onClick={() => setSheet(null)}>MANTAP!</JuicyButton>}>
          <div className="space-y-2">
            {[
              {
                href: "/games/cruise-ship/index.html",
                emoji: "🚢",
                name: "Kapal Pesiar & Arena Jelly (Gang Beasts)",
                desc: "gang-beasts-cruise-ship-asset (1).zip: arena bowling 3D realtime, stadion terapung & kapal pesiar di laguna.",
                tint: "#bbf7d0",
                green: true,
                badge: "BARU",
              },
              {
                href: "/games/fishing-party/index.html",
                emoji: "🎣",
                name: "Party Cats — Minigame Mancing & Balap",
                desc: "physics-based-fishing-minigame (1).zip: minigame kucing mancing ikan, gokart, pesawat & bom arena.",
                tint: "#bbf7d0",
                green: true,
                badge: "BARU",
              },
              { href: "/games/gameplay-1/index.html", emoji: "🐈", name: "Gameplay Fisika — Versi Asli", desc: "animal-party-physics-gameplay.zip: arena Animal Party versi pertama.", tint: "#ffe9c4" },
              { href: "/games/gameplay-2/index.html", emoji: "💣", name: "Gameplay Fisika — Versi Bom & Bot", desc: "animal-party-physics-gameplay (1).zip: turunan dengan uji bom, bot & aksesoris.", tint: "#e9f6ff" },
              { href: "/games/cat-asset/index.html", emoji: "🎨", name: "Studio Aset 3D — Oyen & Siam", desc: "create-3d-asset-without-hat.zip: pembentuk aset kucing 3D (referensi bentuk).", tint: "#ffe4f1" },
              { href: "/games/menu-balls/index.html", emoji: "🔴", name: "Menu Bola Glossy (Bounce Paws)", desc: "3d-game-main-menu-design (1).zip: main menu bola kucing 3D dengan toko & loker.", tint: "#fff0d4" },
              { href: "/games/menu-layout/index.html", emoji: "🟧", name: "Menu Layout (Ball Party)", desc: "3d-game-menu-layout.zip: lobi panggung kucing melompat & transisi iris.", tint: "#ffeadb" },
            ].map((g) => (
              <button
                key={g.href}
                type="button"
                onClick={(e) => {
                  uiBtn(e);
                  setSheet(null);
                  setBundled({ path: g.href, name: g.name.split("—")[0].split("(")[0].trim() });
                  go("games-view");
                }}
                className={`press flex w-full items-center gap-3 rounded-2xl p-3 text-left active:translate-y-0.5 ${
                  g.green
                    ? "bg-gradient-to-r from-emerald-50 to-green-100 border-2 border-emerald-500 shadow-[0_4px_0_#15803d,0_0_12px_rgba(34,197,94,0.28)]"
                    : "bg-white shadow-[0_4px_0_rgba(0,0,0,.12)]"
                }`}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: g.tint }}>{g.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`block text-[13px] font-black ${g.green ? "text-emerald-950" : "text-[#24364f]"}`}>{g.name}</span>
                    {g.badge && (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-sm">
                        {g.badge}
                      </span>
                    )}
                  </span>
                  <span className={`block text-[11px] font-bold leading-snug ${g.green ? "text-emerald-800" : "text-slate-500"}`}>{g.desc}</span>
                </span>
                <span className={`rounded-xl px-3 py-1.5 text-[12px] font-black shadow-[0_2px_0] ${
                  g.green
                    ? "bg-emerald-500 text-white shadow-[#166534]"
                    : "bg-[#c9f7c1] text-[#1d5a1f] shadow-[#78c96a]"
                }`}>
                  ▶ BUKA
                </span>
              </button>
            ))}
            <div className="rounded-2xl bg-[#e9f6ff] p-3 text-[11px] font-bold text-[#083a66]">Semuanya dibangun dari ZIP di repo ini dan dibuka di dalam aplikasi — tekan ‹ MENU atau Esc untuk kembali.</div>
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
    </>
  );
}

function AccessoryIcon({ id, size = 20 }: { id: AccessoryId; size?: number }) {
  if (id === "capRed" || id === "capBlue" || id === "capNewRed" || id === "capNewBlue") {
    const isRed = id === "capRed" || id === "capNewRed";
    const main = isRed ? "#e8343c" : "#2f6fe0";
    const dark = isRed ? "#a3121d" : "#1b4496";
    return (
      <Svg size={size}>
        <path d="M4 13c0-4.5 3.5-8 8-8s8 3.5 8 8" fill={main} stroke={dark} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 13h18" stroke={dark} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M15 13c2.6 0 5 .7 5 1.6S18.6 16 15 16" fill={main} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="5.4" r="1.1" fill={main} stroke={dark} strokeWidth="1.2" />
      </Svg>
    );
  }
  if (id === "crown") {
    return (
      <Svg size={size}>
        <path d="M4 17 3 8l5 3 4-5 4 5 5-3-1 9Z" fill="#ffc53d" stroke="#8a5b00" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="13.5" r="1.6" fill="#e23a5a" stroke="#8a1430" strokeWidth="1" />
        <path d="M4 18.5h16" stroke="#8a5b00" strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  if (id === "shades") {
    return (
      <Svg size={size}>
        <path d="M3 9h18" stroke="#16141a" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="4.2" y="9" width="6.8" height="5.6" rx="2.4" fill="#16141a" stroke="#000" strokeWidth="1" />
        <rect x="13" y="9" width="6.8" height="5.6" rx="2.4" fill="#16141a" stroke="#000" strokeWidth="1" />
        <path d="M6.2 10.6c1.4-.8 2.6-.8 3.4 0" stroke="#9fb4c8" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M15 10.6c1.4-.8 2.6-.8 3.4 0" stroke="#9fb4c8" strokeWidth="1.2" strokeLinecap="round" />
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

function EyeSample({ style }: { style: EyeStyleId }) {
  if (style === "default") return <span className="eye-sample eye-sample-default"><Cat size={24} /></span>;
  return <span className={`eye-sample eye-sample-${style}`} aria-hidden="true"><svg viewBox="0 0 60 36" width="52" height="32">{[16, 44].map(x => <g key={x}>
    <ellipse cx={x} cy="18" rx="11" ry="12" fill={style === "grumpy" ? "#83dfc9" : style === "green" ? "#141b1b" : style === "goofy" ? "#fff9f3" : "#ffd35c"} stroke="#2b2324" strokeWidth="2.5"/>
    {style === "green" ? <><path d={`M${x-7} 20 Q${x-5} 29 ${x} 29 Q${x+6} 29 ${x+8} 20 Q${x+5} 26 ${x} 26 Q${x-4} 26 ${x-7} 20Z`} fill="#a8ec91"/><circle cx={x-2} cy="12" r="2" fill="white"/></> : <><ellipse cx={x} cy={style === "grumpy" ? 20 : 18} rx={style === "round" || style === "goofy" ? 7 : 3} ry={style === "grumpy" ? 7 : 9} fill="#252126"/>{(style === "round" || style === "goofy") && <circle cx={x-2.5} cy="13" r="2.2" fill="white"/>}</>}
    {style === "grumpy" && <><path d={`M${x-12} 17 Q${x} 14 ${x+12} 17 L${x+12} 4 L${x-12} 4Z`} fill="#e1faf3"/><path d={`M${x-12} 17 Q${x} 14 ${x+12} 17`} fill="none" stroke="#2b2324" strokeWidth="3" strokeLinecap="round"/></>}
  </g>)}</svg></span>;
}
function ExpressionSample({ style }: { style: ExpressionId }) {
  if (style === "default") return <span className="eye-sample"><Cat size={24} /></span>;
  return <span className="eye-sample" aria-hidden="true"><svg viewBox="0 0 48 40" width="44" height="38">
    <path d="M20 10 Q24 16 28 10Z" fill="#d88388"/>
    {style === "grumpy" ? <path d="M9 32 Q24 12 39 32" fill="none" stroke="#78504a" strokeWidth="3" strokeLinecap="round"/> : <><ellipse cx="24" cy="24" rx="13" ry="9" fill="#542d34"/><path d="M17 23 Q24 21 31 23 L31 31 Q30 38 24 38 Q18 38 17 31Z" fill="#ed8d9b" stroke="#a65b69" strokeWidth="1.5"/><path d="M24 26v6" stroke="#ba6876" strokeWidth="1.5" strokeLinecap="round"/></>}
  </svg></span>;
}
