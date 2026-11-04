import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight, Info, Volume2, VolumeX, Play, Gift, ShoppingBag,
  Users, Trophy, Mail, Coins, Gem, Zap, Signal, MessageCircle, Smile, Settings as SettingsIcon, Boxes, Crown, Hand
} from 'lucide-react';
import BallScene from './components/BallScene';
import LobbyScreen, { LobbyWipe } from './components/LobbyScreen';
import AssetStudio from './components/AssetStudio';
import { sound } from './utils/sound';
import {
  QuickMatchModal, CustomModal, TutorialModal, LockerModal,
  SettingsModal, ExitModal, VoteModal, DraculaModal, InfoModal
} from './components/Modals';

type ModalKind = 'quick' | 'custom' | 'tutorial' | 'locker' | 'settings' | 'exit' | 'vote' | 'dracula' | 'info' | null;

const MENU: { id: Exclude<ModalKind, null>; label: string; badge?: string; big?: boolean }[] = [
  { id: 'quick', label: 'QUICK MATCH' },
  { id: 'custom', label: 'CUSTOM GAME', big: true },
  { id: 'tutorial', label: 'TUTORIAL' },
  { id: 'locker', label: 'LOCKER', badge: 'N' },
  { id: 'settings', label: 'SETTINGS' },
  { id: 'exit', label: 'EXIT GAME' },
];

export default function App() {
  const [modal, setModal] = useState<ModalKind>(null);
  const [active, setActive] = useState<string>('quick');
  const [muted, setMuted] = useState(() => sound.muted);

  // Nyalakan audio + musik saat interaksi pertama (aturan autoplay browser)
  useEffect(() => {
    const wake = () => {
      sound.ensure();
      if (!sound.muted) sound.startMusic();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    sound.setMuted(m);
    if (!m) sound.click();
  };
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [leftBall, setLeftBall] = useState('#FF7A00');
  const [rightBall, setRightBall] = useState('#FFF1C8');
  const [online] = useState(12842);
  const [screen, setScreen] = useState<'menu' | 'lobby' | 'assets'>('menu');
  const [wipe, setWipe] = useState<null | { mode: 'join' | 'leave'; title: string }>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    sound.pop();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const enterLobby = useCallback(() => {
    if (wipe) return;
    setModal(null);
    sound.whoosh();
    setWipe({ mode: 'join', title: 'JOINING LOBBY...' });
    setTimeout(() => setScreen('lobby'), 560);
    setTimeout(() => setWipe(null), 1500);
  }, [wipe]);

  const leaveLobby = useCallback(() => {
    if (wipe) return;
    sound.whoosh();
    setWipe({ mode: 'leave', title: 'BACK TO MENU...' });
    setTimeout(() => setScreen('menu'), 560);
    setTimeout(() => setWipe(null), 1500);
  }, [wipe]);

  const enterAssets = useCallback(() => {
    if (wipe) return;
    setModal(null);
    sound.whoosh();
    setWipe({ mode: 'join', title: 'OPENING ASSET STUDIO...' });
    setTimeout(() => setScreen('assets'), 560);
    setTimeout(() => setWipe(null), 1500);
  }, [wipe]);

  const leaveAssets = useCallback(() => {
    if (wipe) return;
    sound.whoosh();
    setWipe({ mode: 'leave', title: 'BACK TO MENU...' });
    setTimeout(() => setScreen('menu'), 560);
    setTimeout(() => setWipe(null), 1500);
  }, [wipe]);

  // keyboard navigation ala game console
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (modal || loading || screen !== 'menu' || wipe) return;
      const idx = MENU.findIndex((m) => m.id === active);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(MENU[(idx + 1) % MENU.length].id);
        sound.hover();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(MENU[(idx - 1 + MENU.length) % MENU.length].id);
        sound.hover();
      } else if (e.key === 'Enter') {
        setModal(active as ModalKind);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [active, modal, loading, screen, wipe]);

  const open = (id: ModalKind) => {
    if (!id) return;
    setActive(id);
    setModal(id);
    // bunyi open dimainkan Shell saat popup muncul
  };

  return (
    <div className="grain relative flex min-h-screen w-full flex-col overflow-hidden bg-[#FF9E0B] font-[Baloo_2] text-[#3A2317] selection:bg-[#3A2317] selection:text-[#FFF7DC]">
      {/* ===== BACKGROUND LAYERS ===== */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_42%,#FFC53D_0%,#FFA914_42%,#FF9A00_68%,#F58A00_100%)]" />
        <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} className="absolute -left-32 top-[-80px] h-[420px] w-[420px] rounded-full bg-[#FFC53D]/60 blur-[90px]" />
        <motion.div animate={{ x: [0, -24, 0], y: [0, 18, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} className="absolute -right-24 bottom-[-60px] h-[460px] w-[460px] rounded-full bg-[#FF7A00]/70 blur-[90px]" />
        {/* dotted pattern */}
        <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'radial-gradient(rgba(122,54,0,0.55) 1.6px, transparent 1.6px)', backgroundSize: '26px 26px' }} />
        {/* giant soft ring behind balls */}
        <div className="absolute left-1/2 top-[46%] h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[36px] border-white/[.07]" />
        <div className="absolute left-1/2 top-[46%] h-[420px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[.10] blur-[50px]" />
        {/* paw prints floating */}
        <FloatingPaw className="left-[6%] top-[12%] rotate-[-14deg]" delay={0} />
        <FloatingPaw className="bottom-[24%] left-[42%] rotate-[18deg] scale-75" delay={1.2} />
        <FloatingPaw className="right-[8%] top-[52%] rotate-[10deg] scale-90" delay={0.6} />
        {/* vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_90%_at_50%_50%,transparent_55%,rgba(122,54,0,0.28)_100%)]" />
      </div>

      {/* ===== SPLASH ===== */}
      <AnimatePresence>
        {loading && (
          <motion.div exit={{ opacity: 0, scale: 1.06 }} className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FF9E0B]">
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="flex items-center gap-3">
              <div className="grid h-20 w-20 place-items-center rounded-[26px] bg-[#FFF7DC] shadow-[0_10px_0_rgba(90,38,0,0.25)]">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#E23A1E] shadow-[inset_-6px_-8px_0_rgba(0,0,0,0.2),inset_4px_6px_0_rgba(255,255,255,0.5)]" />
                  <div className="absolute left-2 top-1.5 h-3.5 w-3.5 rounded-full bg-white/90" />
                </div>
              </div>
              <div>
                <div className="font-display text-4xl leading-none text-[#FFF7DC] drop-shadow-[0_3px_0_rgba(122,54,0,0.5)]">BOUNCE PAWS</div>
                <div className="text-[12px] font-black tracking-[0.34em] text-[#7A3600]">PARTY ARENA 3D</div>
              </div>
            </motion.div>
            <div className="mt-8 h-3 w-56 overflow-hidden rounded-full bg-black/15">
              <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 1.2, ease: 'easeInOut' }} className="h-full rounded-full bg-[#FFF7DC]" />
            </div>
            <div className="mt-3 text-xs font-black tracking-[0.3em] text-[#7A3600]/70">LOADING ARENA...</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TOP BAR ===== */}
      <header className="relative z-20 flex items-start justify-between px-5 pt-5 sm:px-8">
        <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.55 }} className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#FFF7DC] pill-shadow">
            <div className="relative h-7 w-7">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#E23A1E] shadow-[inset_-4px_-5px_0_rgba(0,0,0,0.2),inset_3px_4px_0_rgba(255,255,255,0.5)]" />
              <div className="absolute left-1.5 top-1 h-2 w-2 rounded-full bg-white/90" />
            </div>
          </div>
          <div className="leading-none">
            <div className="font-display text-[22px] text-[#FFF7DC] menu-shadow">BOUNCE PAWS</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-black tracking-[0.28em] text-[#7A3600]">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7DC]/90 px-2 py-0.5"><Signal size={10} strokeWidth={3} /> {online.toLocaleString('id-ID')} ONLINE</span>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.6 }} className="flex items-center gap-2.5">
          <button onClick={toggleMute} title={muted ? 'Nyalakan suara & musik' : 'Matikan suara & musik'} className="grid h-10 w-10 place-items-center rounded-full bg-[#FFF7DC]/20 text-[#FFF7DC] backdrop-blur transition hover:scale-110 hover:bg-[#FFF7DC] hover:text-[#7A3600]">
            {muted ? <VolumeX size={18} strokeWidth={2.8} /> : <Volume2 size={18} strokeWidth={2.8} />}
          </button>
          <button onClick={() => open('info')} className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#FFF7DC]/80 text-[#FFF7DC] transition hover:scale-110 hover:bg-[#FFF7DC] hover:text-[#7A3600]">
            <Info size={18} strokeWidth={2.8} />
          </button>
        </motion.div>
      </header>

      {/* ===== MAIN GRID ===== */}
      <main className="relative z-10 mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-6 px-5 sm:px-8 lg:grid-cols-[360px_1fr_230px] lg:gap-2">
        {/* ---- LEFT MENU (mirip referensi 100%) ---- */}
        <nav className="relative order-2 flex flex-col items-center lg:order-1 lg:items-start">
          <div className="flex flex-col items-center gap-1 sm:gap-1.5 lg:items-start">
            {MENU.map((m, i) => {
              const isActive = active === m.id;
              const isQuick = m.id === 'quick';
              const isBig = m.big || isQuick;
              return (
                <motion.button
                  key={m.id}
                  initial={{ x: -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 1.65 + i * 0.08, type: 'spring', stiffness: 260, damping: 22 }}
                  onMouseEnter={() => { if (active !== m.id) sound.hover(); setActive(m.id); }}
                  onFocus={() => setActive(m.id)}
                  onClick={() => open(m.id)}
                  className="group relative outline-none"
                >
                  {isActive ? (
                    <motion.span layoutId="active-pill" className="shine flex items-center gap-2 rounded-[18px] bg-[#FFF7DC] py-2.5 pl-4 pr-7 pill-shadow" style={{ rotate: '-1.5deg' }}>
                      <ChevronRight size={isQuick ? 34 : 28} strokeWidth={5} className="text-[#FF9E0B]" fill="currentColor" />
                      <span className={`font-display text-[#3A2317] ${isQuick ? 'text-[30px] sm:text-[34px]' : 'text-[24px]'}`}>{m.label}</span>
                      {m.badge && <span className="ml-1 grid h-6 w-6 place-items-center rounded-lg bg-[#E23A1E] text-[13px] font-black text-white">{m.badge}</span>}
                    </motion.span>
                  ) : (
                    <span className={`flex items-center gap-2 py-1 pl-5 pr-4 transition-all duration-150 group-hover:translate-x-2 ${isBig ? 'pl-12' : 'pl-10'}`}>
                      <span className={`font-display text-[#FFF7DC] menu-shadow transition group-hover:text-white ${isBig ? 'text-[26px] sm:text-[29px]' : 'text-[21px] sm:text-[23px]'}`} style={{ letterSpacing: '0.03em' }}>
                        {m.label}
                      </span>
                      {m.badge && <span className="grid h-5 w-5 place-items-center rounded-md bg-[#E23A1E] text-[11px] font-black text-white shadow">N</span>}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* hint + friends */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.2 }} className="mt-6 hidden pl-5 lg:block">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/15 px-3.5 py-1.5 text-[11px] font-black tracking-widest text-[#FFF7DC]/90 backdrop-blur">
              <span className="rounded bg-[#FFF7DC] px-1.5 py-0.5 text-[#7A3600]">↑↓</span> NAVIGASI
              <span className="rounded bg-[#FFF7DC] px-1.5 py-0.5 text-[#7A3600]">ENTER</span> PILIH
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex -space-x-2">
                {['#E23A1E', '#1E9E6A', '#6C3BFF', '#2EA8FF'].map((c, i) => (
                  <div key={i} className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#FF9E0B] text-[10px] font-black text-white" style={{ background: c }}>{['RZ', 'MO', 'KA', '+9'][i]}</div>
                ))}
              </div>
              <div className="text-[12px] font-black text-[#FFF7DC] drop-shadow">12 teman online</div>
            </div>
          </motion.div>
        </nav>

        {/* ---- CENTER 3D BALLS ---- */}
        <div className="relative order-1 h-[380px] sm:h-[440px] lg:order-2 lg:h-[580px]">
          {/* floating badges */}
          <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2 }} className="absolute left-[8%] top-[10%] z-20 animate-float-y">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-2 font-display text-lg text-[#3A2317] shadow-xl" style={{ rotate: '-6deg' }}>BOUN! <span className="text-[#FF9E0B]">●</span></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.15 }} className="absolute right-[6%] top-[22%] z-20 animate-float-y2">
            <div className="rounded-2xl rounded-br-sm bg-[#3A2317] px-4 py-2 font-display text-lg text-[#FFF7DC] shadow-xl" style={{ rotate: '5deg' }}>POW! <span className="text-[#FFC53D]">★</span></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.1 }} className="absolute left-1/2 top-[2%] z-20 -translate-x-1/2">
            <button onClick={() => open('dracula')} className="flex items-center gap-2 rounded-full bg-[#3A2317]/85 py-1.5 pl-2 pr-4 text-[#FFF7DC] backdrop-blur transition hover:scale-105">
              <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#E23A1E] to-[#FF6A00] px-2.5 py-1 text-[10px] font-black tracking-widest"><Zap size={11} strokeWidth={3} /> SEASON 6</span>
              <span className="text-xs font-black tracking-wider">Spooky Party is LIVE!</span>
            </button>
          </motion.div>

          {/* 3D canvas */}
          <motion.div initial={{ opacity: 0, y: 60, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 1.7, type: 'spring', stiffness: 120, damping: 18 }} className="absolute inset-0">
            <BallScene left={{ color: leftBall }} right={{ color: rightBall }} />
          </motion.div>

          {/* floor + nameplates */}
          <div className="floor-glow absolute bottom-[34px] left-1/2 h-[70px] w-[78%] -translate-x-1/2 sm:bottom-[44px]" />
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.05 }} className="absolute bottom-[6px] left-1/2 flex -translate-x-1/2 items-center gap-3 sm:bottom-[12px]">
            <div className="flex items-center gap-2 rounded-full bg-[#FFF7DC] py-1.5 pl-1.5 pr-4 shadow-lg">
              <span className="h-7 w-7 rounded-full shadow-[inset_-3px_-4px_0_rgba(0,0,0,0.2)]" style={{ background: leftBall }} />
              <span className="text-xs font-black tracking-wide">TOMO <span className="text-[#FF9E0B]">● LV 12</span></span>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#3A2317] font-display text-sm text-[#FFF7DC]">VS</div>
            <div className="flex items-center gap-2 rounded-full bg-[#FFF7DC] py-1.5 pl-1.5 pr-4 shadow-lg">
              <span className="h-7 w-7 rounded-full shadow-[inset_-3px_-4px_0_rgba(0,0,0,0.2)]" style={{ background: rightBall }} />
              <span className="text-xs font-black tracking-wide">MILO <span className="text-[#1E9E6A]">● LV 9</span></span>
            </div>
          </motion.div>
        </div>

        {/* ---- RIGHT PROMO (mirip referensi) ---- */}
        <aside className="relative order-3 grid grid-cols-2 justify-items-center gap-3 lg:flex lg:flex-col lg:items-end">
          {/* 3D ASSETS — kartu besar biar gampang ketemu */}
          <motion.button
            initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.8, type: 'spring', stiffness: 240, damping: 20 }}
            onClick={enterAssets} whileHover={{ scale: 1.05, rotate: -1 }} whileTap={{ scale: 0.96 }}
            className="shine relative flex h-[110px] w-full max-w-[210px] items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#3A2317] via-[#5A3A12] to-[#8A5A00] text-left card-shadow ring-2 ring-[#FFC53D]"
          >
            <div className="absolute -left-6 -top-6 h-20 w-20 rounded-full bg-[#FFC53D]/25 blur-xl" />
            <div className="relative z-10 p-4">
              <div className="w-fit animate-pulse rounded-full bg-[#FFC53D] px-2 py-0.5 text-[9px] font-black tracking-[0.2em] text-[#3A2317]">NEW • 3D</div>
              <div className="mt-1 font-display text-[22px] leading-[0.95] text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">ASSET<br />STUDIO</div>
              <div className="mt-1 text-[10px] font-black tracking-widest text-[#FFC53D]">15 ASET 3D →</div>
            </div>
            <div className="absolute right-3 flex flex-col gap-1.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#FFC53D] to-[#E8A800] text-[#3A2317] shadow-lg"><Crown size={22} strokeWidth={2.5} /></span>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#E23A1E] to-[#FF6A00] text-white shadow-lg"><Hand size={22} strokeWidth={2.5} /></span>
            </div>
          </motion.button>

          {/* VOTE NOW */}
          <motion.button
            initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.9, type: 'spring', stiffness: 240, damping: 20 }}
            onClick={() => open('vote')} whileHover={{ scale: 1.04, rotate: -1 }} whileTap={{ scale: 0.96 }}
            className="relative flex h-[110px] w-full max-w-[210px] items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#E23A1E] to-[#C22A12] text-left card-shadow"
          >
            <div className="relative z-10 p-4">
              <div className="font-display text-[26px] leading-[0.95] text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.3)]">VOTE<br />NOW</div>
              <div className="mt-2 flex gap-1">
                <span className="h-1.5 w-5 rounded-full bg-white" /><span className="h-1.5 w-1.5 rounded-full bg-white/50" /><span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              </div>
            </div>
            <img src="/images/duck.png" alt="Duck" className="absolute -right-3 top-0 h-full w-[118px] object-cover [mask-image:linear-gradient(to_right,transparent,black_28%)]" />
            <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/25 text-[10px] font-black text-white">2</div>
          </motion.button>

          {/* DRACULA LEVI */}
          <motion.button
            initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 2.0, type: 'spring', stiffness: 240, damping: 20 }}
            onClick={() => open('dracula')} whileHover={{ scale: 1.04, rotate: 1 }} whileTap={{ scale: 0.96 }}
            className="relative h-[190px] w-full max-w-[210px] overflow-hidden rounded-[20px] bg-[#23232E] text-left card-shadow sm:h-[248px] lg:h-[248px]"
          >
            <img src="/images/dracula-cat.png" alt="Dracula Levi" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/20" />
            <div className="absolute inset-0 rounded-[20px] ring-2 ring-inset ring-white/20" />
            <div className="absolute right-2.5 top-2.5 rounded-full bg-[#E23A1E] px-2.5 py-1 text-[10px] font-black tracking-widest text-white shadow">NEW</div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="font-display text-[26px] leading-[0.95] text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.6)]">DRACULA<br />LEVI</div>
              <div className="mt-2 flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full ${i < 3 ? 'w-5 bg-white' : 'w-3 bg-white/40'}`} />
                ))}
              </div>
            </div>
          </motion.button>

          {/* daily */}
          <motion.button
            initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 2.1 }}
            onClick={() => showToast('Daily reward diklaim: +500 koin!')} whileHover={{ scale: 1.03 }}
            className="hidden w-[210px] items-center gap-3 rounded-[20px] bg-[#FFF7DC] p-3 text-left pill-shadow lg:flex"
          >
            <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#FF9E0B] to-[#E23A1E] text-white">
              <Gift size={22} /><span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#FFF7DC] bg-[#E23A1E]" />
            </span>
            <span><span className="block text-[13px] font-black leading-none">DAILY REWARD</span><span className="text-[11px] font-bold text-[#E23A1E]">Siap diklaim • 04:12:33</span></span>
          </motion.button>
        </aside>
      </main>

      {/* ===== TICKER ===== */}
      <div className="relative z-10 mx-5 mb-2 hidden overflow-hidden rounded-full bg-[#7A3600]/25 py-1.5 backdrop-blur-sm sm:mx-8 lg:block">
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap px-4 text-[11px] font-black tracking-[0.18em] text-[#FFF7DC]/90">
          {[0, 1].map((k) => (
            <span key={k} className="flex gap-10">
              <span>★ NEW MAP: CANDY FALL SUDAH RILIS</span><span>★ DOUBLE XP WEEKEND</span><span>★ SKIN DRACULA LEVI TERBATAS</span><span>★ TURNAMEN 1 JUTA RUPIAH SABTU INI</span><span>★ FIX LAG & OPTIMASI ANDROID</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== BOTTOM DOCK ===== */}
      <footer className="relative z-20 px-3 pb-3 sm:px-6 sm:pb-4">
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 2.15, type: 'spring', stiffness: 200, damping: 22 }} className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 rounded-[22px] border border-white/15 bg-[#2B1A0E]/90 px-3 py-2.5 text-[#FFF7DC] shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-4">
          {/* profile */}
          <button onClick={() => showToast('Membuka profil pemain...')} className="flex items-center gap-3 rounded-2xl p-1 pr-3 transition hover:bg-white/10">
            <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#FF9E0B] to-[#E23A1E] font-display text-xl">G<span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[#2B1A0E] bg-[#1E9E6A] text-[9px]">12</span></span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-black">Guest_042</span>
              <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-white/15"><span className="block h-full w-[68%] rounded-full bg-gradient-to-r from-[#FF9E0B] to-[#FFC53D]" /></span>
            </span>
          </button>
          <span className="hidden h-9 w-px bg-white/10 sm:block" />
          {/* currency */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black"><Coins size={15} className="text-[#FFC53D]" /> 2.450</span>
            <button onClick={() => showToast('Membuka shop gems...')} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black transition hover:bg-white/20"><Gem size={15} className="text-[#7ED6FF]" /> 120 +</button>
          </div>
          <span className="hidden h-9 w-px bg-white/10 md:block" />
          {/* icons */}
          <div className="flex items-center gap-1.5">
            {[
              { icon: Gift, dot: true, label: 'Hadiah' },
              { icon: ShoppingBag, label: 'Shop' },
              { icon: Users, label: 'Teman' },
              { icon: Trophy, label: 'Rank' },
              { icon: Mail, dot: true, label: 'Mail' },
              { icon: Boxes, label: '3D Assets', action: true },
            ].map((b, i) => (
              <button
                key={i} title={b.label}
                onClick={() => ((b as { action?: boolean }).action ? enterAssets() : showToast(`Membuka ${b.label}...`))}
                className={`relative grid h-10 w-10 place-items-center rounded-xl transition hover:bg-white/10 hover:text-white ${((b as { action?: boolean }).action) ? 'bg-[#FFC53D]/20 text-[#FFC53D]' : 'text-white/80'}`}
              >
                <b.icon size={19} />{b.dot && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#E23A1E]" />}
              </button>
            ))}
            <button onClick={() => showToast('Membuka chat...')} className="hidden h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-black sm:flex"><MessageCircle size={17} /> <span className="max-w-[110px] truncate text-white/70">GG tadi! rematch?</span></button>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full bg-[#1E9E6A]/20 px-3 py-1.5 text-[11px] font-black text-[#7ED6A8] lg:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2BD97B]" /> ASIA • 24MS</span>
            <button onClick={() => open('settings')} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 transition hover:rotate-45 hover:bg-white/20"><SettingsIcon size={20} /></button>
            <button onClick={() => open('quick')} className="shine flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFC53D] to-[#FF8A00] px-6 py-3 font-display text-xl text-[#3A2317] shadow-[0_5px_0_#7A3600] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:px-8">
              <Play size={20} fill="currentColor" /> PLAY
            </button>
          </div>
        </motion.div>
        <div className="mx-auto mt-2 flex max-w-6xl items-center justify-between px-2 text-[10px] font-black tracking-[0.2em] text-[#7A3600]/80">
          <span>v1.4.2 • © 2026 BOUNCE PAWS STUDIO</span>
          <span className="hidden items-center gap-1.5 sm:flex"><Smile size={12} /> MADE FOR PARTY LOVERS</span>
        </div>
      </footer>

      {/* corner paw logo ala referensi */}
      <div className="absolute bottom-20 right-4 z-10 hidden opacity-60 lg:block">
        <svg width="34" height="34" viewBox="0 0 32 32" fill="#FFF7DC"><circle cx="9" cy="11" r="3.2" /><circle cx="16" cy="8" r="3.2" /><circle cx="23" cy="11" r="3.2" /><path d="M16 14c-5 0-9 3.6-9 7.4 0 2.4 1.9 3.6 3.7 3.6 1.4 0 2.3-.7 3.2-.7h4.2c.9 0 1.8.7 3.2.7 1.8 0 3.7-1.2 3.7-3.6C25 17.6 21 14 16 14z" /><circle cx="13.5" cy="19" r="1" fill="#FF9E0B" /><circle cx="18.5" cy="19" r="1" fill="#FF9E0B" /></svg>
      </div>

      {/* ===== TOAST ===== */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 30, opacity: 0, scale: 0.85 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }} className="fixed bottom-28 left-1/2 z-[90] -translate-x-1/2">
            <div className="flex items-center gap-2.5 whitespace-nowrap rounded-full border-2 border-[#FFF7DC]/20 bg-[#3A2317] px-5 py-3 text-sm font-black text-[#FFF7DC] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 15 }} className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#2BD97B] to-[#12914B] text-[13px] text-white">✓</motion.span> {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MODALS ===== */}
      <AnimatePresence>
        {modal === 'quick' && <QuickMatchModal onClose={() => setModal(null)} onToast={showToast} onEnterLobby={enterLobby} />}
        {modal === 'custom' && <CustomModal onClose={() => setModal(null)} onToast={showToast} />}
        {modal === 'tutorial' && <TutorialModal onClose={() => setModal(null)} />}
        {modal === 'locker' && <LockerModal onClose={() => setModal(null)} left={leftBall} right={rightBall} setLeft={setLeftBall} setRight={setRightBall} onToast={showToast} onOpenStudio={enterAssets} />}
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} onToast={showToast} />}
        {modal === 'exit' && <ExitModal onClose={() => setModal(null)} />}
        {modal === 'vote' && <VoteModal onClose={() => setModal(null)} onToast={showToast} />}
        {modal === 'dracula' && <DraculaModal onClose={() => setModal(null)} onToast={showToast} />}
        {modal === 'info' && <InfoModal onClose={() => setModal(null)} />}
      </AnimatePresence>

      {/* ===== LOBBY PAGE (quick match) ===== */}
      <AnimatePresence>
        {screen === 'lobby' && (
          <LobbyScreen
            playerSkin={leftBall}
            setPlayerSkin={setLeftBall}
            playerName="YOU"
            onLeave={leaveLobby}
          />
        )}
      </AnimatePresence>

      {/* ===== ASSET STUDIO PAGE ===== */}
      <AnimatePresence>
        {screen === 'assets' && (
          <AssetStudio onLeave={leaveAssets} onToast={showToast} />
        )}
      </AnimatePresence>

      {/* ===== TRANSITION WIPE ===== */}
      <AnimatePresence>
        {wipe && <LobbyWipe mode={wipe.mode} title={wipe.title} />}
      </AnimatePresence>
    </div>
  );
}

function FloatingPaw({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 + delay }} className={`absolute ${className}`}>
      <motion.svg animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }} transition={{ duration: 5, repeat: Infinity, delay, ease: 'easeInOut' }} width="54" height="54" viewBox="0 0 32 32" fill="#FFF7DC" opacity={0.35}>
        <circle cx="9" cy="11" r="3.2" /><circle cx="16" cy="8" r="3.2" /><circle cx="23" cy="11" r="3.2" /><path d="M16 14c-5 0-9 3.6-9 7.4 0 2.4 1.9 3.6 3.7 3.6 1.4 0 2.3-.7 3.2-.7h4.2c.9 0 1.8.7 3.2.7 1.8 0 3.7-1.2 3.7-3.6C25 17.6 21 14 16 14z" />
      </motion.svg>
    </motion.div>
  );
}
