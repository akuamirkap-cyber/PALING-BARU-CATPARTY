import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Bomb, Cat, CircleHelp, Eye, Gamepad2, PawPrint, Plane, Settings2, Ship, Shirt, SlidersHorizontal, Sparkles, Swords, UsersRound } from "lucide-react";
import AssetCatPreview from "./AssetCatPreview";
import LineupPreview from "./LineupPreview";
import { animalById, type AccessoryId, type AnimalId } from "../game/animals";
import type { EyeStyleId, ExpressionId } from "../game/eyes";
import { Toggle, uiBtn } from "./ui";

export type MenuSheet = "char" | "acc" | "eyes" | "tuning" | "settings" | "info" | "mission" | "games";

interface Props {
  selected: AnimalId;
  accessory: AccessoryId;
  eyeStyle: EyeStyleId;
  expression: ExpressionId;
  mode: "brawl" | "bomb" | "teams";
  arena: "plane" | "ship";
  onArena: (arena: "plane" | "ship") => void;
  shipScale: number;
  onShipScale: (scale: number) => void;
  bots: number;
  twoPlayer: boolean;
  /** False while a sheet/modal is open: pauses the 3D preview and the hotkeys. */
  active: boolean;
  onPlay: () => void;
  onOpenSheet: (sheet: MenuSheet) => void;
  onBundledGame: (path: string, name: string) => void;
  onMode: (mode: "brawl" | "bomb" | "teams") => void;
  onBots: (bots: number) => void;
  onTwoPlayer: (on: boolean) => void;
  onSelectAnimal: (step: number) => void;
}

const ITEMS: { id: MenuSheet | "play"; label: string; icon: typeof Cat; big?: boolean; badge?: string }[] = [
  { id: "play", label: "MAIN SEKARANG", icon: Gamepad2, big: true },
  { id: "char", label: "PILIH KUCING", icon: Cat, big: true },
  { id: "acc", label: "AKSESORIS", icon: Shirt },
  { id: "eyes", label: "MATA & EKSPRESI", icon: Eye },
  { id: "tuning", label: "ATUR BENTUK", icon: SlidersHorizontal },
  { id: "mission", label: "MISI HARIAN", icon: Sparkles, badge: "3" },
];

/** Main menu in the orange "matchmaking" style: big left list, cat stage, side cards. */
export default function MenuScreen(props: Props) {
  const { selected, accessory, eyeStyle, expression, mode, arena, onArena, shipScale, onShipScale, bots, twoPlayer, active, onPlay, onOpenSheet, onMode, onBots, onTwoPlayer, onSelectAnimal, onBundledGame } = props;
  const [cursor, setCursor] = useState(0);
  const sel = animalById(selected);

  const choose = useCallback(
    (index: number) => {
      const item = ITEMS[index];
      if (!item) return;
      if (item.id === "play") onPlay();
      else onOpenSheet(item.id);
    },
    [onPlay, onOpenSheet],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable='true']")) return;
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        setCursor((c) => (c + 1) % ITEMS.length);
      } else if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        setCursor((c) => (c - 1 + ITEMS.length) % ITEMS.length);
      } else if (e.code === "Enter" || e.code === "Space") {
        if (target?.closest("button")) return;
        e.preventDefault();
        choose(cursor);
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        onSelectAnimal(-1);
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        onSelectAnimal(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, choose, cursor, onSelectAnimal]);

  return (
    <div className="mm-screen" data-screen="menu" aria-hidden={!active || undefined}>
      <div className="mm-sun" aria-hidden="true" />
      <div className="mm-horizon" aria-hidden="true" />
      <div className="mm-stage-box">
        <LineupPreview selected={selected} accessory={accessory} eyeStyle={eyeStyle} expression={expression} active={active} />
      </div>
      {/* the exported "accurate 3D cat" asset (no hat), standing to the right of the lineup */}
      <AssetCatPreview animal={selected} active={active} />

      <header className="mm-top">
        <div className="mm-brand">
          <span className="mm-brand-mark"><PawPrint size={22} strokeWidth={2.6} /></span>
          <span className="mm-brand-name">MEOW <em>BRAWL</em></span>
        </div>
        <div className="mm-top-right">
          <div className="mm-chip mm-chip-level">
            <span className="mm-level">12</span>
            <span className="mm-level-text">
              <b>PEMAIN</b>
              <i><em style={{ width: "64%" }} /></i>
            </span>
          </div>
          <div className="mm-chip mm-chip-paw"><span>🐾</span>2.450</div>
          <button type="button" className="mm-mode-chip" onClick={(e) => { uiBtn(e); onMode(mode === "brawl" ? "bomb" : mode === "bomb" ? "teams" : "brawl"); }} aria-label="Ganti mode">
            {mode === "brawl" ? "⚔️ BRAWL" : mode === "bomb" ? "💣 BOM" : "🚩 TIM 5V5"}
          </button>
          <button type="button" className="mm-icon" aria-label="Game lain di GitHub" onClick={(e) => { uiBtn(e); onOpenSheet("games"); }}><Gamepad2 size={20} /></button>
          <button type="button" className="mm-icon" aria-label="Cara main" onClick={(e) => { uiBtn(e); onOpenSheet("info"); }}><CircleHelp size={20} /></button>
          <button type="button" className="mm-icon" aria-label="Setelan" onClick={(e) => { uiBtn(e); onOpenSheet("settings"); }}><Settings2 size={20} /></button>
        </div>
      </header>

      <nav className="mm-nav" aria-label="Menu utama">
        {ITEMS.map((item, i) => {
          const on = cursor === i;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`mm-item ${item.big ? "is-big" : ""} ${on ? "is-on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onFocus={() => setCursor(i)}
              onClick={(e) => { uiBtn(e, item.id === "play"); setCursor(i); choose(i); }}
              style={{ animationDelay: `${0.08 + i * 0.05}s` }}
            >
              <span className="mm-arrow" aria-hidden="true">
                <svg viewBox="0 0 30 38"><path d="M5 4 L26 19 L5 34 Q2 36 2 32 L2 6 Q2 2 5 4Z" /></svg>
              </span>
              <Icon className="mm-item-icon" size={item.big ? 22 : 17} />
              <span className="mm-item-label">{item.label}</span>
              {item.badge && <span className="mm-item-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="mm-picker">
        <button type="button" aria-label="Kucing sebelumnya" onClick={(e) => { uiBtn(e); onSelectAnimal(-1); }}><ArrowLeft size={18} /></button>
        <button type="button" className="mm-picker-name" onClick={(e) => { uiBtn(e); onOpenSheet("char"); }}>
          <small>KUCING PILIHANMU</small>
          <strong>{sel.name}</strong>
          <span>{sel.tagline}</span>
        </button>
        <button type="button" aria-label="Kucing berikutnya" onClick={(e) => { uiBtn(e); onSelectAnimal(1); }}><ArrowRight size={18} /></button>
      </div>

      <aside className="mm-side" aria-label="Pengaturan pertandingan">
        <div className="mm-card">
          <div className="mm-card-title"><span>MODE MAIN</span><Swords size={16} /></div>
          <button type="button" className={`mm-mode ${mode === "brawl" ? "is-on" : ""}`} onClick={(e) => { uiBtn(e); onMode("brawl"); }}>
            <Swords size={19} />
            <span><b>Brawl</b><small>Gebuk & jadi juara</small></span>
          </button>
          <button type="button" className={`mm-mode mm-mode-bomb ${mode === "bomb" ? "is-on" : ""}`} onClick={(e) => { uiBtn(e); onMode("bomb"); }}>
            <Bomb size={19} />
            <span><b>Lempar Bom</b><small>Angkat & lempar!</small></span>
          </button>
          <button type="button" className={`mm-mode mm-mode-team ${mode === "teams" ? "is-on" : ""}`} onClick={(e) => { uiBtn(e); onMode("teams"); }}>
            <UsersRound size={19} />
            <span><b>Tim 5v5</b><small>MERAH 🆚 BIRU, tanpa tembak kawan</small></span>
          </button>
        </div>

        <div className="mm-card">
          <div className="mm-card-title"><span>ARENA</span><Ship size={16} /></div>
          <button type="button" className={`mm-mode ${arena === "plane" ? "is-on" : ""}`} onClick={(e) => { uiBtn(e); onArena("plane"); }}>
            <Plane size={19} />
            <span><b>Pesawat</b><small>Arena klasik di angkasa</small></span>
          </button>
          <button type="button" className={`mm-mode ${arena === "ship" ? "is-on" : ""}`} onClick={(e) => { uiBtn(e); onArena("ship"); }}>
            <Ship size={19} />
            <span><b>Kapal Pesiar</b><small>Bergebuk di dek kapal, dijatuhkan ke laut!</small></span>
          </button>
          {arena === "ship" && (
            <div className="mm-row" style={{ marginTop: 6 }}>
              <span>🔍 Ukuran</span>
              <span className="mm-stepper">
                {[[0.4, "1x"], [1.6, "4x"], [2.8, "7x"]].map(([v, label]: [number, string]) => (
                  <button key={v} type="button" aria-label={`Ukuran kapal ${label}`} className={shipScale === v ? "is-on" : ""} onClick={(e) => { uiBtn(e); onShipScale(v); }} style={shipScale === v ? { background: "#ffd76a", fontWeight: 900 } : undefined}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="mm-card">
          <div className="mm-card-title"><span>PERTANDINGAN</span><UsersRound size={16} /></div>
          <div className="mm-row">
            <span>🤖 Bot</span>
            <span className="mm-stepper">
              <button type="button" aria-label="Kurangi bot" onClick={(e) => { uiBtn(e); onBots(Math.max(1, bots - 1)); }}>−</button>
              <b>{bots}</b>
              <button type="button" aria-label="Tambah bot" onClick={(e) => { uiBtn(e); onBots(Math.min(7, bots + 1)); }}>+</button>
            </span>
          </div>
          <div className="mm-row">
            <span>👥 2 Pemain</span>
            <Toggle on={twoPlayer} onClick={() => onTwoPlayer(!twoPlayer)} />
          </div>
          <button type="button" className="mm-more" onClick={(e) => { uiBtn(e); onOpenSheet("settings"); }}>
            ATUR SEMUA <ArrowRight size={13} />
          </button>
        </div>
      </aside>

      {/* the other games bundled in this repo, right under the menu screen */}
      <nav className="mm-games" aria-label="Game lain di repo ini">
        <span className="mm-games-title">🎮 GAME LAIN:</span>
        <button
          type="button"
          className="mm-game-chip is-green"
          onClick={(e) => { uiBtn(e); onBundledGame("/games/cruise-ship/index.html", "Kapal Pesiar Gang Beasts"); }}
          title="gang-beasts-cruise-ship-asset (1).zip — Kapal Pesiar, Bowling & Stadion 3D"
        >
          <span className="mm-game-emoji">🚢</span>
          <span className="mm-game-name">Kapal Pesiar</span>
          <span className="mm-badge-green">BARU</span>
        </button>
        <button
          type="button"
          className="mm-game-chip is-green"
          onClick={(e) => { uiBtn(e); onBundledGame("/games/fishing-party/index.html", "Party Mancing"); }}
          title="physics-based-fishing-minigame (1).zip — Party Cats: Mancing, Gokart, Pesawat & Bom"
        >
          <span className="mm-game-emoji">🎣</span>
          <span className="mm-game-name">Party Mancing</span>
          <span className="mm-badge-green">BARU</span>
        </button>
        <button type="button" className="mm-game-chip" onClick={(e) => { uiBtn(e); onBundledGame("/games/gameplay-1/index.html", "Gameplay Asli"); }} title="animal-party-physics-gameplay.zip — versi pertama">
          <span className="mm-game-emoji">🐈</span>
          <span className="mm-game-name">Gameplay Asli</span>
        </button>
        <button type="button" className="mm-game-chip" onClick={(e) => { uiBtn(e); onBundledGame("/games/gameplay-2/index.html", "Versi Bom & Bot"); }} title="animal-party-physics-gameplay (1).zip — bom, bot & aksesoris">
          <span className="mm-game-emoji">💣</span>
          <span className="mm-game-name">Versi Bom & Bot</span>
        </button>
        <button type="button" className="mm-game-chip" onClick={(e) => { uiBtn(e); onBundledGame("/games/cat-asset/index.html", "Studio Aset 3D"); }} title="create-3d-asset-without-hat.zip — studio aset kucing 3D">
          <span className="mm-game-emoji">🎨</span>
          <span className="mm-game-name">Studio Aset 3D</span>
        </button>
        <button type="button" className="mm-game-chip" onClick={(e) => { uiBtn(e); onBundledGame("/games/menu-balls/index.html", "Menu Bola"); }} title="3d-game-main-menu-design (1).zip — main menu bola kucing glossy (Bounce Paws)">
          <span className="mm-game-emoji">🔴</span>
          <span className="mm-game-name">Menu Bola</span>
        </button>
        <button type="button" className="mm-game-chip" onClick={(e) => { uiBtn(e); onBundledGame("/games/menu-layout/index.html", "Menu Layout"); }} title="3d-game-menu-layout.zip — dua kucing melompat di panggung (Ball Party)">
          <span className="mm-game-emoji">🟧</span>
          <span className="mm-game-name">Menu Layout</span>
        </button>
      </nav>

      <footer className="mm-bottom">
        <span className="mm-hints"><kbd>↑ ↓</kbd> pilih <i /> <kbd>ENTER</kbd> buka <i /> <kbd>← →</kbd> ganti kucing</span>
        <span className="mm-version">v1.2 · MEOW BRAWL</span>
      </footer>
    </div>
  );
}
