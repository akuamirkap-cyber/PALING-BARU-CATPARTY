import { useEffect, useState } from "react";

/**
 * Full-screen viewer for the other games bundled in this repo. They are
 * self-contained HTML files served by the same dev server, so an iframe keeps
 * everything same-origin — and it works inside the preview iframe, where
 * opening a new tab is silently blocked.
 */
export default function GameViewer({ path, name, onExit }: { path: string; name: string; onExit: () => void }) {
  const [loaded, setLoaded] = useState(false);

  // fresh load each time the viewer opens
  useEffect(() => setLoaded(false), [path]);

  // Escape returns to the menu, like the real game screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-300 font-sans" data-screen="games-view">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-300 to-amber-100 text-center text-slate-800">
          <div className="text-5xl animate-bounce">🐾</div>
          <div className="text-xl font-black">Menyiapkan {name}…</div>
        </div>
      )}
      <iframe
        src={path}
        title={name}
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full border-0"
        allow="fullscreen; gamepad; autoplay"
      />
      <button
        type="button"
        onClick={onExit}
        className="absolute left-3 top-3 z-10 rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-700 shadow-md active:scale-95"
      >
        ‹ MENU
      </button>
    </div>
  );
}
