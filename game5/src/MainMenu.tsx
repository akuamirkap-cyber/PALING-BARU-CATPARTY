import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Dressed } from "./Lobby";
import { isMuted, onMute, setMuted, sfx } from "./audio";
import { JButton, KeyHint, MuteButton } from "./ui";

function Settings() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMute(setM), []);
  const Row = ({ ic, t, on, flip }: { ic: string; t: string; on: boolean; flip: () => void }) => (
    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white mb-2 shadow-[0_3px_0_rgba(59,42,26,.08)]">
      <span className="w-12 h-12 rounded-xl bg-[#ffefc7] flex items-center justify-center text-2xl">{ic}</span>
      <div className="flex-1 text-[#3b2a1a] text-lg">{t}</div>
      <JButton sound="select" onClick={flip} className={`w-16 h-9 rounded-full p-1 ${on ? "bg-[#22c55e]" : "bg-[#3b2a1a]/15"}`}>
        <span className={`block w-7 h-7 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.3,1.6,.5,1)] ${on ? "translate-x-7" : ""}`} />
      </JButton>
    </div>
  );
  return (
    <>
      <div className="text-4xl text-[#3b2a1a] mb-5">SETTINGS</div>
      <Row ic="🔊" t="SOUND & MUSIC" on={!m} flip={() => setMuted(!m)} />
      <div className="grid grid-cols-3 gap-2 mt-3">
        {([["🎵", "pop"], ["🥊", "hit"], ["🏆", "win"]] as const).map(([ic, k]) => (
          <JButton key={k} sound={k} className="h-14 rounded-2xl bg-white text-2xl shadow-[0_3px_0_rgba(59,42,26,.1)] hover:-translate-y-0.5">{ic}</JButton>
        ))}
      </div>
      <div className="text-center text-[#3b2a1a]/45 font-sans font-semibold text-xs mt-3">Tap to test sounds</div>
    </>
  );
}

function MenuCat({ fur, pos, phase, cap }: { fur: string; pos: [number, number, number]; phase: number; cap?: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const r = 0.78;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    const hop = Math.max(0, Math.sin(t * 2.2));
    g.current.position.y = pos[1] + hop * hop * 0.12;
    const sq = 1 - Math.max(0, 0.05 - hop * 0.2);
    g.current.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    g.current.rotation.y = pos[0] < 0 ? 0.28 + Math.sin(t * 0.8) * 0.12 : -0.22 + Math.sin(t * 0.8) * 0.12;
  });
  return (
    <group ref={g} position={pos}>
      <Dressed r={r} seed={phase} look={{ fur, color: "#fff", hat: cap ? "cap" : null, capColor: "#e1242c", glasses: null, duck: false, gloves: false, hammer: false }} />
    </group>
  );
}

function Scene() {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ pointer }) => {
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, pointer.x * 0.25 - 0.15, 0.05);
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, -pointer.y * 0.08, 0.05);
  });
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={2.2} color="#fff3dd" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 2, -3]} intensity={0.8} color="#ffb347" />
      <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 5]} scale={[10, 5, 1]} color="#fff4e0" />
          <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color="#ffd59e" />
          <Lightformer intensity={1} position={[6, 2, 2]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color="#ffffff" />
          <Lightformer intensity={0.6} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} color="#b07a40" />
        </Environment>
      <group ref={g}>
        <MenuCat fur="tabby" cap pos={[-1.05, 0.06, 0]} phase={0} />
        <MenuCat fur="siamese" pos={[1.05, 0.06, 0]} phase={1.2} />
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.72, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#f7a21b" roughness={1} />
      </mesh>
      <ContactShadows position={[0, -0.7, 0]} opacity={0.45} scale={10} blur={2.4} far={3} color="#a14f00" resolution={256} />
    </>
  );
}

const allItems = ["QUICK MATCH", "CUSTOM GAME", "TUTORIAL", "LOCKER", "SETTINGS", "EXIT GAME"];
const skins = [
  { name: ["DRACULA", "BALL"], bg: "from-[#3a3a44] to-[#1c1c22]", ball: "#7c7c88", glow: "#e11d48" },
  { name: ["GOLDEN", "KING"], bg: "from-[#6b4a00] to-[#2a1c00]", ball: "#fbbf24", glow: "#fde68a" },
  { name: ["FROSTY", "BOI"], bg: "from-[#1e3a5f] to-[#0b1a2e]", ball: "#93c5fd", glow: "#e0f2fe" },
  { name: ["NEON", "SLIME"], bg: "from-[#14532d] to-[#052e16]", ball: "#4ade80", glow: "#bbf7d0" },
  { name: ["CANDY", "POP"], bg: "from-[#831843] to-[#3b0a20]", ball: "#f472b6", glow: "#fbcfe8" },
];

export function MainMenu({ onPlay }: { onPlay: () => void }) {
  const [active, setActive] = useState(0);
  const [modal, setModal] = useState<null | "tutorial" | "settings" | "exit">(null);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef(modal); modalRef.current = modal;
  const close = () => { sfx.back(); setClosing(true); setTimeout(() => { setModal(null); setClosing(false); }, 220); };
  const choose = (i: number) => {
    const t = allItems[i];
    if (t === "QUICK MATCH" || t === "CUSTOM GAME" || t === "LOCKER") { sfx.click(); onPlay(); return; }
    sfx.pop();
    setModal(t === "TUTORIAL" ? "tutorial" : t === "SETTINGS" ? "settings" : "exit");
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (modalRef.current) { if (e.key === "Escape") close(); return; }
      if (e.key === "ArrowDown" || e.key === "s") { sfx.hover(); setActive((a) => (a + 1) % allItems.length); }
      if (e.key === "Enter") setActive((a) => { choose(a); return a; });
      if (e.key === "ArrowUp" || e.key === "w") { sfx.hover(); setActive((a) => (a - 1 + allItems.length) % allItems.length); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onPlay]);
  const [skin, setSkin] = useState(0);
  const [vote, setVote] = useState(0);
  useEffect(() => {
    const i = setInterval(() => { setSkin((s) => (s + 1) % skins.length); setVote((v) => (v + 1) % 2); }, 3500);
    return () => clearInterval(i);
  }, []);
  const s = skins[skin];

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none" style={{ fontFamily: "'Lilita One', sans-serif", background: "radial-gradient(ellipse at 50% 40%, #ffc23d 0%, #ffaa16 45%, #f39200 100%)" }}>
      <div className="absolute inset-x-0 bottom-0 h-[38%]" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,214,90,.55), transparent 70%)" }} />
      <div className="absolute inset-0">
        <Canvas shadows camera={{ position: [0, 0.95, 7.4], fov: 36 }} dpr={[1, 1.5]} gl={{ powerPreference: "high-performance", antialias: true, stencil: false }}>
          <Scene />
        </Canvas>
      </div>

      {/* Menu */}
      <nav className="absolute left-[4.5vw] top-1/2 -translate-y-[58%] flex flex-col gap-[1.2vh]">
        {allItems.map((t, i) => {
          const on = active === i;
          const big = i < 2;
          return (
            <button key={t} onMouseEnter={() => { if (active !== i) sfx.hover(); setActive(i); }} onClick={() => { setActive(i); choose(i); }}
              className={`relative flex items-center text-left rounded-[18px] py-3 pr-8 transition-all duration-300 ease-out ${i === 1 ? "mb-4" : ""} ${big ? "text-[clamp(26px,2.9vw,44px)]" : "text-[clamp(18px,1.9vw,30px)]"} ${on ? "bg-[#fff4dc] -rotate-1 scale-105 pl-6 shadow-[0_8px_0_rgba(190,100,0,.35),0_14px_30px_rgba(160,80,0,.35)] text-[#3b2a1a]" : "bg-transparent pl-[4.2rem] text-[#fff3df]/90"}`}
              style={{ textShadow: on ? "none" : "0 3px 0 rgba(200,100,0,.35)", animation: `slideL .55s ${0.15 + i * 0.06}s both cubic-bezier(.3,1.5,.5,1)` }}>
              <span className={`overflow-hidden transition-all duration-300 flex items-center ${on ? "w-[0.9em] mr-4 opacity-100" : "w-0 mr-0 opacity-0"}`}>
                <svg viewBox="0 0 30 38" className="w-[0.75em] h-[0.95em] shrink-0 animate-[nudge_1s_ease-in-out_infinite]"><path d="M5 4 L26 19 L5 34 Q2 36 2 32 L2 6 Q2 2 5 4Z" fill="#ff9d00" stroke="#ff9d00" strokeWidth="3" strokeLinejoin="round" /></svg>
              </span>
              <span className="leading-none tracking-wide">{t}</span>
              {t === "LOCKER" && <span className="ml-3 text-[0.55em] bg-[#ff4d1a] text-white rounded-md px-1.5 py-0.5 shadow-[0_2px_0_#b02d00]">N</span>}
            </button>
          );
        })}
      </nav>

      {/* Right cards */}
      <div style={{ animation: "slideR .6s .35s both cubic-bezier(.3,1.5,.5,1)" }} className="absolute right-[6vw] top-1/2 -translate-y-1/2 flex flex-col gap-4 w-[clamp(180px,16vw,260px)]">
        <div className="relative h-[clamp(90px,9vw,125px)] rounded-[22px] bg-gradient-to-br from-[#ff3b1f] to-[#e01e0a] overflow-hidden rotate-[-1.5deg] shadow-[0_8px_0_rgba(140,30,0,.35),0_14px_30px_rgba(150,50,0,.4)] cursor-pointer hover:scale-105 transition-transform">
          <div className="absolute right-0 top-0 bottom-0 w-[45%] bg-[#f4f4f4] rounded-l-[40px] flex items-center justify-center">
            <div className="relative w-16 h-16 rounded-full bg-white shadow-inner">
              <div className="absolute top-3 left-3 w-4 h-4 bg-black rounded-full border-4 border-white shadow" />
              <div className="absolute top-3 right-3 w-4 h-4 bg-black rounded-full border-4 border-white shadow" />
              <div className="absolute -left-6 top-8 w-12 h-6 bg-[#ffb02e] rounded-full" />
            </div>
          </div>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white leading-[0.95] text-[clamp(22px,2.2vw,34px)]" style={{ textShadow: "0 3px 0 rgba(0,0,0,.2)" }}>VOTE<br />NOW</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{[0, 1].map((d) => <span key={d} className={`h-1 rounded-full bg-white transition-all ${vote === d ? "w-5" : "w-2 opacity-50"}`} />)}</div>
        </div>

        <div key={skin} className={`relative aspect-[3/4] rounded-[24px] bg-gradient-to-b ${s.bg} overflow-hidden border-[3px] border-white/20 shadow-[0_10px_0_rgba(0,0,0,.25),0_18px_40px_rgba(120,50,0,.45)] cursor-pointer hover:scale-[1.03] transition-transform animate-[fade_.5s_ease]`}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 38%, ${s.glow}55, transparent 60%)` }} />
          <div className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 w-[58%] aspect-square rounded-full animate-[bob_2.4s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${s.ball} 35%, #0008 120%)`, boxShadow: `0 0 40px ${s.glow}88` }}>
            <div className="absolute top-[38%] left-[28%] w-[13%] h-[13%] bg-[#1a1a1a] rounded-full" />
            <div className="absolute top-[38%] right-[28%] w-[13%] h-[13%] bg-[#1a1a1a] rounded-full" />
          </div>
          <div className="absolute left-4 bottom-9 text-white leading-[0.95] text-[clamp(24px,2.4vw,38px)]" style={{ textShadow: `0 0 14px ${s.glow}, 0 3px 0 rgba(0,0,0,.4)` }}>{s.name[0]}<br />{s.name[1]}</div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {skins.map((_, i) => <span key={i} onClick={() => setSkin(i)} className={`h-1 w-4 rounded-full ${i === skin ? "bg-white" : "bg-white/35"}`} />)}
          </div>
        </div>
      </div>

      {/* top bar */}
      <div className="absolute top-5 left-[4.5vw] flex items-center gap-3 animate-[slideD_.5s_.1s_both_cubic-bezier(.3,1.5,.5,1)]">
        <div className="h-12 pl-1.5 pr-4 rounded-2xl bg-[#fff8ec]/90 backdrop-blur flex items-center gap-2.5 shadow-[0_4px_0_rgba(150,80,0,.22),0_8px_20px_rgba(150,80,0,.18)]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-[#ffb347] to-[#f08000] flex items-center justify-center text-white text-lg shadow-inner">12</div>
          <div className="leading-none">
            <div className="text-[#3b2a1a] text-base">PLAYER</div>
            <div className="mt-1 w-24 h-1.5 rounded-full bg-[#3b2a1a]/10 overflow-hidden"><div className="h-full w-[64%] rounded-full bg-gradient-to-r from-[#22c55e] to-[#86efac]" /></div>
          </div>
        </div>
        <div className="h-12 px-4 rounded-2xl bg-[#fff8ec]/90 backdrop-blur flex items-center gap-2 text-[#3b2a1a] text-lg shadow-[0_4px_0_rgba(150,80,0,.22),0_8px_20px_rgba(150,80,0,.18)]">
          <span className="w-6 h-6 rounded-full bg-gradient-to-b from-[#ffe14d] to-[#f5a400] shadow-[inset_0_-2px_0_#c27c00] flex items-center justify-center text-[11px] text-[#7a4a00]">🐾</span>2,450
        </div>
      </div>
      <div className="absolute top-5 right-[6vw] animate-[slideD_.5s_.2s_both_cubic-bezier(.3,1.5,.5,1)]"><MuteButton /></div>
      <div className="absolute bottom-5 left-[4.5vw] flex gap-5 text-sm animate-[slideU_.5s_.6s_both]">
        <KeyHint k="↑ ↓" label="NAVIGATE" dark={false} /><KeyHint k="ENTER" label="SELECT" dark={false} />
      </div>
      <div className="absolute bottom-5 right-[6vw] text-[#7a3d00]/50 text-sm font-sans font-bold">v1.2</div>

      {modal && (
        <div className={`absolute inset-0 z-40 flex items-center justify-center bg-[#5a2a00]/35 backdrop-blur-[3px] ${closing ? "animate-[fade_.22s_reverse_both]" : "animate-[fade_.25s_both]"}`} onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className={`w-[min(92vw,480px)] bg-[#fff8ec] rounded-[32px] p-7 shadow-[0_12px_0_rgba(150,80,0,.25),0_30px_60px_rgba(80,30,0,.35)] ${closing ? "animate-[badgeOut_.22s_both]" : "animate-[badgeIn_.4s_cubic-bezier(.3,1.6,.5,1)_both]"}`}>
            {modal === "tutorial" && (
              <>
                <div className="text-4xl text-[#3b2a1a] mb-1">HOW TO PLAY</div>
                <div className="text-[#3b2a1a]/55 font-sans font-semibold mb-5">Be the last cat standing on the boat!</div>
                {[["🕹️", "MOVE", "WASD / Arrow keys"], ["💨", "DASH", "Space — ram other cats"], ["🌊", "WAVES", "The boat tilts — don't slide off!"], ["🧹", "WEAPONS", "Broom & mallet push 35% harder"]].map(([ic, t, d], i) => (
                  <div key={t} className="flex items-center gap-4 p-3 rounded-2xl bg-white mb-2 shadow-[0_3px_0_rgba(59,42,26,.08)]" style={{ animation: `tileIn .35s ${0.1 + i * 0.06}s both cubic-bezier(.3,1.6,.5,1)` }}>
                    <span className="w-12 h-12 rounded-xl bg-[#ffefc7] flex items-center justify-center text-2xl">{ic}</span>
                    <div><div className="text-[#3b2a1a] text-lg leading-none">{t}</div><div className="text-[#3b2a1a]/55 font-sans font-semibold text-sm mt-1">{d}</div></div>
                  </div>
                ))}
                <JButton sound="click" onClick={() => { setModal(null); onPlay(); }} className="w-full mt-4 h-14 rounded-2xl bg-gradient-to-b from-[#ffe14d] to-[#ff9d00] text-white text-2xl shadow-[0_6px_0_#b45309] hover:scale-[1.02]">LET'S GO!</JButton>
              </>
            )}
            {modal === "settings" && <Settings />}
            {modal === "exit" && (
              <div className="text-center">
                <div className="text-7xl mb-2 animate-[floaty_1.6s_ease-in-out_infinite]">😿</div>
                <div className="text-4xl text-[#3b2a1a]">LEAVING ALREADY?</div>
                <div className="text-[#3b2a1a]/55 font-sans font-semibold mb-6">The cats will miss you…</div>
                <div className="flex gap-3">
                  <JButton sound="back" onClick={close} className="flex-1 h-14 rounded-2xl bg-gradient-to-b from-[#ffe14d] to-[#ff9d00] text-white text-2xl shadow-[0_6px_0_#b45309] hover:scale-[1.03]">STAY!</JButton>
                  <JButton sound="lose" onClick={close} className="flex-1 h-14 rounded-2xl bg-[#3b2a1a]/10 text-[#3b2a1a] text-2xl hover:bg-[#3b2a1a]/15">EXIT</JButton>
                </div>
              </div>
            )}
            {modal !== "exit" && <JButton sound="back" onClick={close} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-[#3b2a1a]/8 text-[#3b2a1a] hover:bg-[#3b2a1a]/15 hover:rotate-90">✕</JButton>}
          </div>
        </div>
      )}
    </div>
  );
}
