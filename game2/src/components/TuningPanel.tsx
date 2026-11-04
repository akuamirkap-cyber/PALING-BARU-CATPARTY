import { useState } from "react";
import { TUNING_DEFAULTS, TUNING_SPECS, resetTuning, setTuning, useTuning, type Tuning } from "../game/tuning";

/** Live sliders for the cat's proportions (rebuilds the 3D model). */
export default function TuningPanel({ inline = false }: { inline?: boolean }) {
  const t = useTuning();
  const [open, setOpen] = useState(inline);
  const groups = [...new Set(TUNING_SPECS.map((s) => s.group))];
  const changed = (Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]).some((k) => Math.abs(t[k] - TUNING_DEFAULTS[k]) > 1e-6);
  const panelActive = inline || open;

  return (
    <div className="pointer-events-auto">
      {!inline && <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2 text-sm font-black text-slate-700 shadow-lg active:scale-95"
      >
        🎛️ Atur Bentuk {changed && <span className="h-2 w-2 rounded-full bg-pink-500" />}
        <span className="text-xs">{open ? "▲" : "▼"}</span>
      </button>}
      {panelActive && (
        <div className="mt-2 max-h-[62vh] w-72 overflow-y-auto rounded-2xl bg-slate-900/80 p-3 text-white shadow-2xl backdrop-blur">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <div className="mb-1 text-xs font-black uppercase tracking-wider text-pink-300">{g}</div>
              {TUNING_SPECS.filter((s) => s.group === g).map((s) => {
                const v = t[s.key];
                const d = TUNING_DEFAULTS[s.key];
                const pct = s.min < 0 ? `${v >= 0 ? "+" : ""}${Math.round(v * 1000) / 10}` : `${Math.round(v * 100)}%`;
                return (
                  <label key={s.key} className="mb-1.5 block">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>{s.label}</span>
                      <button
                        type="button"
                        className={`tabular-nums ${Math.abs(v - d) > 1e-6 ? "text-yellow-300" : "text-white/60"}`}
                        title="Klik untuk kembali ke default"
                        onClick={(e) => {
                          e.preventDefault();
                          setTuning({ [s.key]: d });
                        }}
                      >
                        {pct}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={v}
                      onChange={(e) => setTuning({ [s.key]: parseFloat(e.target.value) })}
                      className="h-2 w-full cursor-pointer accent-pink-400"
                    />
                  </label>
                );
              })}
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={resetTuning} className="flex-1 rounded-xl bg-white/15 py-2 text-xs font-black hover:bg-white/25">
              ↺ Reset semua
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-white/60">
            Model dibangun ulang otomatis (±0,3 dtk per kucing). Pengaturan tersimpan & dipakai di dalam game.
          </p>
        </div>
      )}
    </div>
  );
}
