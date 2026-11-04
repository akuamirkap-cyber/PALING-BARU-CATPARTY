import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { AssetHandle, AssetId, AssetMeta, AssetStats } from './assets/common';
import { SHIP_META, createShipAsset } from './assets/shipAsset';
import { STADIUM_META, createStadiumAsset } from './stadium/stadiumAsset';
import { BOWLING_META, createBowlingAsset } from './bowling/bowlingAsset';
import { BowlingControls, BowlingPopup, BowlingScoreboard, useBowling } from './components/BowlingHUD';
import { SKI_META, createSkiAsset } from './ski/skiAsset';
import { SkiControls, SkiOverlays, SkiStatus, useSki } from './components/SkiHUD';
import { SNOW_ENVS, type SnowSettings } from './scene/SnowSystem';
import type { BowlingSettings } from './scene/BowlingSystem';
import type { LightMode } from './bowling/controller';
import { Experience, type CamRequest, type SceneSettings } from './scene/Experience';
import { ENVIRONMENTS, type EnvKey } from './scene/environments';
import type { DroppedSpec } from './scene/Beasts';
import { BEAST_COLORS, createBeast, randomBeastColor, type HatKind } from './scene/beast';
import { downloadBlob, exportGLTF, exportOBJ, formatBytes, slugify } from './utils/exporters';
import { Card, ChunkyButton, ColorRow, Pill, SectionTitle, Toggle } from './components/ui';
import { cn } from './utils/cn';

type Tab = 'warna' | 'bagian' | 'suasana' | 'ekspor';

const METAS: Record<AssetId, AssetMeta> = { ship: SHIP_META, stadium: STADIUM_META, bowling: BOWLING_META, ski: SKI_META };
const FACTORIES: Record<AssetId, () => AssetHandle> = { ship: createShipAsset, stadium: createStadiumAsset, bowling: createBowlingAsset, ski: createSkiAsset };
const ASSET_ORDER: AssetId[] = ['ski', 'bowling', 'stadium', 'ship'];
const FILE_TAG: Record<AssetId, string> = { ship: 'kapal', stadium: 'stadion', bowling: 'bowling', ski: 'ski_gunung' };

const GL_OPTIONS = {
  preserveDrawingBuffer: true,
  antialias: true,
  toneMapping: THREE.NeutralToneMapping,
  toneMappingExposure: 1.05,
};

interface Custom {
  colors: Record<string, string>;
  presetId: string;
  name: string;
  parts: Record<string, boolean>;
}

const defaultCustom = (m: AssetMeta): Custom => ({
  colors: { ...m.presets[0].colors },
  presetId: m.presets[0].id,
  name: m.defaultName,
  parts: Object.fromEntries(m.partInfo.map((p) => [p.key, true])),
});

function readParams() {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const env = p.get('env');
  return {
    asset: (['ship', 'stadium', 'bowling', 'ski'].includes(p.get('asset') ?? '') ? p.get('asset') : 'ski') as AssetId,
    mode: (['normal', 'cosmic', 'disco'].includes(p.get('mode') ?? '') ? p.get('mode') : 'normal') as LightMode,
    bloom: p.get('bloom') !== '0',
    env: (env && env in ENVIRONMENTS ? env : 'day') as EnvKey,
    cam: p.get('cam') ?? 'hero',
    panel: p.get('panel') !== '0',
    refl: p.get('refl') !== '0',
    beasts: p.get('beasts') !== '0',
    ocean: p.get('ocean') !== '0',
  };
}

const HATS: { key: HatKind; label: string }[] = [
  { key: 'none', label: 'Polos' },
  { key: 'captain', label: 'Kapten' },
  { key: 'sailor', label: 'Pelaut' },
  { key: 'party', label: 'Pesta' },
];

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((s, i) =>
        s.startsWith('**') ? (
          <b key={i} className="text-ink">
            {s.slice(2, -2)}
          </b>
        ) : s.startsWith('`') ? (
          <code key={i} className="rounded bg-ink/10 px-1 font-mono text-[11px] text-ink">
            {s.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{s}</span>
        ),
      )}
    </>
  );
}

export default function App() {
  const params = useMemo(readParams, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cache = useRef<Partial<Record<AssetId, AssetHandle>>>({});
  const getAsset = useCallback((id: AssetId) => {
    if (!cache.current[id]) cache.current[id] = FACTORIES[id]();
    return cache.current[id] as AssetHandle;
  }, []);

  const [assetId, setAssetId] = useState<AssetId>(params.asset);
  const asset = useMemo(() => getAsset(assetId), [assetId, getAsset]);
  const meta = asset.meta;

  const [customs, setCustoms] = useState<Record<AssetId, Custom>>(() => ({
    ship: defaultCustom(SHIP_META),
    stadium: defaultCustom(STADIUM_META),
    bowling: defaultCustom(BOWLING_META),
    ski: defaultCustom(SKI_META),
  }));
  const custom = customs[assetId];
  const updateCustom = (patch: Partial<Custom>) => setCustoms((c) => ({ ...c, [assetId]: { ...c[assetId], ...patch } }));

  const [tab, setTab] = useState<Tab>('warna');
  const [panelOpen, setPanelOpen] = useState(() => params.panel && (typeof window === 'undefined' ? true : window.innerWidth >= 768));
  const [wireframe, setWireframe] = useState(false);
  const [settings, setSettings] = useState<SceneSettings>({
    env: params.env,
    showOcean: params.ocean,
    rocking: true,
    showBeasts: params.beasts,
    showSmoke: true,
    autoRotate: false,
    reflections: params.refl,
  });
  const [bowl, setBowl] = useState<BowlingSettings>({
    mode: params.mode,
    followBall: true,
    slowmo: true,
    sound: true,
    aiLanes: params.beasts,
    bloom: params.bloom,
    reflections: params.refl,
    beastBall: false,
  });
  const setB = <K extends keyof BowlingSettings>(k: K, v: BowlingSettings[K]) => setBowl((b) => ({ ...b, [k]: v }));
  const snap = useBowling(asset.bowling);
  const skiSnap = useSki(asset.ski);
  const [snow, setSnow] = useState<SnowSettings>({ follow: params.cam === 'hero', snowfall: true });
  const [skiOpp, setSkiOpp] = useState(3);
  const [skiSound, setSkiSound] = useState(true);
  useEffect(() => {
    asset.ski?.setOptions({ opponents: skiOpp, sound: skiSound, gates: custom.parts.gates !== false });
  }, [asset, skiOpp, skiSound, custom.parts.gates]);
  const skiPhase = skiSnap?.phase;
  useEffect(() => {
    if (skiPhase === 'countdown') setSnow((s) => (s.follow ? s : { ...s, follow: true }));
  }, [skiPhase]);
  const [camRequest, setCamRequest] = useState<CamRequest | null>({ key: params.cam, nonce: 1, instant: true });
  const [activeCam, setActiveCam] = useState<string | null>(params.cam);
  const [dropped, setDropped] = useState<DroppedSpec[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [stats, setStats] = useState<AssetStats>(() => asset.stats());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [beastColor, setBeastColor] = useState(BEAST_COLORS[0]);
  const [beastHat, setBeastHat] = useState<HatKind>('captain');
  const idRef = useRef(1);
  const toastTimer = useRef<number>(0);

  /* ---- sinkronisasi state → objek 3D ---- */
  useEffect(() => asset.setColors(custom.colors), [asset, custom.colors]);
  useEffect(() => asset.setName(custom.name), [asset, custom.name]);
  useEffect(() => asset.setWireframe(wireframe), [asset, wireframe]);
  useEffect(() => {
    Object.entries(custom.parts).forEach(([k, v]) => {
      const o = asset.parts[k];
      if (o) o.visible = v;
    });
    setStats(asset.stats());
  }, [asset, custom.parts]);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const refresh = () => Object.values(cache.current).forEach((a) => a?.refreshText());
    fonts.load('700 64px Fredoka').catch(() => undefined).finally(refresh);
    fonts.ready.then(refresh);
  }, []);

  useEffect(() => {
    const other: AssetId = assetId === 'ship' ? 'stadium' : 'ship';
    const id = window.setTimeout(() => {
      const a = getAsset(other);
      a.refreshText();
    }, 2500);
    return () => window.clearTimeout(id);
  }, [assetId, getAsset]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const set = <K extends keyof SceneSettings>(k: K, v: SceneSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const goCam = (key: string) => {
    if (asset.ski) setSnow((s) => ({ ...s, follow: false }));
    setActiveCam(key);
    setCamRequest({ key, nonce: Date.now() });
  };

  const followEnd = useCallback(() => {
    setActiveCam('hero');
    setCamRequest({ key: 'hero', nonce: Date.now() });
  }, []);

  const switchAsset = (id: AssetId) => {
    if (id === assetId) return;
    setDropped([]);
    setHover(null);
    setAssetId(id);
    setActiveCam('hero');
    setCamRequest({ key: 'hero', nonce: Date.now() });
  };

  const dropBeasts = useCallback(
    (n: number) => {
      const hats: HatKind[] = ['none', 'none', 'party', 'sailor', 'captain'];
      const { hx, hz } = meta.dropArea;
      const add: DroppedSpec[] = Array.from({ length: n }, () => ({
        id: idRef.current++,
        x: (asset.dropOrigin?.[0] ?? 0) + (Math.random() * 2 - 1) * hx,
        z: (asset.dropOrigin?.[2] ?? 0) + (Math.random() * 2 - 1) * hz,
        y0: 30 + Math.random() * 14,
        color: randomBeastColor(),
        hat: hats[Math.floor(Math.random() * hats.length)],
        spin: (Math.random() - 0.5) * 6,
      }));
      setDropped((prev) => [...prev, ...add].slice(-40));
    },
    [meta],
  );
  const onDroppedDone = useCallback((id: number) => setDropped((prev) => prev.filter((d) => d.id !== id)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'b' || e.key === 'B') dropBeasts(1);
      if (e.key === 'h' || e.key === 'H') dropBeasts(10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropBeasts]);

  /* ---- ekspor ---- */
  const base = `${slugify(custom.name)}_${FILE_TAG[assetId]}`;
  const doExport = async (fmt: 'glb' | 'gltf' | 'obj') => {
    if (busy) return;
    setBusy(fmt);
    await new Promise((r) => setTimeout(r, 40));
    try {
      const file = `${base}_gangbeasts.${fmt}`;
      const obj = asset.buildExport ? asset.buildExport() : asset.group;
      const size = fmt === 'obj' ? exportOBJ(obj, file) : await exportGLTF(obj, file, fmt === 'glb');
      showToast(`✅ ${file} terunduh (${formatBytes(size)})`);
    } catch (err) {
      console.error(err);
      showToast('❌ Ekspor gagal — cek konsol browser');
    } finally {
      setBusy(null);
    }
  };
  const exportBeast = async () => {
    if (busy) return;
    setBusy('beast');
    try {
      const rig = createBeast(beastColor, beastHat);
      const file = `gang_beast_${beastHat}.glb`;
      const size = await exportGLTF(rig.root, file, true);
      rig.dispose();
      showToast(`✅ ${file} terunduh (${formatBytes(size)})`);
    } catch (err) {
      console.error(err);
      showToast('❌ Ekspor karakter gagal');
    } finally {
      setBusy(null);
    }
  };
  const screenshot = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${base}_screenshot.png`);
      showToast('📸 Screenshot tersimpan');
    }, 'image/png');
  };

  const applyPreset = (id: string) => {
    const p = meta.presets.find((x) => x.id === id);
    if (p) updateCustom({ presetId: id, colors: { ...p.colors } });
  };

  const friendly = (n: string) => meta.friendly.find(([re]) => re.test(n))?.[1] ?? n;
  const previewKeys = Object.keys(meta.colorLabels).slice(0, 5);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'warna', label: 'Warna', icon: '🎨' },
    { key: 'bagian', label: 'Bagian', icon: '🧩' },
    { key: 'suasana', label: 'Suasana', icon: '🌦️' },
    { key: 'ekspor', label: 'Ekspor', icon: '📦' },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden font-display text-ink">
      {/* -------- Kanvas 3D -------- */}
      <div className="absolute inset-0">
        <Canvas ref={canvasRef} shadows="percentage" dpr={[1, 2]} camera={{ position: [60, 38, 52], fov: 40, near: 0.5, far: 1800 }} gl={GL_OPTIONS}>
          <Suspense fallback={null}>
            <Experience
              asset={asset}
              settings={settings}
              camRequest={camRequest}
              dropped={dropped}
              onDroppedDone={onDroppedDone}
              onHover={setHover}
              partsVisible={custom.parts}
              bowl={bowl}
              snow={snow}
              onFollowEnd={followEnd}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* -------- Judul, pemilih aset & statistik -------- */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-col gap-2 sm:left-4 sm:top-4 md:max-w-[calc(100%-400px)]">
        <Card className="pointer-events-auto flex items-center gap-3 px-3 py-2.5">
          <div className="wobble grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-sun text-2xl shadow-[0_3px_0_#1f2430]">
            {meta.emoji}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-none tracking-tight sm:text-2xl">
              Arena <span className="text-coral">Jelly</span>
            </h1>
            <p className="mt-1 truncate text-xs font-medium text-ink/60 sm:text-sm">
              Aset 3D gaya <b className="text-ink">Gang Beasts</b> · {meta.tagline}
            </p>
          </div>
        </Card>
        <div className="pointer-events-auto flex gap-1.5">
          {ASSET_ORDER.map((id) => (
            <ChunkyButton
              key={id}
              tone={id === assetId ? 'yellow' : 'white'}
              className={cn('px-3 py-1.5', id === assetId && 'translate-y-[2px] shadow-[0_2px_0_#1f2430]')}
              onClick={() => switchAsset(id)}
            >
              {METAS[id].emoji} {METAS[id].title}
              {id === 'ski' && <span className="rounded-md bg-coral px-1.5 text-[10px] font-bold uppercase text-white">baru</span>}
            </ChunkyButton>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <Pill>
            📏 {stats.size[0].toFixed(1)} × {stats.size[2].toFixed(1)} × {stats.size[1].toFixed(1)} m
          </Pill>
          <Pill>🔺 {stats.triangles.toLocaleString('id-ID')} segitiga</Pill>
          <Pill>🧩 {stats.meshes} mesh</Pill>
          {dropped.length > 0 && <Pill className="bg-sun">🫠 {dropped.length} beast</Pill>}
        </div>
        {snap && <BowlingScoreboard snap={snap} />}
        {skiSnap && <SkiStatus snap={skiSnap} />}
      </div>

      {/* -------- Tombol buka panel -------- */}
      {!panelOpen && (
        <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
          <ChunkyButton tone="yellow" onClick={() => setPanelOpen(true)} className="px-4 py-2 text-base">
            ⚙️ <span className="hidden sm:inline">Kustomisasi</span>
          </ChunkyButton>
        </div>
      )}

      {/* -------- Panel kanan -------- */}
      {panelOpen && (
        <Card className="absolute inset-x-2 bottom-2 z-20 flex max-h-[66vh] flex-col overflow-hidden md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[350px]">
          <div className="flex items-center justify-between border-b-[3px] border-ink bg-sun px-3 py-2">
            <div className="text-base font-bold">🛠️ Bengkel {meta.title}</div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-white text-sm font-bold shadow-[0_2px_0_#1f2430] active:translate-y-0.5 active:shadow-none"
              aria-label="Tutup panel"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 border-b-2 border-ink/15 p-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex flex-col items-center rounded-xl border-2 px-1 py-1.5 text-xs font-bold transition-all',
                  tab === t.key ? 'border-ink bg-white shadow-[0_3px_0_#1f2430]' : 'border-transparent text-ink/60 hover:border-ink/30 hover:bg-white/60',
                )}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="panel-scroll flex-1 overflow-y-auto p-3">
            {tab === 'warna' && (
              <div>
                <SectionTitle hint={meta.nameHint}>{meta.nameLabel}</SectionTitle>
                <input
                  value={custom.name}
                  maxLength={20}
                  onChange={(e) => updateCustom({ name: e.target.value })}
                  className="w-full rounded-xl border-[3px] border-ink bg-white px-3 py-2 text-base font-bold uppercase tracking-wide shadow-[0_3px_0_#1f2430] outline-none focus:bg-sun/20"
                  placeholder="Nama…"
                />
                <SectionTitle>Skema Warna</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {meta.presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={cn(
                        'rounded-xl border-2 p-2 text-left transition-all',
                        custom.presetId === p.id ? 'border-ink bg-white shadow-[0_3px_0_#1f2430]' : 'border-ink/20 bg-white/50 hover:border-ink/50',
                      )}
                    >
                      <div className="mb-1 flex h-4 overflow-hidden rounded-md border-2 border-ink">
                        {previewKeys.map((k) => (
                          <span key={k} className="flex-1" style={{ background: p.colors[k] }} />
                        ))}
                      </div>
                      <span className="text-xs font-bold">{p.name}</span>
                    </button>
                  ))}
                </div>
                <SectionTitle hint="Klik kotak warna untuk mengganti.">Warna Kustom</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(meta.colorLabels).map(([k, label]) => (
                    <ColorRow
                      key={k}
                      label={label}
                      value={custom.colors[k]}
                      onChange={(v) => updateCustom({ presetId: 'custom', colors: { ...custom.colors, [k]: v } })}
                    />
                  ))}
                </div>
              </div>
            )}

            {tab === 'bagian' && (
              <div className="flex flex-col gap-1.5">
                <SectionTitle hint="Bagian yang disembunyikan tidak ikut diekspor.">Komponen {meta.title}</SectionTitle>
                {meta.partInfo.map((p) => (
                  <Toggle
                    key={p.key}
                    label={p.label}
                    emoji={p.emoji}
                    hint={p.hint}
                    checked={custom.parts[p.key] !== false}
                    onChange={(v) => updateCustom({ parts: { ...custom.parts, [p.key]: v } })}
                  />
                ))}
                <SectionTitle>Tampilan</SectionTitle>
                <Toggle label="Mode Wireframe" emoji="🕸️" hint="Lihat topologi mesh low-poly" checked={wireframe} onChange={setWireframe} />
                <div className="mt-2 rounded-xl border-2 border-dashed border-ink/30 bg-white/60 p-2.5 text-xs leading-relaxed text-ink/70">
                  💡 Arahkan kursor ke aset untuk melihat <b>nama mesh</b> tiap bagian — berguna saat memberi collider di game engine.
                </div>
              </div>
            )}

            {tab === 'suasana' && meta.indoor && (
              <div>
                <SectionTitle hint="Mode lampu khas arena bowling.">Suasana Lampu</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['normal', '💡', 'Normal'],
                      ['cosmic', '🌌', 'Cosmic UV'],
                      ['disco', '🪩', 'Disko'],
                    ] as [LightMode, string, string][]
                  ).map(([k, icon, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setB('mode', k)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all',
                        bowl.mode === k ? 'border-ink bg-white shadow-[0_3px_0_#1f2430]' : 'border-ink/20 bg-white/50 hover:border-ink/50',
                      )}
                    >
                      <span className="text-2xl leading-none">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
                <SectionTitle hint="Semua dihitung realtime oleh mesin fisika.">Efek Permainan</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  <Toggle label="Kamera ikut bola" emoji="🎥" hint="Kejar bola lalu sorot pin deck" checked={bowl.followBall} onChange={(v) => setB('followBall', v)} />
                  <Toggle label="Slow-motion saat tumbukan" emoji="🐢" checked={bowl.slowmo} onChange={(v) => setB('slowmo', v)} />
                  <Toggle label="Suara sintesis" emoji="🔊" hint="Gemuruh bola, benturan pin, sorakan" checked={bowl.sound} onChange={(v) => setB('sound', v)} />
                  <Toggle label="Bola Beast meringkuk" emoji="🫠" hint="Ganti bola dengan beast yang menggelinding" checked={bowl.beastBall} onChange={(v) => setB('beastBall', v)} />
                  <Toggle label="Beast lain ikut main" emoji="🎳" hint="5 lintasan lain dimainkan AI" checked={bowl.aiLanes} onChange={(v) => setB('aiLanes', v)} />
                </div>
                <SectionTitle>Grafis</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  <Toggle label="Refleksi lintasan" emoji="🪞" hint="Kayu mengkilap memantulkan pin & neon" checked={bowl.reflections} onChange={(v) => setB('reflections', v)} />
                  <Toggle label="Glow neon (bloom)" emoji="✨" checked={bowl.bloom} onChange={(v) => setB('bloom', v)} />
                  <Toggle label="Putar kamera otomatis" emoji="🔄" checked={settings.autoRotate} onChange={(v) => set('autoRotate', v)} />
                </div>
              </div>
            )}

            {tab === 'suasana' && meta.snow && (
              <div>
                <SectionTitle hint="Cuaca pegunungan — memengaruhi kabut, cahaya & salju turun.">Cuaca Gunung</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SNOW_ENVS) as EnvKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set('env', k)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border-2 px-2.5 py-2.5 text-sm font-bold transition-all',
                        settings.env === k ? 'border-ink bg-white shadow-[0_3px_0_#1f2430]' : 'border-ink/20 bg-white/50 hover:border-ink/50',
                      )}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-ink text-lg" style={{ background: `linear-gradient(180deg, ${SNOW_ENVS[k].top}, ${SNOW_ENVS[k].horizon})` }}>
                        {SNOW_ENVS[k].icon}
                      </span>
                      {SNOW_ENVS[k].label}
                    </button>
                  ))}
                </div>
                <SectionTitle>Balapan</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  <Toggle label="Kamera kejar pembalap" emoji="🎥" hint="Matikan untuk kamera bebas / preset" checked={snow.follow} onChange={(v) => setSnow((s) => ({ ...s, follow: v }))} />
                  <Toggle label="Salju turun" emoji="❄️" checked={snow.snowfall} onChange={(v) => setSnow((s) => ({ ...s, snowfall: v }))} />
                  <Toggle label="Suara angin & sorakan" emoji="🔊" hint="Desir angin, carving, cowbell penonton" checked={skiSound} onChange={setSkiSound} />
                  <Toggle label="Putar kamera otomatis" emoji="🔄" checked={settings.autoRotate} onChange={(v) => set('autoRotate', v)} />
                </div>
              </div>
            )}

            {tab === 'suasana' && !meta.indoor && !meta.snow && (
              <div>
                <SectionTitle>Cuaca & Waktu</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ENVIRONMENTS) as EnvKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set('env', k)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border-2 px-2.5 py-2.5 text-sm font-bold transition-all',
                        settings.env === k ? 'border-ink bg-white shadow-[0_3px_0_#1f2430]' : 'border-ink/20 bg-white/50 hover:border-ink/50',
                      )}
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-ink text-lg"
                        style={{ background: `linear-gradient(180deg, ${ENVIRONMENTS[k].skyTop}, ${ENVIRONMENTS[k].waterShallow})` }}
                      >
                        {ENVIRONMENTS[k].icon}
                      </span>
                      {ENVIRONMENTS[k].label}
                    </button>
                  ))}
                </div>
                <SectionTitle hint="Laguna tropis dengan refraksi, kaustik & buih realtime.">Air Laut</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  <Toggle label="Laguna sebening kaca" emoji="🌊" hint="Matikan untuk mode studio (lihat lambung bawah)" checked={settings.showOcean} onChange={(v) => set('showOcean', v)} />
                  <Toggle label="Refleksi nyata di air" emoji="🪞" hint="Pantulan aset & langit — matikan jika FPS rendah" checked={settings.reflections} onChange={(v) => set('reflections', v)} />
                  <Toggle label="Aset bergoyang ombak" emoji="🎢" checked={settings.rocking} onChange={(v) => set('rocking', v)} />
                </div>
                <SectionTitle>Adegan</SectionTitle>
                <div className="flex flex-col gap-1.5">
                  <Toggle
                    label={assetId === 'stadium' ? 'Pertandingan Beast' : 'Kru Beast'}
                    emoji="🫠"
                    hint={assetId === 'stadium' ? 'Pemain, kiper, wasit & maskot raksasa' : 'Karakter jelly yang beraksi di dek'}
                    checked={settings.showBeasts}
                    onChange={(v) => set('showBeasts', v)}
                  />
                  {assetId === 'ship' && <Toggle label="Asap cerobong" emoji="💨" checked={settings.showSmoke} onChange={(v) => set('showSmoke', v)} />}
                  <Toggle label="Putar kamera otomatis" emoji="🔄" checked={settings.autoRotate} onChange={(v) => set('autoRotate', v)} />
                </div>
              </div>
            )}

            {tab === 'ekspor' && (
              <div>
                <SectionTitle hint="Hanya aset yang diekspor — laut, langit & karakter tidak ikut.">Unduh {meta.title}</SectionTitle>
                <ChunkyButton tone="coral" className="w-full py-3 text-base" onClick={() => doExport('glb')} disabled={!!busy}>
                  {busy === 'glb' ? '⏳ Mengekspor…' : '⬇️ Unduh .GLB'}
                  <span className="rounded-md bg-white/25 px-1.5 text-[10px] uppercase">disarankan</span>
                </ChunkyButton>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ChunkyButton tone="teal" onClick={() => doExport('gltf')} disabled={!!busy}>
                    {busy === 'gltf' ? '⏳…' : '📄 .GLTF'}
                  </ChunkyButton>
                  <ChunkyButton tone="white" onClick={() => doExport('obj')} disabled={!!busy} title="Geometri saja, tanpa material">
                    {busy === 'obj' ? '⏳…' : '🧱 .OBJ'}
                  </ChunkyButton>
                </div>
                <ChunkyButton tone="yellow" className="mt-2 w-full" onClick={screenshot}>
                  📸 Screenshot PNG
                </ChunkyButton>

                <SectionTitle hint="Karakter jelly ±1,35 m dengan rig sederhana (lengan & kaki terpisah).">Bonus: Karakter Beast</SectionTitle>
                <div className="rounded-xl border-2 border-ink/20 bg-white/60 p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {BEAST_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBeastColor(c)}
                        className={cn('h-7 w-7 rounded-full border-2 border-ink transition-transform', beastColor === c && 'scale-110 ring-2 ring-ink ring-offset-2')}
                        style={{ background: c }}
                        aria-label={`Warna ${c}`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {HATS.map((h) => (
                      <button
                        key={h.key}
                        type="button"
                        onClick={() => setBeastHat(h.key)}
                        className={cn('rounded-lg border-2 py-1 text-[11px] font-bold', beastHat === h.key ? 'border-ink bg-sun' : 'border-ink/20 bg-white hover:border-ink/50')}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                  <ChunkyButton tone="blue" className="mt-2 w-full" onClick={exportBeast} disabled={!!busy}>
                    {busy === 'beast' ? '⏳ Mengekspor…' : '🫠 Unduh Beast .GLB'}
                  </ChunkyButton>
                </div>

                <SectionTitle>Spesifikasi Aset</SectionTitle>
                <ul className="space-y-1 rounded-xl border-2 border-ink/20 bg-white/60 p-2.5 text-xs leading-relaxed text-ink/75">
                  <li>
                    🧊 Low-poly ±{Math.round(stats.triangles / 1000)}k segitiga, {stats.meshes} mesh bernama rapi
                  </li>
                  {meta.specs.map((s, i) => (
                    <li key={i}>
                      <Rich text={s} />
                    </li>
                  ))}
                </ul>

                <SectionTitle>Cara Pakai di Unity / Blender</SectionTitle>
                <ol className="list-decimal space-y-1 rounded-xl border-2 border-ink/20 bg-white/60 p-2.5 pl-6 text-xs leading-relaxed text-ink/75">
                  {meta.tips.map((s, i) => (
                    <li key={i}>
                      <Rich text={s} />
                    </li>
                  ))}
                  <li>Blender: File → Import → glTF 2.0 (.glb).</li>
                </ol>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* -------- Bawah kiri: inspeksi, kamera & beast -------- */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2 sm:bottom-4 sm:left-4 md:max-w-[calc(100%-400px)]',
          panelOpen && 'hidden md:flex',
        )}
      >
        {hover && (
          <div className="rounded-xl border-2 border-ink bg-ink px-3 py-1.5 text-sm font-semibold text-cream shadow-[0_3px_0_#00000055]">
            🔍 {friendly(hover)} <span className="ml-1 font-mono text-[11px] text-cream/60">{hover}</span>
          </div>
        )}
        <Card className="pointer-events-auto p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/60">🎥 Kamera</span>
            <span className="hidden text-[11px] text-ink/50 lg:inline">Seret = putar · Scroll = zoom · Klik kanan = geser</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meta.cameras.map((c) => (
              <ChunkyButton key={c.key} onClick={() => goCam(c.key)} active={activeCam === c.key} className="px-2.5 py-1 text-xs">
                {c.label}
              </ChunkyButton>
            ))}
          </div>
          {skiSnap && asset.ski ? (
            <div className="mt-2.5">
              <SkiControls ctl={asset.ski} snap={skiSnap} opponents={skiOpp} setOpponents={setSkiOpp} />
            </div>
          ) : snap && asset.bowling ? (
            <div className="mt-2.5">
              <BowlingControls ctl={asset.bowling} snap={snap} />
            </div>
          ) : (
            <>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/60">🫠 Uji Coba Arena</span>
            <span className="hidden text-[11px] text-ink/50 lg:inline">
              Tombol <kbd className="rounded border border-ink/30 bg-white px-1">B</kbd> / <kbd className="rounded border border-ink/30 bg-white px-1">H</kbd>
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <ChunkyButton tone="yellow" onClick={() => dropBeasts(1)} className="px-2.5 py-1 text-xs">
              🪂 Jatuhkan Beast
            </ChunkyButton>
            <ChunkyButton tone="teal" onClick={() => dropBeasts(10)} className="px-2.5 py-1 text-xs">
              🌧️ Hujan Beast ×10
            </ChunkyButton>
            <ChunkyButton onClick={() => setDropped([])} disabled={dropped.length === 0} className="px-2.5 py-1 text-xs">
              🧹 Bersihkan
            </ChunkyButton>
          </div>
            </>
          )}
        </Card>
      </div>

      {snap && <BowlingPopup message={snap.message} />}
      {skiSnap && asset.ski && <SkiOverlays ctl={asset.ski} snap={skiSnap} />}

      {/* -------- Toast -------- */}
      {toast && (
        <div className="toast-pop pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-2xl border-[3px] border-ink bg-white px-4 py-2.5 text-sm font-bold shadow-[0_5px_0_#1f2430] md:top-5">
          {toast}
        </div>
      )}
    </div>
  );
}
