import { useCallback, useRef, useState } from 'react';
import CatStage, { type CatId, type StageApi, type StageStats, type ViewMode } from './components/CatStage';
import { cn } from './utils/cn';

const VIEWS: { id: ViewMode; label: string; dot: string[] }[] = [
  { id: 'both', label: 'Berdua', dot: ['#E8903E', '#4A372D'] },
  { id: 'oyen', label: 'Oyen', dot: ['#E8903E'] },
  { id: 'siam', label: 'Siam', dot: ['#4A372D'] },
];

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function App() {
  const [view, setView] = useState<ViewMode>('both');
  const [autoRotate, setAutoRotate] = useState(false);
  const [breathing, setBreathing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<Record<CatId, StageStats> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const apiRef = useRef<StageApi | null>(null);

  const onProgress = useCallback((p: number) => setProgress(p), []);
  const onReady = useCallback((s: Record<CatId, StageStats>) => setStats(s), []);
  const ready = !!stats;

  const doExport = async () => {
    if (!apiRef.current || exporting) return;
    setExporting(true);
    try {
      await apiRef.current.exportGLB(view);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor GLB');
    } finally {
      setExporting(false);
    }
  };

  const totalVerts = stats ? (view === 'both' ? stats.oyen.verts + stats.siam.verts : stats[view].verts) : 0;
  const totalTris = stats ? (view === 'both' ? stats.oyen.tris + stats.siam.tris : stats[view].tris) : 0;

  return (
    <div
      className="relative h-[100dvh] w-full select-none overflow-hidden text-[#3b2a17]"
      style={{ background: 'radial-gradient(120% 95% at 50% 36%, #fcf3d6 0%, #f7e4ab 45%, #efcd7a 100%)' }}
    >
      <CatStage view={view} autoRotate={autoRotate} breathing={breathing} onProgress={onProgress} onReady={onReady} apiRef={apiRef} />

      {/* ── header title ── */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-7">
        <div className="pointer-events-auto max-w-[19rem] sm:max-w-sm">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#a35d1c] shadow-sm ring-1 ring-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E8903E]" /> Aset 3D Akurat · Tanpa Topi
          </div>
          <h1 className="font-display text-4xl font-semibold leading-[0.95] tracking-tight sm:text-5xl">
            <span className="text-[#df7f2c]">Oyen</span> <span className="text-[#3b2a17]">&amp;</span>{' '}
            <span className="text-[#5a4234]">Siam</span>
          </h1>
          <p className="mt-2 hidden text-sm leading-relaxed text-[#6b5233] sm:block">
            Bentuk 100% akurat sesuai gambar referensi: tangan melengkung luwes &amp; santai persis Gambar 2, corak wajah lengkap (garis dahi &amp; pipi, moncong putih berawan, masker siam bersih), kepala bulat, dan dada-punggung mulus.
          </p>
        </div>

        {/* ── info card ── */}
        <aside className="pointer-events-auto hidden w-64 rounded-2xl bg-white/55 p-4 text-xs text-[#5c4529] shadow-[0_10px_40px_-12px_rgba(120,80,20,0.35)] ring-1 ring-white/70 backdrop-blur-md md:block">
          <button onClick={() => setInfoOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
            <span className="font-display text-sm font-semibold text-[#3b2a17]">Detail aset</span>
            <span className={cn('text-[#a35d1c] transition-transform', infoOpen ? 'rotate-180' : '')}>▾</span>
          </button>
          {infoOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/70 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-[#a07a4c]">Vertex</div>
                  <div className="font-display text-lg font-semibold text-[#3b2a17]">{ready ? fmt(totalVerts) : '…'}</div>
                </div>
                <div className="rounded-xl bg-white/70 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-[#a07a4c]">Segitiga</div>
                  <div className="font-display text-lg font-semibold text-[#3b2a17]">{ready ? fmt(totalTris) : '…'}</div>
                </div>
              </div>
              <ul className="space-y-1.5 leading-snug">
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Punggung &amp; dada mulus:</b> kontur halus mengalir dari leher ke pinggul tanpa lekukan bergelombang</li>
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Kepala membulat:</b> kubah bulat mulus dilihat dari depan, samping, dan belakang</li>
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Telinga proporsional:</b> sudut membulat natural di pojok kepala seperti referensi</li>
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Mata judes tanpa balok alis:</b> garis kelopak mata atas yang tajam &amp; bersih persis gambar 3</li>
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Lengan melengkung luwes:</b> bahu melandai mulus, lengan bawah melengkung santai dengan sarung tangan bulat persis Gambar 2</li>
                <li className="flex gap-2"><span className="text-[#df7f2c]">●</span><b>Corak wajah rapi:</b> 3 garis dahi rapi, 2 coretan pipi samping mata, moncong putih berawan lembut, dan masker Siam bersih</li>
              </ul>
            </div>
          )}
        </aside>
      </header>

      {/* ── controls ── */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-4 sm:p-6">
        <p className="text-[11px] font-semibold text-[#8a6a3f]/90">Seret untuk memutar · Scroll / cubit untuk zoom</p>
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[22px] bg-white/65 p-2 shadow-[0_14px_44px_-14px_rgba(120,80,20,0.45)] ring-1 ring-white/80 backdrop-blur-md">
          <div className="flex rounded-2xl bg-[#f3e6cb] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all sm:px-4',
                  view === v.id ? 'bg-white text-[#3b2a17] shadow-sm' : 'text-[#8a6a3f] hover:text-[#3b2a17]',
                )}
              >
                <span className="flex -space-x-1">
                  {v.dot.map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: c }} />
                  ))}
                </span>
                {v.label}
              </button>
            ))}
          </div>
          <div className="mx-0.5 hidden h-7 w-px bg-[#e4d3b0] sm:block" />
          <Toggle on={autoRotate} onClick={() => setAutoRotate((v) => !v)} label="Putar 360°" icon="↻" />
          <Toggle on={breathing} onClick={() => setBreathing((v) => !v)} label="Napas" icon="〜" />
          <button onClick={() => apiRef.current?.resetCamera()} className="rounded-xl px-3 py-2 text-sm font-bold text-[#8a6a3f] transition hover:bg-[#f3e6cb] hover:text-[#3b2a17]" title="Reset kamera">
            ⌖ <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            onClick={() => apiRef.current?.screenshot()}
            disabled={!ready}
            className="rounded-xl px-3 py-2 text-sm font-bold text-[#8a6a3f] transition hover:bg-[#f3e6cb] hover:text-[#3b2a17] disabled:opacity-40"
            title="Simpan gambar PNG"
          >
            ◉ <span className="hidden sm:inline">PNG</span>
          </button>
          <button
            onClick={doExport}
            disabled={!ready || exporting}
            className="rounded-xl bg-gradient-to-b from-[#f19a48] to-[#dc7a26] px-4 py-2 text-sm font-extrabold text-white shadow-[0_6px_16px_-6px_rgba(200,100,20,0.8)] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {exporting ? 'Mengekspor…' : `⬇ Unduh .GLB`}
          </button>
        </div>
      </div>

      {/* ── loading ── */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700',
          ready ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div className="w-[min(88vw,22rem)] rounded-3xl bg-white/70 p-6 text-center shadow-[0_20px_60px_-20px_rgba(120,80,20,0.5)] ring-1 ring-white/80 backdrop-blur-md">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f3a256] to-[#d9741f] text-2xl shadow-lg">
            <span className="animate-bounce">🐾</span>
          </div>
          <div className="font-display text-lg font-semibold text-[#3b2a17]">Memahat model 3D…</div>
          <div className="mt-1 text-xs text-[#8a6a3f]">
            {progress < 0.55 ? 'Membentuk kepala bulat, badan mulus, tangan & kaki' : progress < 0.85 ? 'Menyatukan pangkal bahu & ketiak' : 'Melukis bulu, belang & mata judes'}
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#f1e2c2]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#f3a256] to-[#d9741f] transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-2 font-display text-sm font-semibold text-[#a35d1c]">{Math.round(progress * 100)}%</div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition',
        on ? 'bg-[#3b2a17] text-[#fff3dc]' : 'text-[#8a6a3f] hover:bg-[#f3e6cb] hover:text-[#3b2a17]',
      )}
      aria-pressed={on}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
