import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ArrowLeft, Crown, Hand, RotateCcw, Camera, Sparkles,
  Box, Layers, Palette, RefreshCw, Star, LifeBuoy, Glasses, Skull, Footprints,
  BookOpen, Zap, Search, Shirt, Medal, CircleDot, Brush,
} from 'lucide-react';
import CrownModel, { CROWN_THEMES } from './assets/CrownModel';
import GlovesModel, { GLOVE_THEMES } from './assets/GlovesModel';
import CowboyHatModel, { COWBOY_THEMES } from './assets/CowboyHatModel';
import DuckFloatModel, { DUCK_THEMES } from './assets/DuckFloatModel';
import SunglassesModel, { SHADES_THEMES } from './assets/SunglassesModel';
import AfroModel, { AFRO_THEMES } from './assets/AfroModel';
import JasonMaskModel, { JASON_THEMES } from './assets/JasonMaskModel';
import SandalModel, { SANDAL_THEMES } from './assets/SandalModel';
import NerdGlassesModel, { NERD_THEMES } from './assets/NerdGlassesModel';
import CoolGlassesModel, { COOL_THEMES } from './assets/CoolGlassesModel';
import DetectiveGlassesModel, { DETECTIVE_THEMES } from './assets/DetectiveGlassesModel';
import BoxerShortsModel, { BOXER_THEMES } from './assets/BoxerShortsModel';
import ChampionBeltModel, { BELT_THEMES } from './assets/ChampionBeltModel';
import ClownNoseModel, { NOSE_THEMES } from './assets/ClownNoseModel';
import BroomModel, { BROOM_THEMES } from './assets/BroomModel';
import { sound } from '../utils/sound';

type AssetId = 'crown' | 'gloves' | 'cowboy' | 'duck' | 'shades' | 'afro' | 'jason' | 'sandal' | 'nerd' | 'cool' | 'detective' | 'boxer' | 'belt' | 'nose' | 'broom';

const STATS: Record<AssetId, { label: string; rarity: string; desc: string; bars: [string, number][]; tris: string }> = {
  crown: {
    label: 'ROYAL CROWN',
    rarity: 'LEGENDARY',
    desc: 'Mahkota premium: duri ber-collar + orb emas, permata coral dalam bezel, band bersih tanpa garis.',
    bars: [['KILAU', 100], ['GAYA', 100], ['POWER', 45]],
    tris: '± 2.2k tris',
  },
  jason: {
    label: 'HOCKEY MASK',
    rarity: 'EPIC',
    desc: 'Topeng hockey gaya slasher malam jumat: segitiga merah + ventilasi. Fear aura +60%, lawan auto jaga jarak.',
    bars: [['SERAM', 96], ['GAYA', 80], ['POWER', 40]],
    tris: '± 1.3k tris',
  },
  sandal: {
    label: 'SANDAL SANTAI',
    rarity: 'RARE',
    desc: 'Sandal jepit arena: sol tebal empuk + tali Y. Bunyi "plok-plok" menambah moral +20.',
    bars: [['SANTAI', 100], ['GAYA', 70], ['POWER', 15]],
    tris: '± 1.1k tris',
  },
  nerd: {
    label: 'NERD GLASSES',
    rarity: 'RARE',
    desc: 'Kacamata oversize + plester di bridge. IQ +50, damage ejekan teman +100.',
    bars: [['PINTAR', 100], ['GAYA', 75], ['POWER', 20]],
    tris: '± 0.9k tris',
  },
  cool: {
    label: 'COOL SHADES',
    rarity: 'EPIC',
    desc: 'Wayfarer kotak + brow bar emas. Siapapun yang pakai auto terlihat keren.',
    bars: [['GAYA', 100], ['KILAU', 85], ['POWER', 30]],
    tris: '± 1.0k tris',
  },
  detective: {
    label: 'DETECTIVE SPECS',
    rarity: 'EPIC',
    desc: 'Bingkai emas tipis + lensa bening. Petunjuk tersembunyi +80%, misteri -50%.',
    bars: [['PINTAR', 90], ['GAYA', 88], ['POWER', 25]],
    tris: '± 0.9k tris',
  },
  boxer: {
    label: 'CELANA BOXER',
    rarity: 'RARE',
    desc: 'Boxer elastis arena: karet tidak melorot + tali serut. Lari +15%, pede +50%.',
    bars: [['NYAMAN', 100], ['GAYA', 78], ['POWER', 20]],
    tris: '± 1.2k tris',
  },
  belt: {
    label: 'SABUK JUARA',
    rarity: 'LEGENDARY',
    desc: 'Sabuk emas juara dunia: medali besar + plat samping + paku keliling. Yang pakai auto ditantang.',
    bars: [['GENGSI', 100], ['GAYA', 100], ['POWER', 60]],
    tris: '± 1.6k tris',
  },
  nose: {
    label: 'HIDUNG BADUT',
    rarity: 'RARE',
    desc: 'Hidung merah mengkilap + tali elastis. Dipencet bunyi "prit!", musuh auto ketawa.',
    bars: [['LUCU', 100], ['GAYA', 60], ['POWER', 5]],
    tris: '± 0.5k tris',
  },
  broom: {
    label: 'SAPU SAKTI',
    rarity: 'EPIC',
    desc: 'Senjata sapu arena: gagang kayu + kepala jerami + rumbai. Sapuan 360 derajat tak terhentikan.',
    bars: [['POWER', 90], ['GAYA', 70], ['JARAK', 85]],
    tris: '± 1.0k tris',
  },
  gloves: {
    label: 'CHAMP GLOVES',
    rarity: 'EPIC',
    desc: 'Sarung tinju vinil super simple: mitt + jempol + manset. Damage tackle +25%, cocok buat tukang dorong.',
    bars: [['POWER', 95], ['GAYA', 82], ['KILAU', 60]],
    tris: '± 1.2k tris',
  },
  cowboy: {
    label: 'TOPI KOBOY',
    rarity: 'RARE',
    desc: 'Topi koboy sheriff: rolled edge, conchos emas, pita samping + badge. Efek intimidasi +50% saat adu tatap.',
    bars: [['GAYA', 92], ['POWER', 30], ['KILAU', 65]],
    tris: '± 1.3k tris',
  },
  duck: {
    label: 'BEBEK APUNG',
    rarity: 'EPIC',
    desc: 'Pelampung bebek paling laris: mata sparkle, pipi pink, sayap + kilau ban. Auto mengapung di map air.',
    bars: [['LUCU', 100], ['GAYA', 94], ['POWER', 20]],
    tris: '± 1.6k tris',
  },
  shades: {
    label: 'KACAMATA HITAM',
    rarity: 'RARE',
    desc: 'Kacamata beneran: bingkai penuh, lensa kaca gelap, double bridge + bantalan hidung. Aura +100%.',
    bars: [['GAYA', 97], ['KILAU', 75], ['POWER', 35]],
    tris: '± 1.2k tris',
  },
  afro: {
    label: 'AFRO PELANGI',
    rarity: 'LEGENDARY',
    desc: 'Kribo badut: ikal variatif + topi pesta mini nangkring miring. Bantalan kepala +30% saat terbanting.',
    bars: [['LUCU', 100], ['GAYA', 100], ['POWER', 25]],
    tris: '± 1.9k tris',
  },
};

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} color="#FFF6E0" />
      <directionalLight position={[-5, 3, -2]} intensity={0.5} color="#7EB8FF" />
      <spotLight position={[0, 8, 2]} angle={0.45} penumbra={1} intensity={80} color="#FFE9B8" />
      <pointLight position={[0, 0.5, 4]} intensity={8} color="#FFC53D" />
      <Environment resolution={256} frames={1}>
        <group rotation={[-Math.PI / 3, 0, 1]}>
          <Lightformer form="circle" intensity={5} position={[0, 5, -9]} scale={2.5} color="#FFF6E0" />
          <Lightformer form="rect" intensity={2.5} position={[-5, 1, -1]} scale={[3, 1.2]} color="#7EB8FF" />
          <Lightformer form="rect" intensity={2.5} position={[5, 1, -1]} scale={[3, 1.2]} color="#FF9E0B" />
          <Lightformer form="rect" intensity={1.5} position={[0, 5, 5]} scale={[4, 2]} color="#FFFFFF" />
        </group>
      </Environment>
    </>
  );
}

function Pedestal() {
  return (
    <group position={[0, -1.55, 0]}>
      <mesh>
        <cylinderGeometry args={[1.45, 1.65, 0.32, 48]} />
        <meshStandardMaterial color="#23232E" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.45, 0.045, 12, 64]} />
        <meshStandardMaterial color="#FFE27A" metalness={1} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.3, 48]} />
        <meshBasicMaterial color="#FFC53D" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

export default function AssetStudio({ onLeave, onToast }: { onLeave: () => void; onToast: (m: string) => void }) {
  const [asset, setAsset] = useState<AssetId>('crown');
  const [themeIdx, setThemeIdx] = useState<Record<AssetId, number>>({ crown: 0, gloves: 0, cowboy: 0, duck: 0, shades: 0, afro: 0, jason: 0, sandal: 0, nerd: 0, cool: 0, detective: 0, boxer: 0, belt: 0, nose: 0, broom: 0 });
  const [spin, setSpin] = useState(true);
  const [wire, setWire] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const info = STATS[asset];
  const themeList =
    asset === 'crown' ? CROWN_THEMES
    : asset === 'gloves' ? GLOVE_THEMES
    : asset === 'cowboy' ? COWBOY_THEMES
    : asset === 'duck' ? DUCK_THEMES
    : asset === 'shades' ? SHADES_THEMES
    : asset === 'jason' ? JASON_THEMES
    : asset === 'sandal' ? SANDAL_THEMES
    : asset === 'nerd' ? NERD_THEMES
    : asset === 'cool' ? COOL_THEMES
    : asset === 'detective' ? DETECTIVE_THEMES
    : asset === 'boxer' ? BOXER_THEMES
    : asset === 'belt' ? BELT_THEMES
    : asset === 'nose' ? NOSE_THEMES
    : asset === 'broom' ? BROOM_THEMES
    : AFRO_THEMES;
  const selIdx = themeIdx[asset] % themeList.length;

  const swatchOf = (t: (typeof themeList)[number]): [string, string] => {
    if ('velvet' in t) return [t.band, t.velvet];
    if ('cuff' in t) return [t.main, t.cuff];
    if ('beak' in t) return [t.body, t.beak];
    if ('colors' in t) return [t.colors[0], t.colors[1] ?? t.colors[0]];
    if ('arms' in t) return [t.main, t.arms];
    if ('mark' in t) return [t.base, t.mark];
    if ('gold' in t) return [t.strap, t.gold];
    if ('sole' in t) return [t.sole, t.strap];
    if ('accent' in t) return [t.main, t.accent];
    if ('head' in t) return [t.stick, t.head];
    return [t.main, t.band];
  };

  const exportPNG = () => {
    const canvas = stageRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${info.label.toLowerCase().replace(/\s+/g, '-')}-bouncepaws.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    sound.success();
    onToast('PNG aset tersimpan ke perangkat!');
  };

  const Switch = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-[#1E9E6A]' : 'bg-white/15'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.06, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#101018] font-[Baloo_2] text-white"
    >
      {/* bg */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,#2E2A3F_0%,#17171F_60%,#0C0C11_100%)]" />
        <div className="absolute left-1/2 top-[-120px] h-[340px] w-[640px] -translate-x-1/2 rounded-full bg-[#FFC53D]/15 blur-[80px]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
      </div>

      {/* header */}
      <div className="relative z-20 flex items-center justify-between px-3 pt-3 sm:px-6">
        <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-2">
          <button onClick={onLeave} className="group flex items-center gap-1.5 rounded-full bg-white/10 py-2 pl-2.5 pr-4 text-xs font-black tracking-wider backdrop-blur transition hover:bg-[#E23A1E]">
            <ArrowLeft size={16} strokeWidth={3} className="transition group-hover:-translate-x-0.5" /> STUDIO
          </button>
        </motion.div>
        <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-black tracking-[0.34em] text-[#FFC53D]"><Box size={12} strokeWidth={3} /> 3D ASSET STUDIO</div>
          <AnimatePresence mode="wait">
            <motion.h1 key={asset} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="font-display text-2xl leading-none sm:text-3xl">
              {info.label}
            </motion.h1>
          </AnimatePresence>
        </motion.div>
        <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[11px] font-black sm:flex"><Layers size={13} /> {info.tris}</span>
          <span className="rounded-full bg-gradient-to-r from-[#E23A1E] to-[#FF6A00] px-3.5 py-2 text-[11px] font-black tracking-widest">{info.rarity}</span>
        </motion.div>
      </div>

      {/* body */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 gap-3 overflow-y-auto p-3 nice-scroll sm:p-5 lg:grid-cols-[1fr_300px] lg:overflow-hidden">
        {/* 3D stage */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          ref={stageRef}
          className="relative min-h-[380px] overflow-hidden rounded-[24px] border border-white/10 bg-black/30 shadow-[0_24px_60px_rgba(0,0,0,0.5)] lg:min-h-0"
        >
          <Canvas dpr={[1, 2]} camera={{ position: [0, 0.9, 6.2], fov: 34 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
            <StudioLights />
            <Float speed={2} rotationIntensity={0.15} floatIntensity={0.55}>
              {asset === 'crown' && <CrownModel theme={CROWN_THEMES[themeIdx.crown % CROWN_THEMES.length]} wireframe={wire} />}
              {asset === 'gloves' && <GlovesModel theme={GLOVE_THEMES[themeIdx.gloves % GLOVE_THEMES.length]} wireframe={wire} />}
              {asset === 'cowboy' && <CowboyHatModel theme={COWBOY_THEMES[themeIdx.cowboy % COWBOY_THEMES.length]} wireframe={wire} />}
              {asset === 'duck' && <DuckFloatModel theme={DUCK_THEMES[themeIdx.duck % DUCK_THEMES.length]} wireframe={wire} />}
              {asset === 'shades' && <SunglassesModel theme={SHADES_THEMES[themeIdx.shades % SHADES_THEMES.length]} wireframe={wire} />}
              {asset === 'afro' && <AfroModel theme={AFRO_THEMES[themeIdx.afro % AFRO_THEMES.length]} wireframe={wire} />}
              {asset === 'jason' && <JasonMaskModel theme={JASON_THEMES[themeIdx.jason % JASON_THEMES.length]} wireframe={wire} />}
              {asset === 'sandal' && <SandalModel theme={SANDAL_THEMES[themeIdx.sandal % SANDAL_THEMES.length]} wireframe={wire} />}
              {asset === 'nerd' && <NerdGlassesModel theme={NERD_THEMES[themeIdx.nerd % NERD_THEMES.length]} wireframe={wire} />}
              {asset === 'cool' && <CoolGlassesModel theme={COOL_THEMES[themeIdx.cool % COOL_THEMES.length]} wireframe={wire} />}
              {asset === 'detective' && <DetectiveGlassesModel theme={DETECTIVE_THEMES[themeIdx.detective % DETECTIVE_THEMES.length]} wireframe={wire} />}
              {asset === 'boxer' && <BoxerShortsModel theme={BOXER_THEMES[themeIdx.boxer % BOXER_THEMES.length]} wireframe={wire} />}
              {asset === 'belt' && <ChampionBeltModel theme={BELT_THEMES[themeIdx.belt % BELT_THEMES.length]} wireframe={wire} />}
              {asset === 'nose' && <ClownNoseModel theme={NOSE_THEMES[themeIdx.nose % NOSE_THEMES.length]} wireframe={wire} />}
              {asset === 'broom' && <BroomModel theme={BROOM_THEMES[themeIdx.broom % BROOM_THEMES.length]} wireframe={wire} />}
            </Float>
            <Pedestal />
            <ContactShadows position={[0, -1.37, 0]} opacity={0.55} scale={8} blur={2.4} far={3} resolution={512} color="#000000" />
            <OrbitControls
              ref={controlsRef} makeDefault
              autoRotate={spin} autoRotateSpeed={2.4}
              enablePan={false} minDistance={3.4} maxDistance={10}
              maxPolarAngle={1.52} minPolarAngle={0.35}
              target={[0, 0, 0]}
            />
          </Canvas>

          {/* stage overlay UI */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[10px] font-black tracking-[0.22em] text-white/70 backdrop-blur">
            <RefreshCw size={11} strokeWidth={3} /> DRAG UNTUK PUTAR • SCROLL UNTUK ZOOM
          </div>
          <div className="absolute bottom-4 left-4 flex gap-2">
            <button onClick={() => { controlsRef.current?.reset(); sound.whoosh(); }} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[11px] font-black backdrop-blur transition hover:bg-white/25">
              <RotateCcw size={13} strokeWidth={3} /> RESET
            </button>
            <button onClick={exportPNG} className="flex items-center gap-1.5 rounded-full bg-[#FFC53D] px-3.5 py-2 text-[11px] font-black text-[#3A2317] transition hover:bg-white">
              <Camera size={13} strokeWidth={3} /> PNG
            </button>
          </div>
          <div className="absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1.5 font-display text-sm text-[#FFC53D] backdrop-blur">360°</div>
          {/* flash juicy tiap ganti aset */}
          <motion.div
            key={'flash-' + asset}
            initial={{ opacity: 0.55, scale: 0.82 }}
            animate={{ opacity: 0, scale: 1.18 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-3 rounded-[20px] ring-4 ring-[#FFC53D]"
          />
        </motion.div>

        {/* control panel */}
        <motion.div key={'panel-' + asset} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 24 }} className="flex flex-col gap-3 lg:overflow-y-auto nice-scroll">
          {/* asset tabs */}
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/[.06] p-1.5">
            {([
              { id: 'crown' as AssetId, icon: Crown, label: 'CROWN' },
              { id: 'gloves' as AssetId, icon: Hand, label: 'GLOVES' },
              { id: 'cowboy' as AssetId, icon: Star, label: 'KOBOY' },
              { id: 'duck' as AssetId, icon: LifeBuoy, label: 'BEBEK' },
              { id: 'shades' as AssetId, icon: Glasses, label: 'KACAMATA' },
              { id: 'afro' as AssetId, icon: Palette, label: 'AFRO' },
              { id: 'jason' as AssetId, icon: Skull, label: 'MASK' },
              { id: 'sandal' as AssetId, icon: Footprints, label: 'SANDAL' },
              { id: 'nerd' as AssetId, icon: BookOpen, label: 'NERD' },
              { id: 'cool' as AssetId, icon: Zap, label: 'COOL' },
              { id: 'detective' as AssetId, icon: Search, label: 'DETEK' },
              { id: 'boxer' as AssetId, icon: Shirt, label: 'BOXER' },
              { id: 'belt' as AssetId, icon: Medal, label: 'SABUK' },
              { id: 'nose' as AssetId, icon: CircleDot, label: 'HIDUNG' },
              { id: 'broom' as AssetId, icon: Brush, label: 'SAPU' },
            ]).map((t, ti) => (
              <button
                key={t.id}
                onClick={() => { setAsset(t.id); sound.select(ti); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 font-display text-[13px] transition ${asset === t.id ? 'bg-gradient-to-r from-[#FFC53D] to-[#FF8A00] text-[#3A2317] shadow' : 'text-white/50 hover:text-white'}`}
              >
                <t.icon size={17} strokeWidth={2.6} /> {t.label}
              </button>
            ))}
          </div>

          {/* themes */}
          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black tracking-[0.2em] text-white/60"><Palette size={14} /> VARIAN WARNA</div>
            <div className="grid grid-cols-2 gap-2">
            {themeList.map((t, i) => {
              const sel = selIdx === i;
              const [c1, c2] = swatchOf(t);
              return (
                <button
                  key={t.name}
                  onClick={() => { setThemeIdx((s) => ({ ...s, [asset]: i })); sound.select(i); }}
                    className={`flex items-center gap-2.5 rounded-xl p-2.5 text-left transition ${sel ? 'bg-white/15 ring-2 ring-[#FFC53D]' : 'bg-white/[.04] hover:bg-white/10'}`}
                  >
                    <span className="h-9 w-9 shrink-0 rounded-full border-2 border-white/30" style={{ background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` }} />
                    <span className="text-[12px] font-black leading-tight">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* view options */}
          <div className="space-y-2.5 rounded-2xl bg-white/[.06] p-4">
            <button onClick={() => { setSpin(!spin); sound.click(); }} className="flex w-full items-center justify-between text-sm font-black">
              <span className="flex items-center gap-2"><RefreshCw size={16} className={spin ? 'animate-spin text-[#FFC53D]' : 'text-white/40'} /> PUTAR OTOMATIS</span>
              <Switch on={spin} onClick={() => setSpin(!spin)} />
            </button>
            <button onClick={() => { setWire(!wire); sound.click(); }} className="flex w-full items-center justify-between text-sm font-black">
              <span className="flex items-center gap-2"><Box size={16} className={wire ? 'text-[#FFC53D]' : 'text-white/40'} /> MODE WIREFRAME</span>
              <Switch on={wire} onClick={() => setWire(!wire)} />
            </button>
          </div>

          {/* specs */}
          <div className="rounded-2xl bg-white/[.06] p-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-black tracking-[0.2em] text-white/60"><Sparkles size={14} /> {info.rarity} • {info.tris}</div>
            <p className="text-[13px] font-bold leading-snug text-white/70">{info.desc}</p>
            <div className="mt-3 space-y-2">
              {info.bars.map(([k, v], i) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-[11px] font-black tracking-widest text-white/60"><span>{k}</span><span className="text-[#FFC53D]">{v}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: 0.6 + i * 0.12, type: 'spring', stiffness: 120, damping: 20 }} className="h-full rounded-full bg-gradient-to-r from-[#FFC53D] to-[#E23A1E]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={exportPNG} className="shine flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFC53D] to-[#FF8A00] py-3.5 font-display text-xl text-[#3A2317] shadow-[0_6px_0_#7A3600] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none">
            <Camera size={20} strokeWidth={2.8} /> SIMPAN PNG ASET
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
