import { useEffect, useRef, useState } from "react";
import { Game, type GameOptions, type HudState } from "../game/Game";
import TouchControls from "./TouchControls";
import { initAudio } from "../game/audio";
import Portrait from "./Portrait";

interface Props {
  options: Omit<GameOptions, "onHud">;
  showTouch: boolean;
  onExit: () => void;
}

export default function GameView({ options, showTouch, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const [camMode, setCamMode] = useState(options.camMode);
  const [camZoom, setCamZoom] = useState(options.camZoom);

  useEffect(() => {
    const g = new Game(mountRef.current!, { ...options, onHud: setHud });
    gameRef.current = g;
    const t = setTimeout(() => setShowHelp(false), 9000);
    return () => {
      clearTimeout(t);
      g.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.setCam(camMode, camZoom);
  }, [camMode, camZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      initAudio();
      if (e.code === "Enter" && hud?.phase === "roundEnd") gameRef.current?.nextRound();
      if (e.code === "Escape") onExit();
      if (e.code === "KeyH") setShowHelp((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hud?.phase, onExit]);

  const me = hud?.players.find((p) => p.slot === 1);
  const p2 = hud?.players.find((p) => p.slot === 2);
  const lowTime = hud && hud.phase === "playing" && hud.timeLeft <= 10;

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300 font-sans" onPointerDown={() => initAudio()}>
      <div ref={mountRef} className="absolute inset-0" />

      {hud && (
        <div className="pointer-events-none absolute inset-0 z-10 select-none">
          {/* top bar */}
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-b-3xl px-6 pb-2 pt-2 text-3xl font-black shadow-lg ${
                lowTime ? "animate-pulse bg-red-500 text-white" : "bg-white text-slate-800"
              }`}
            >
              <span className="text-2xl">⏱️</span>
              {hud.phase === "countdown" ? 100 : hud.timeLeft}
            </div>
          </div>
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <button
              className="pointer-events-auto rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 shadow-md active:scale-95"
              onClick={onExit}
            >
              ☰ MENU
            </button>
            <button
              className="pointer-events-auto rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 shadow-md active:scale-95"
              onClick={() => setCamMode(camMode === "stumble" ? "gang" : "stumble")}
              title="Ganti mode kamera (Stumble / Gang Beasts)"
            >
              📷 {camMode === "stumble" ? "STUMBLE" : "GANG"}
            </button>
            <button
              className="pointer-events-auto rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 shadow-md active:scale-95"
              onClick={() => {
                const zs = [0.7, 1, 1.35];
                setCamZoom(zs[(zs.indexOf(camZoom) + 1) % zs.length]);
              }}
              title="Ganti zoom kamera"
            >
              🔍 {camZoom === 0.7 ? "DEKAT" : camZoom === 1.35 ? "JAUH" : "NORMAL"}
            </button>
            <div className="rounded-2xl bg-slate-900/60 px-3 py-2 text-sm font-bold text-white shadow-md">
              Ronde {hud.round} · 🐾 {hud.alive}/{hud.total} tersisa
              {hud.mode === "bomb" && <span className="ml-1 rounded-full bg-red-500/80 px-2 py-0.5">💣 {hud.bombs}</span>}
            </div>
          </div>

          {/* kill feed */}
          <div className="absolute right-3 top-3 flex w-72 flex-col items-end gap-1.5">
            {hud.feed.map((f) => (
              <div key={f.id} className="animate-[slideIn_.25s_ease-out] rounded-xl bg-slate-900/65 px-3 py-1.5 text-right text-sm font-bold text-white shadow">
                {f.text}
              </div>
            ))}
          </div>

          {/* countdown */}
          {hud.phase === "countdown" && hud.countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div key={hud.countdown} className="animate-[pop_.5s_ease-out] text-[10rem] font-black text-yellow-300 [-webkit-text-stroke:6px_#7c3a00] drop-shadow-2xl">
                {hud.countdown}
              </div>
            </div>
          )}

          {/* banner */}
          {hud.banner && hud.phase !== "roundEnd" && !(hud.phase === "countdown" && hud.countdown > 0 && hud.countdown <= 3) && (
            <div className="absolute inset-x-0 top-[22%] flex justify-center">
              <div key={hud.banner} className="animate-[pop_.4s_ease-out] rounded-3xl bg-yellow-300 px-8 py-3 text-4xl font-black tracking-wide text-orange-900 shadow-2xl [text-shadow:0_2px_0_#fff8]">
                {hud.banner}
              </div>
            </div>
          )}

          {/* player status */}
          <div className={`absolute left-3 flex flex-col gap-2 ${showTouch ? "top-16" : "bottom-3"}`}>
            {[me, p2].filter(Boolean).map((p) => (
              <div key={p!.id} className="flex items-center gap-2 rounded-2xl bg-white/90 p-2 pr-4 shadow-lg">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-2xl" style={{ background: p!.color }}>
                  {p!.alive ? <Portrait id={p!.animal} fallback={p!.emoji} /> : "💀"}
                </div>
                <div className="w-36">
                  <div className="flex justify-between text-xs font-black text-slate-700">
                    <span>{p!.slot === 1 ? "KAMU" : "P2"}</span>
                    <span>🏆 {p!.wins}</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${p!.ko ? "animate-pulse bg-purple-500" : p!.dizzy > 65 ? "bg-red-500" : "bg-amber-400"}`}
                      style={{ width: `${p!.ko ? 100 : Math.min(100, p!.dizzy)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                    {!p!.alive ? "TERSINGKIR" : p!.ko ? "💫 PINGSAN! (dilempar = kalah)" : "Pusing"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* opponents strip */}
          {!showTouch && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
              {hud.players
                .filter((p) => p.slot === 0)
                .map((p) => (
                  <div key={p.id} className={`flex flex-col items-center ${p.alive ? "" : "opacity-40 grayscale"}`}>
                    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border-4 border-white text-2xl shadow-md" style={{ background: p.color }}>
                      {p.alive ? <Portrait id={p.animal} fallback={p.emoji} /> : "💀"}
                      {p.ko && <span className="absolute -top-2 text-sm">💫</span>}
                    </div>
                    <div className="mt-1 h-1.5 w-12 overflow-hidden rounded-full bg-white/60">
                      <div className="h-full bg-red-500" style={{ width: `${p.ko ? 100 : Math.min(100, p.dizzy)}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* spectating */}
          {hud.phase === "playing" && !hud.meAlive && (
            <div className="absolute inset-x-0 top-20 flex justify-center">
              <div className="rounded-full bg-slate-900/70 px-5 py-2 text-sm font-bold text-white">👀 Menonton... tunggu ronde berikutnya</div>
            </div>
          )}

          {/* help */}
          {showHelp && !showTouch && hud.phase !== "roundEnd" && (
            <div className="absolute bottom-20 right-3 w-72 rounded-2xl bg-slate-900/75 p-4 text-xs text-white shadow-xl">
              <div className="mb-2 text-sm font-black text-yellow-300">KONTROL (H untuk sembunyikan)</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <b>WASD</b><span>Jalan · <b>Shift</b> lari</span>
                <b>Space</b><span>Lompat (saat gantung = memanjat)</span>
                <b>J</b><span>Pukul (kiri-kanan bergantian)</span>
                <b className="text-yellow-300">E</b><span className="text-yellow-300">Angkat yang di depan · tekan lagi = LEMPAR 🚀</span>
                <b className="text-yellow-300">E dekat 🏏</b><span className="text-yellow-300">Ambil tongkat · J = ayun BONK! · E = lempar</span>
                <b>K (tahan)</b><span>Grab / pegang tepi / angkat</span>
                <b>J saat grab</b><span>Angkat ke atas kepala</span>
                <b>Lepas K</b><span>LEMPAR! 🚀</span>
                <b>L</b><span>Sundul · di udara = Dropkick</span>
              </div>
              {options.twoPlayer && (
                <div className="mt-2 border-t border-white/20 pt-2 text-cyan-300">
                  <b>P2:</b> Panah · Num0/Enter lompat · Num1/, pukul · Num2/. grab · Num3// sundul · Num4/; angkat · RShift lari
                </div>
              )}
              <div className="mt-2 text-white/70">Tip: pukul sampai lawan pingsan 💫, grab, angkat, lalu lempar keluar arena!</div>
              {hud.mode === "bomb" && (
                <div className="mt-1 rounded-lg bg-red-500/25 p-2 font-bold text-red-100">
                  💣 MODE BOM: Angkat bom (E) &amp; lempar cepat sebelum meledak! Jauhi lingkaran merah. Bom makin banyak seiring waktu!
                </div>
              )}
            </div>
          )}

          {/* round end */}
          {hud.phase === "roundEnd" && hud.winner && (
            <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
              <div className="w-[min(92vw,420px)] animate-[pop_.4s_ease-out] rounded-3xl bg-white p-6 text-center shadow-2xl">
                <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl text-7xl" style={{ background: hud.players.find((p) => p.animal === hud.winner!.animal)?.color ?? "#eee" }}>
                  {hud.winner.animal ? <Portrait id={hud.winner.animal} fallback={hud.winner.emoji} /> : hud.winner.emoji}
                </div>
                <div className="mt-2 text-3xl font-black text-slate-800">
                  {hud.winner.name === "Seri" ? "SERI!" : hud.winner.human ? (hud.winner.name === "KAMU" ? "KAMU MENANG! 🎉" : `${hud.winner.name} MENANG!`) : `${hud.winner.name} menang`}
                </div>
                <div className="mt-4 space-y-1.5">
                  {[...hud.players]
                    .sort((a, b) => b.wins - a.wins)
                    .map((p) => (
                      <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${p.slot ? "bg-yellow-100" : "bg-slate-100"}`}>
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg text-xl" style={{ background: p.color }}>
                          <Portrait id={p.animal} fallback={p.emoji} />
                        </span>
                        <span className="flex-1 text-left text-sm font-bold text-slate-700">{p.slot === 1 ? "KAMU" : p.name}</span>
                        <span className="text-sm font-black text-amber-600">🏆 {p.wins}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-5 flex gap-3">
                  <button className="flex-1 rounded-2xl bg-slate-200 py-3 font-black text-slate-700 active:scale-95" onClick={onExit}>
                    MENU
                  </button>
                  <button
                    className="flex-[2] rounded-2xl bg-yellow-400 py-3 text-lg font-black text-orange-900 shadow-[0_4px_0_#c2810c] active:translate-y-1 active:shadow-none"
                    onClick={() => gameRef.current?.nextRound()}
                  >
                    RONDE BERIKUTNYA ▶
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showTouch && hud?.phase !== "roundEnd" && <TouchControls />}
    </div>
  );
}
