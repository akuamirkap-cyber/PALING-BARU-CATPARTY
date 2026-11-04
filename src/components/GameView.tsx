import { useEffect, useRef, useState } from "react";
import { flagEmoji } from "../game/flags";
import { Game, createRoster, type GameOptions, type HudState } from "../game/Game";
import TouchControls from "./TouchControls";
import { initAudio } from "../game/audio";
import { renderPortraitFallback } from "../game/portraitFallback";
import Portrait from "./Portrait";
import { buildPreloadJobs, preloadCharacters } from "../game/characterPreload";
import { storeWorkerPortrait } from "../game/portraits";

interface Props {
  options: Omit<GameOptions, "onHud">;
  showTouch: boolean;
  onExit: () => void;
}

export default function GameView({ options, showTouch, onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [loading, setLoading] = useState({ done: 0, total: 0 });
  const [showHelp, setShowHelp] = useState(true);
  const [camMode, setCamMode] = useState(options.camMode);
  const [camZoom, setCamZoom] = useState(options.camZoom);
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const roster = createRoster(options);
    // Faces for the stock bar are part of the job: without `portrait` the HUD
    // rings would fall back to animal emoji for the whole match.
    const jobs = buildPreloadJobs(roster);
    let g: Game | null = null;
    let t = 0;
    // If workers are unsupported, keep the game functional with its existing
    // synchronous builder rather than leaving the player on a loading screen.
    void preloadCharacters(jobs, {
      signal: controller.signal,
      onProgress: (done, total) => setLoading({ done, total }),
      onPortrait: (result) => {
        if (result.portrait) storeWorkerPortrait(result);
        else renderPortraitFallback(result);
      },
    })
      .catch(() => {})
      .then(() => {
        if (controller.signal.aborted || !mountRef.current) return;
        g = new Game(mountRef.current, { ...options, preparedRoster: roster, onHud: setHud });
        gameRef.current = g;
        t = window.setTimeout(() => setShowHelp(false), 9000);
      });
    return () => {
      controller.abort();
      clearTimeout(t);
      g?.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.setCam(camMode, camZoom);
  }, [camMode, camZoom]);

  // "Ulang" asks once before wiping the current match, then forgets about it.
  useEffect(() => {
    if (!confirmRestart) return;
    const t = window.setTimeout(() => setConfirmRestart(false), 2600);
    return () => clearTimeout(t);
  }, [confirmRestart]);

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

  const lowTime = hud && hud.phase === "playing" && hud.timeLeft <= 10;

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300 font-sans" data-screen="game" onPointerDown={() => initAudio()}>
      <div ref={mountRef} className="absolute inset-0" />
      {!hud && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-300 to-amber-100 text-center text-slate-800" role="status" aria-live="polite">
          <div className="text-5xl">🐾</div>
          <div className="text-xl font-black">Menyiapkan arena dan kucing…</div>
          {loading.total > 0 && <div className="text-sm font-bold">{loading.done} / {loading.total}</div>}
          <button type="button" onClick={onExit} className="mt-2 rounded-xl bg-white px-5 py-2 text-sm font-black shadow-md">BATAL</button>
        </div>
      )}

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
          <div className="absolute left-3 top-3 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2">
            <button
              className="pointer-events-auto rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 shadow-md active:scale-95"
              onClick={onExit}
            >
              ☰ MENU
            </button>
            <button
              className={`pointer-events-auto rounded-2xl px-3 py-2 text-sm font-black shadow-md active:scale-95 ${
                confirmRestart ? "animate-pulse bg-red-500 text-white" : "bg-white/90 text-slate-700"
              }`}
              title="Ulang pertandingan dari ronde 1"
              onClick={() => {
                if (!confirmRestart) {
                  setConfirmRestart(true);
                  return;
                }
                setConfirmRestart(false);
                gameRef.current?.restart();
              }}
            >
              {confirmRestart ? "YAKIN? TAP LAGI" : "🔄 ULANG"}
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
              {hud.teamMode ? (
                <>
                  Ronde {hud.round} · <span className="font-black text-red-300">🟥 {hud.teamAlive[0]}/{hud.total / 2}</span>
                  {" — "}
                  <span className="font-black text-sky-300">🟦 {hud.teamAlive[1]}/{hud.total / 2}</span>
                  <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5">🏆 {hud.teamWins[0]} : {hud.teamWins[1]}</span>
                </>
              ) : (
                <>Ronde {hud.round} · 🐾 {hud.alive}/{hud.total} tersisa</>
              )}
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

          {/* stock bar — dense Digimon-style strip; team panels make red vs blue obvious */}
          <div className="absolute inset-x-0 bottom-0">
            <div
              className="stock-strip"
              style={{
                background: "linear-gradient(180deg, #ffb347 0%, #ff9d2e 46%, #ef7d1d 100%)",
                borderTop: "3px solid #ffd9a0",
                boxShadow: "0 -4px 14px rgba(180,80,0,.35)",
              }}
            >
              {hud.teamMode
                ? [0, 1].map((team) => (
                    <div key={team} className={`stock-panel ${team === 0 ? "is-red" : "is-blue"}`}>
                      <span className="stock-panel-tag">{team === 0 ? "🟥 TIM MERAH" : "🟦 TIM BIRU"}</span>
                      <div className="stock-row">
                        {hud.players
                          .filter((p) => p.team === team)
                          .sort((a, b) => a.slot - b.slot || a.id - b.id)
                          .map((p) => (
                            <StockCard key={p.id} p={p} tone={team === 0 ? "red" : "blue"} hud={hud} showTouch={showTouch} />
                          ))}
                      </div>
                    </div>
                  ))
                : (
                    <div className="stock-panel is-neutral">
                      <div className="stock-row">
                        {[...hud.players]
                          .sort((a, b) => a.slot - b.slot || a.id - b.id)
                          .map((p) => (
                            <StockCard
                              key={p.id}
                              p={p}
                              tone={p.slot === 1 ? "gold" : p.slot === 2 ? "cyan" : "white"}
                              hud={hud}
                              showTouch={showTouch}
                            />
                          ))}
                      </div>
                    </div>
                  )}
            </div>
          </div>

          {hud.phase === "playing" && hud.weaponContest && (
            <div className="absolute inset-x-0 top-24 flex justify-center px-4" role="status" aria-live="polite">
              <div className="rounded-2xl border-2 border-amber-200 bg-slate-900/90 px-5 py-3 text-center text-white shadow-xl">
                <div className="text-sm font-black text-amber-300">REBUTAN SENJATA!</div>
                <div className="mt-1 text-xs font-bold">{hud.weaponContest.challenger} {hud.weaponContest.challengerPresses}/3 · {hud.weaponContest.owner} {hud.weaponContest.ownerPresses}/3</div>
                <div className="mt-1 text-xs text-white/85">Tekan {showTouch && hud.weaponContest.p1 ? "Angkat/Rebut" : hud.weaponContest.p1 ? "E" : "Num4 / ;"}{hud.weaponContest.p1 && hud.weaponContest.p2 ? " (P2: Num4 / ;)" : ""} 3× dengan cepat!</div>
              </div>
            </div>
          )}

          {/* respawning / spectating */}
          {hud.phase === "playing" && !hud.meAlive && hud.respawnIn != null && (
            <div className="absolute inset-x-0 top-20 flex justify-center">
              <div className="animate-pulse rounded-full bg-emerald-500/90 px-5 py-2 text-sm font-black text-white shadow-lg">🔁 KAMU BALIK DALAM {Math.ceil(hud.respawnIn)}…</div>
            </div>
          )}
          {hud.phase === "playing" && !hud.meAlive && hud.respawnIn == null && (
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
                <b className="text-yellow-300">K</b><span className="text-yellow-300">Grab & angkat lawan ke atas kepala · tekan K lagi = LEMPAR 🚀</span>
                <b className="text-yellow-300">E</b><span className="text-yellow-300">Sama: angkat / lempar · dekat 🏏 rebut senjata (tekan cepat 3×)</span>
                <b>K (tahan)</b><span>Pegang tepi arena saat jatuh</span>
                <b>J saat mengangkat</b><span>Lempar juga 🚀</span>
                <b>L</b><span>Lompat terjang ke arah gerak</span>
              </div>
              {options.twoPlayer && (
                <div className="mt-2 border-t border-white/20 pt-2 text-cyan-300">
                  <b>P2:</b> Panah · Num0/Enter lompat · Num1/, pukul · Num2/. angkat &amp; lempar · Num3// terjang · Num4/; angkat / rebut · RShift lari
                </div>
              )}
              <div className="mt-2 text-white/70">Tip: tekan K untuk mengangkat lawan, lalu K lagi untuk melemparnya keluar arena!</div>
              {hud.mode === "bomb" && (
                <div className="mt-1 rounded-lg bg-red-500/25 p-2 font-bold text-red-100">
                  💣 MODE BOM: Angkat bom (E) &amp; lempar cepat sebelum meledak! Jauhi lingkaran merah. Bom makin banyak seiring waktu!
                </div>
              )}
              {hud.teamMode && (
                <div className="mt-1 rounded-lg bg-sky-500/25 p-2 font-bold text-sky-100">
                  🚩 TIM 5V5: Tim kamu berlingkar <b className="text-red-300">merah</b>, lawan <b className="text-sky-300">biru</b>. Pukulanmu tidak bisa melukai teman setim — habisi satu tim untuk menang!
                </div>
              )}
            </div>
          )}

          {/* round end */}
          {hud.phase === "roundEnd" && hud.winner && (
            <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
              <div className="w-[min(92vw,420px)] animate-[pop_.4s_ease-out] rounded-3xl bg-white p-6 text-center shadow-2xl">
                <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl text-7xl" style={{ background: hud.players.find((p) => p.animal === hud.winner!.animal)?.color ?? "#eee" }}>
                  {hud.winner.animal ? <Portrait id={hud.winner.animal} fallback={hud.winner.emoji} eyeStyle={hud.winner.eyeStyle} expression={hud.winner.expression} /> : hud.winner.emoji}
                </div>
                <div className="mt-2 text-3xl font-black text-slate-800">
                  {hud.winner.name === "Seri"
                    ? "SERI!"
                    : hud.winner.human
                      ? hud.winner.team !== undefined
                        ? "TIMMU MENANG! 🎉"
                        : hud.winner.name === "KAMU"
                          ? "KAMU MENANG! 🎉"
                          : `${hud.winner.name} MENANG!`
                      : `${hud.winner.name} MENANG!`}
                </div>
                {hud.teamMode && (
                  <div className="mt-1 text-lg font-black text-slate-600">
                    <span className="text-red-500">🟥 {hud.teamWins[0]}</span> — <span className="text-blue-600">{hud.teamWins[1]} 🟦</span>
                  </div>
                )}
                <div className="mt-4 space-y-1.5">
                  {[...hud.players]
                    .sort((a, b) => (hud.teamMode ? (a.team - b.team || b.wins - a.wins) : b.wins - a.wins))
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${p.slot ? "bg-yellow-100" : "bg-slate-100"}`}
                        style={hud.teamMode && p.team >= 0 ? { borderLeft: `6px solid ${p.team === 0 ? "#e8343c" : "#2f6fe0"}` } : undefined}
                      >
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg text-xl" style={{ background: p.color }}>
                          <Portrait id={p.animal} fallback={p.emoji} eyeStyle={p.eyeStyle} expression={p.expression} />
                        </span>
                        <span className="flex-1 text-left text-sm font-bold text-slate-700">{p.slot === 1 ? "KAMU" : p.name} {flagEmoji(p.flag)}{hud.teamMode && p.team >= 0 ? (p.team === 0 ? " 🟥" : " 🟦") : ""}</span>
                        <span className="text-sm font-black text-amber-600">{hud.teamMode ? (p.alive ? "✅" : "💀") : `🏆 ${p.wins}`}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <button className="rounded-2xl bg-slate-200 px-4 py-3 font-black text-slate-700 active:scale-95" onClick={onExit}>
                    MENU
                  </button>
                  <button
                    className="rounded-2xl bg-slate-200 px-4 py-3 font-black text-slate-700 active:scale-95"
                    title="Ulang dari ronde 1"
                    onClick={() => gameRef.current?.restart()}
                  >
                    🔄
                  </button>
                  <button
                    className="flex-1 rounded-2xl bg-yellow-400 py-3 text-lg font-black text-orange-900 shadow-[0_4px_0_#c2810c] active:translate-y-1 active:shadow-none"
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

function StockCard({ p, tone, hud, showTouch }: { p: HudState["players"][number]; tone: string; hud: HudState; showTouch: boolean }) {
  const you = p.slot === 1;
  const mate = p.slot === 2;
  const dead = !p.alive && p.lives <= 0;
  const respawning = !p.alive && p.lives > 0;
  const num = hud.teamMode ? (p.lives > 0 ? p.lives : 0) : p.wins;
  return (
    <div className={`stock-card tone-${tone} ${you ? "is-you" : ""} ${dead ? "is-dead" : ""} ${showTouch ? "is-compact" : ""}`}>
      {you && <span className="stock-you-tag">KAMU</span>}
      {mate && <span className="stock-you-tag stock-p2-tag">P2</span>}
      <span className="stock-ring" style={{ background: p.color }}>
        {p.alive ? <Portrait id={p.animal} fallback={p.emoji} eyeStyle={p.eyeStyle} expression={p.expression} /> : "💀"}
        {p.ko && <span className="stock-ko">💫</span>}
        <span className="stock-flag">{flagEmoji(p.flag)}</span>
      </span>
      <span className="stock-side">
        <span className="stock-plate">
          <i className="stock-bevel" />
          <b className="stock-num">{respawning ? (you ? `↩${Math.ceil(hud.respawnIn ?? 1)}` : "↩") : dead ? "✕" : num}</b>
        </span>
        <span className="stock-pill">
          <i className={p.ko ? "is-ko" : p.dizzy > 65 ? "is-hot" : ""} style={{ width: `${p.ko ? 0 : Math.min(100, p.dizzy)}%` }} />
        </span>
      </span>
    </div>
  );
}
