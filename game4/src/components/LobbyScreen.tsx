import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Check, Timer, Users, Map as MapIcon, Crown,
  Trophy, RotateCcw, Home, Gamepad2, Minus, Plus
} from 'lucide-react';
import { sound } from '../utils/sound';

/* ================= SKIN DATA ================= */
export const LOBBY_SKINS = [
  { name: 'Tangerine', color: '#FF7A00', acc: 'collar' as Acc },
  { name: 'Creamy', color: '#FFF1C8', acc: 'none' as Acc },
  { name: 'Ember', color: '#E23A1E', acc: 'shades' as Acc },
  { name: 'Matcha', color: '#4CC38A', acc: 'bandana' as Acc },
  { name: 'Berry', color: '#B16CFF', acc: 'mohawk' as Acc },
  { name: 'Ocean', color: '#2EA8FF', acc: 'shades' as Acc },
  { name: 'Midnight', color: '#3A4A63', acc: 'shadesBlue' as Acc },
  { name: 'Bubblegum', color: '#FF7AB8', acc: 'glasses' as Acc },
  { name: 'Storm', color: '#8A94A3', acc: 'bandana' as Acc },
  { name: 'Choco', color: '#9A6A3B', acc: 'vest' as Acc },
  { name: 'Royal', color: '#6C3BFF', acc: 'crown' as Acc },
  { name: 'Lime', color: '#B8E62E', acc: 'none' as Acc },
];

type Acc = 'none' | 'bandana' | 'shades' | 'shadesBlue' | 'glasses' | 'mohawk' | 'collar' | 'jersey' | 'vest' | 'crown';

type Player = {
  name: string;
  color: string;
  acc: Acc;
  jerseyNo?: string;
  sleepy?: boolean;
};

/* ================= BALL FIGURE (CSS 3D look) ================= */
function BallFigure({
  color, acc = 'none', size = 'md', isYou = false, sleepy = false,
  jerseyNo, blinkDelay = 0, bounceDelay = 0, glow = false,
}: {
  color: string; acc?: Acc; size?: 'md' | 'lg'; isYou?: boolean;
  sleepy?: boolean; jerseyNo?: string; blinkDelay?: number; bounceDelay?: number; glow?: boolean;
}) {
  const eye = sleepy
    ? 'h-[7%] rounded-full bg-[#23130B]/85'
    : 'h-[19%] rounded-[50%] bg-[#23130B]';

  return (
    <div className="relative flex flex-col items-center">
      {glow && <div className="absolute -inset-5 rounded-full bg-[#FFC53D]/25 blur-xl" />}
      <div className="lobby-bounce relative" style={{ animationDelay: `${bounceDelay}s` }}>
        <div className={`relative ${size === 'lg' ? 'h-32 w-32 sm:h-40 sm:w-40' : 'h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28'}`}>
          {/* body */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 55%, ${color} 55%, rgba(0,0,0,0.22) 100%), ${color}`,
              boxShadow: 'inset -10px -14px 0 rgba(0,0,0,0.18), inset 9px 12px 0 rgba(255,255,255,0.32), 0 14px 24px rgba(0,0,0,0.35)',
            }}
          />
          {/* glossy highlight */}
          <div className="absolute left-[16%] top-[10%] h-[22%] w-[16%] rotate-[-18deg] rounded-full bg-white/90 blur-[1px]" />
          <div className="absolute left-[30%] top-[7%] h-[8%] w-[8%] rounded-full bg-white/80" />

          {/* accessories behind face */}
          {acc === 'mohawk' && (
            <div className="absolute -top-[14%] left-1/2 flex -translate-x-1/2 items-end gap-[3px]">
              {['#FF2E88', '#B16CFF', '#FF2E88', '#B16CFF'].map((c, i) => (
                <div key={i} className="h-7 w-4 sm:h-9 sm:w-5" style={{ background: c, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)', transform: `rotate(${(i - 1.5) * 12}deg)` }} />
              ))}
            </div>
          )}
          {acc === 'crown' && (
            <div className="absolute -top-[12%] left-1/2 -translate-x-1/2">
              <Crown size={30} className="text-[#FFC53D] drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]" fill="currentColor" />
            </div>
          )}
          {acc === 'bandana' && (
            <div className="absolute left-[2%] right-[2%] top-[16%] flex h-[22%] items-center justify-center overflow-hidden rounded-[10px] bg-[#2E6BF0] shadow-[0_3px_0_rgba(0,0,0,0.3)]">
              <span className="text-[9px] font-black tracking-[0.2em] text-white/90 sm:text-[11px]">PAW</span>
              <div className="absolute -right-2 top-1/2 h-5 w-5 -translate-y-1/2 rotate-45 bg-[#1E4FBE]" />
            </div>
          )}

          {/* face */}
          <div className={`absolute left-[27%] top-[40%] w-[15%] ${eye} animate-blink`} style={{ animationDelay: `${blinkDelay}s` }}>
            {!sleepy && <div className="absolute right-[18%] top-[14%] h-[32%] w-[32%] rounded-full bg-white" />}
          </div>
          <div className={`absolute right-[27%] top-[40%] w-[15%] ${eye} animate-blink`} style={{ animationDelay: `${blinkDelay}s` }}>
            {!sleepy && <div className="absolute right-[18%] top-[14%] h-[32%] w-[32%] rounded-full bg-white" />}
          </div>

          {/* shades / glasses over eyes */}
          {(acc === 'shades' || acc === 'shadesBlue') && (
            <div className={`absolute left-[14%] right-[14%] top-[36%] h-[22%] rounded-full ${acc === 'shades' ? 'bg-[#14141C]' : 'bg-[#1E5AA8]'} shadow-[0_3px_0_rgba(0,0,0,0.35)]`}>
              <div className="absolute left-[8%] top-[18%] h-[26%] w-[30%] rounded-full bg-white/35" />
              <div className="absolute right-[8%] top-[18%] h-[26%] w-[30%] rounded-full bg-white/35" />
            </div>
          )}
          {acc === 'glasses' && (
            <div className="absolute left-[13%] right-[13%] top-[37%] flex items-center justify-between">
              <div className="aspect-square w-[38%] rounded-full border-[3px] border-[#E8A800] bg-white/15" />
              <div className="h-[3px] w-[12%] bg-[#E8A800]" />
              <div className="aspect-square w-[38%] rounded-full border-[3px] border-[#E8A800] bg-white/15" />
            </div>
          )}

          {/* blush */}
          <div className="absolute bottom-[30%] left-[12%] h-[9%] w-[17%] rounded-full bg-[#FF8FA0]/80 blur-[1px]" />
          <div className="absolute bottom-[30%] right-[12%] h-[9%] w-[17%] rounded-full bg-[#FF8FA0]/80 blur-[1px]" />

          {/* jersey number */}
          {acc === 'jersey' && (
            <div className="absolute bottom-[6%] left-1/2 flex h-[38%] w-[52%] -translate-x-1/2 items-center justify-center rounded-t-2xl rounded-b-[22px] bg-[#23232E] shadow-[0_3px_0_rgba(0,0,0,0.4)]">
              <span className="font-display text-lg text-[#FF5A3C] sm:text-2xl" style={{ WebkitTextStroke: '1px #FFF7DC' }}>{jerseyNo ?? '32'}</span>
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#FFC53D]" />
            </div>
          )}
          {/* collar + bell */}
          {acc === 'collar' && (
            <>
              <div className="absolute bottom-[16%] left-[8%] right-[8%] h-[9%] rounded-full bg-[#D92B1F] shadow-[0_2px_0_rgba(0,0,0,0.3)]" />
              <div className="absolute -bottom-[2%] left-1/2 h-[16%] w-[16%] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#FFE27A] to-[#C88A00] shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                <div className="absolute left-[20%] top-[16%] h-[30%] w-[30%] rounded-full bg-white/80" />
              </div>
            </>
          )}
          {/* vest (open jacket) */}
          {acc === 'vest' && (
            <>
              <div className="absolute bottom-0 left-[2%] h-[46%] w-[26%] rounded-t-full rounded-b-[18px] bg-[#2E6BF0] shadow-[inset_-3px_0_0_rgba(0,0,0,0.25)]" />
              <div className="absolute bottom-0 right-[2%] h-[46%] w-[26%] rounded-t-full rounded-b-[18px] bg-[#2E6BF0] shadow-[inset_3px_0_0_rgba(0,0,0,0.25)]" />
            </>
          )}
        </div>
      </div>
      {/* floor shadow */}
      <div className={`mt-1 h-3 rounded-[50%] bg-black/35 blur-[3px] ${size === 'lg' ? 'w-28 sm:w-36' : 'w-16 sm:w-20'} ${isYou ? '!bg-black/45' : ''}`} />
    </div>
  );
}

/* ================= LOCKER ROOM BG ================= */
function LockerRoomBG() {
  const lockers = ['#9AA3B2', '#8A94A6', '#9AA3B2', '#7E8899', '#9AA3B2', '#8A94A6'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* wall + floor */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#101018_0%,#1A1A24_26%,#262633_46%,#3B3547_52%,#5A4F42_55%,#A08E72_72%,#7C6C58_100%)]" />
      {/* top glow */}
      <div className="absolute left-1/2 top-[-140px] h-[380px] w-[720px] -translate-x-1/2 rounded-full bg-[#FFE9B8]/25 blur-[70px]" />
      {/* spotlight cone on YOU */}
      <div className="absolute left-1/2 top-0 h-[62%] w-[340px] -translate-x-1/2 sm:w-[440px]" style={{ background: 'linear-gradient(180deg, rgba(255,240,200,0.28) 0%, rgba(255,240,200,0.07) 70%, transparent 100%)', clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)', filter: 'blur(6px)' }} />

      {/* lockers */}
      <div className="absolute left-1/2 top-[13%] flex -translate-x-1/2 items-end gap-1.5 sm:gap-2.5">
        {lockers.map((c, i) => (
          <div key={i} className={`relative hidden h-44 w-20 overflow-hidden rounded-lg border-b-4 border-black/30 sm:block md:h-60 md:w-28 ${i === 2 ? '!border-black/60' : ''}`}
            style={{ background: i === 2 ? 'linear-gradient(180deg,#0E0E14,#23232e)' : `linear-gradient(180deg, ${c}, #6d7688)` }}>
            {i !== 2 ? (
              <>
                <div className="mx-auto mt-3 w-3/5 space-y-1.5 opacity-60">
                  <div className="h-1 rounded bg-black/50" /><div className="h-1 rounded bg-black/50" /><div className="h-1 rounded bg-black/50" />
                </div>
                <div className="absolute bottom-8 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-black/40 bg-white/25" />
                <div className="absolute inset-y-0 left-1 w-[3px] bg-white/25" />
              </>
            ) : (
              <>
                <div className="absolute inset-x-2 top-2 bottom-2 rounded bg-black/60" />
                <div className="absolute inset-x-4 top-1/2 h-1 rounded bg-white/20" />
                <div className="absolute right-0 top-0 h-full w-3 rounded-l bg-[#6d7688]" />
              </>
            )}
          </div>
        ))}
        {/* mobile: fewer lockers */}
        {lockers.slice(0, 4).map((c, i) => (
          <div key={'m' + i} className="relative h-36 w-16 overflow-hidden rounded-lg border-b-4 border-black/30 sm:hidden" style={{ background: `linear-gradient(180deg, ${c}, #6d7688)` }}>
            <div className="mx-auto mt-2 w-3/5 space-y-1 opacity-60"><div className="h-1 rounded bg-black/50" /><div className="h-1 rounded bg-black/50" /></div>
          </div>
        ))}
      </div>

      {/* bench */}
      <div className="absolute bottom-[30%] left-[6%] right-[6%] h-4 rounded-full bg-gradient-to-b from-[#B07A3F] to-[#7A4E22] shadow-[0_8px_16px_rgba(0,0,0,0.4)] sm:bottom-[31%]" />

      {/* punching bag */}
      <div className="absolute left-[3%] top-0 hidden flex-col items-center sm:flex">
        <div className="h-16 w-1.5 bg-gradient-to-b from-gray-500 to-gray-700" />
        <div className="relative h-44 w-16 overflow-hidden rounded-full rounded-t-[26px] bg-gradient-to-br from-[#E04A30] via-[#B02516] to-[#7A150C] shadow-[0_16px_30px_rgba(0,0,0,0.5)]">
          <div className="absolute left-2 top-4 h-24 w-3 rounded-full bg-white/25 blur-[2px]" />
          <div className="absolute inset-x-0 top-6 h-2 bg-black/30" /><div className="absolute inset-x-0 top-10 h-2 bg-black/30" />
        </div>
      </div>
      {/* extinguisher */}
      <div className="absolute right-[4%] top-[26%] hidden sm:block">
        <div className="h-20 w-9 rounded-lg rounded-t-2xl bg-gradient-to-br from-[#D93A26] to-[#8E1A0E] shadow-lg">
          <div className="mx-auto mt-2 h-6 w-5 rounded bg-white/85 text-center text-[7px] font-black leading-[24px] text-red-700">FIRE</div>
        </div>
        <div className="mx-auto h-3 w-4 bg-gray-700" />
      </div>

      {/* floor sheen */}
      <div className="absolute bottom-[8%] left-1/2 h-24 w-[80%] -translate-x-1/2 rounded-[50%] bg-[#FFE9B8]/20 blur-[30px]" />
      {/* bottom dark fade for dock */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
    </div>
  );
}

/* ================= MAIN LOBBY ================= */
export default function LobbyScreen({
  playerSkin, setPlayerSkin, playerName = 'YOU', onLeave,
}: {
  playerSkin: string; setPlayerSkin: (c: string) => void; playerName?: string; onLeave: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(20);
  const [youReady, setYouReady] = useState(false);
  const [bots, setBots] = useState<boolean[]>([true, true, false, true, true, false, true]);
  const [phase, setPhase] = useState<'lobby' | 'starting' | 'result'>('lobby');
  const [count, setCount] = useState(3);
  const [winner, setWinner] = useState<string | null>(null);
  const [emote, setEmote] = useState<{ idx: number; text: string; key: number } | null>(null);
  const [pulseCloset, setPulseCloset] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const players: Player[] = useMemo(() => [
    { name: 'Mochi', color: '#3A4A63', acc: 'shadesBlue', sleepy: true },
    { name: 'luffy', color: '#8A8F9E', acc: 'bandana' },
    { name: 'Epun', color: '#A8ADBB', acc: 'bandana', sleepy: true },
    { name: playerName, color: playerSkin, acc: 'collar' },
    { name: 'Rattlexnake', color: '#E8E4DA', acc: 'jersey', jerseyNo: '32' },
    { name: 'Apiipp', color: '#FF8E7A', acc: 'mohawk' },
    { name: 'Kaito', color: '#C97E2E', acc: 'vest' },
    { name: 'Boba', color: '#FFF1C8', acc: 'none' },
  ], [playerSkin, playerName]);

  const readyArr = useMemo(() => {
    const r = [...bots];
    r.splice(3, 0, youReady);
    return r;
  }, [bots, youReady]);
  const readyCount = readyArr.filter(Boolean).length;
  const allReady = readyCount === players.length;

  /* countdown + detik akhir berdetak */
  useEffect(() => {
    if (phase !== 'lobby') return;
    if (timeLeft <= 0) { startMatch(); return; }
    if (timeLeft <= 3) sound.tick();
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase]);

  /* fanfare hasil */
  useEffect(() => {
    if (phase === 'result' && winner) sound.fanfare(winner === playerName);
  }, [phase, winner, playerName]);

  /* bots become ready over time */
  useEffect(() => {
    const timers = [2500, 6000, 11000].map((ms, k) => setTimeout(() => {
      setBots((b) => {
        const n = [...b];
        const idx = n.findIndex((v) => !v);
        if (idx >= 0) n[idx] = true;
        return n;
      });
      void k;
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  /* all ready -> quick start */
  useEffect(() => {
    if (phase === 'lobby' && allReady) {
      const t = setTimeout(startMatch, 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady, phase]);

  /* random emotes */
  useEffect(() => {
    if (phase !== 'lobby') return;
    const texts = ['GG!', 'Gas main!', 'Siap menang!', 'Jangan dorong!', 'Hoki nih~', 'Rematch ya!'];
    const iv = setInterval(() => {
      setEmote({ idx: Math.floor(Math.random() * players.length), text: texts[Math.floor(Math.random() * texts.length)], key: Date.now() });
      setTimeout(() => setEmote(null), 1900);
    }, 3400);
    return () => clearInterval(iv);
  }, [phase, players.length]);

  function startMatch() {
    if (phase !== 'lobby') return;
    setPhase('starting');
    setCount(3);
    sound.tick();
    let c = 3;
    const iv = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(iv);
        setCount(0);
        sound.go();
        setTimeout(() => {
          setWinner(Math.random() < 0.45 ? playerName : players[Math.floor(Math.random() * players.length)].name);
          setPhase('result');
        }, 900);
      } else {
        setCount(c);
        sound.tick();
      }
    }, 850);
  }

  function playAgain() {
    sound.open();
    setPhase('lobby');
    setTimeLeft(20);
    setYouReady(false);
    setWinner(null);
    setBots([true, false, false, true, false, true, true]);
    setTimeout(() => setBots((b) => { const n = [...b]; const i = n.findIndex((v) => !v); if (i >= 0) n[i] = true; return n; }), 3000);
  }

  const scrollBy = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.06, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#14141C] font-[Baloo_2] text-white selection:bg-[#FF9E0B]"
    >
      <LockerRoomBG />

      {/* ===== TOP BAR ===== */}
      <div className="relative z-20 flex items-start justify-between px-3 pt-3 sm:px-6">
        <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="flex items-center gap-2">
          <button onClick={onLeave} className="group flex items-center gap-1.5 rounded-full bg-black/45 py-2 pl-2.5 pr-4 text-xs font-black tracking-wider backdrop-blur transition hover:bg-[#E23A1E]">
            <ArrowLeft size={16} strokeWidth={3} className="transition group-hover:-translate-x-0.5" /> LOBBY
          </button>
          <div className="hidden rounded-full bg-black/45 px-3.5 py-2 text-[11px] font-black tracking-widest text-white/70 backdrop-blur sm:block">
            CANDY FALL • <span className="text-[#FFC53D]">ROOM PAWS-7X2K</span>
          </div>
        </motion.div>

        {/* timer pill */}
        <motion.div initial={{ y: -70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 20 }} className="absolute left-1/2 top-0 -translate-x-1/2">
          <div className={`flex items-center gap-2 rounded-b-[22px] px-6 pb-2.5 pt-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${timeLeft <= 5 && phase === 'lobby' ? 'animate-pulse bg-[#E23A1E]' : 'bg-[#FFF7DC]'}`}>
            <Timer size={22} strokeWidth={3} className={timeLeft <= 5 && phase === 'lobby' ? 'text-white' : 'text-[#3A2317]/60'} />
            <span className={`font-display text-3xl leading-none ${timeLeft <= 5 && phase === 'lobby' ? 'text-white' : 'text-[#FF9E0B]'}`}>
              {phase === 'lobby' ? timeLeft : 'GO'}
            </span>
          </div>
        </motion.div>

        <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 text-xs font-black backdrop-blur"><Users size={14} /> {readyCount}/{players.length}</span>
          <span className="hidden items-center gap-1.5 rounded-full bg-[#1E9E6A]/90 px-3.5 py-2 text-xs font-black sm:flex"><MapIcon size={14} /> KNOCKOUT</span>
        </motion.div>
      </div>

      {/* ready progress bar */}
      <div className="relative z-20 mx-auto mt-2 w-52 overflow-hidden rounded-full bg-black/40 sm:w-64">
        <motion.div className="h-1.5 rounded-full bg-gradient-to-r from-[#1E9E6A] to-[#7ED957]" animate={{ width: `${(readyCount / players.length) * 100}%` }} />
      </div>
      <div className="relative z-20 mt-1 text-center text-[10px] font-black tracking-[0.28em] text-white/60">
        {allReady ? 'SEMUA SIAP — BERSIAP!' : `${players.length - readyCount} PEMAIN BELUM SIAP`}
      </div>

      {/* ===== LINEUP ===== */}
      <div className="relative z-10 flex flex-1 items-end justify-center px-2 pb-2 pt-4">
        <div className="flex w-full max-w-6xl items-end justify-start gap-1 overflow-x-auto px-4 pb-1 nice-scroll sm:gap-3 sm:justify-center md:overflow-visible">
          {players.map((p, i) => {
            const isYou = p.name === playerName;
            const ready = readyArr[i];
            return (
              <motion.div
                key={p.name + i}
                initial={{ y: -220, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45 + i * 0.09, type: 'spring', stiffness: 210, damping: 17 }}
                className={`relative flex shrink-0 flex-col items-center ${isYou ? 'z-10 -translate-y-2' : ''}`}
              >
                {/* emote bubble */}
                <AnimatePresence>
                  {emote?.idx === i && (
                    <motion.div key={emote.key} initial={{ scale: 0, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, opacity: 0 }} className="absolute -top-12 z-30 whitespace-nowrap rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-xs font-black text-[#3A2317] shadow-xl">
                      {emote.text}
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* check + name */}
                <motion.div
                  animate={ready ? { scale: [1, 1.25, 1] } : {}}
                  className={`mb-1.5 grid h-6 w-6 place-items-center rounded-full shadow ${ready ? 'bg-[#FFC53D] text-[#3A2317]' : 'bg-white/20 text-white/50'}`}
                >
                  <Check size={15} strokeWidth={4} />
                </motion.div>
                <div className={`mb-2 rounded-full px-2.5 py-0.5 text-[11px] font-black tracking-wide sm:text-xs ${isYou ? 'bg-[#FFC53D] text-[#3A2317] shadow-[0_0_18px_rgba(255,197,61,0.7)]' : 'bg-black/45 text-white/90 backdrop-blur'}`}>
                  {isYou ? 'YOU' : p.name}
                </div>
                <BallFigure
                  color={p.color} acc={p.acc} size={isYou ? 'lg' : 'md'}
                  isYou={isYou} sleepy={p.sleepy} jerseyNo={p.jerseyNo}
                  blinkDelay={i * 0.55} bounceDelay={i * 0.33} glow={isYou}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ===== BOTTOM: SKIN CAROUSEL ===== */}
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 200, damping: 22 }} className="relative z-20 px-3 pb-1 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button onClick={() => { scrollBy(-1); sound.click(); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25"><Minus size={16} strokeWidth={3} /></button>
          <div ref={scrollRef} className={`nice-scroll flex flex-1 gap-2.5 overflow-x-auto scroll-smooth rounded-3xl bg-black/35 p-2.5 backdrop-blur-md transition ${pulseCloset ? 'ring-4 ring-[#FFC53D]' : ''}`}>
            {LOBBY_SKINS.map((s) => {
              const sel = playerSkin === s.color;
              return (
                <button
                  key={s.color}
                  onClick={() => { setPlayerSkin(s.color); sound.select(LOBBY_SKINS.findIndex((k) => k.color === s.color)); }}
                  title={s.name}
                  className={`group relative shrink-0 snap-center rounded-full p-1 transition-all ${sel ? 'scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                >
                  <span className={`block rounded-full p-[3px] ${sel ? 'bg-[#FFC53D] shadow-[0_0_16px_rgba(255,197,61,0.8)]' : 'bg-white/25'}`}>
                    <span className="block h-11 w-11 overflow-hidden rounded-full sm:h-12 sm:w-12" style={{ background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.8) 0%, transparent 30%), ${s.color}` }}>
                      <span className="mx-auto mt-[26%] block h-[26%] w-[60%]">
                        <span className="flex justify-between"><span className="h-1.5 w-1.5 rounded-full bg-[#23130B]" /><span className="h-1.5 w-1.5 rounded-full bg-[#23130B]" /></span>
                      </span>
                    </span>
                  </span>
                  {sel && <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-[#FFC53D]" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => { scrollBy(1); sound.click(); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/25"><Plus size={16} strokeWidth={3} /></button>
        </div>
      </motion.div>

      {/* ===== BOTTOM BAR: READY ===== */}
      <div className="relative z-20 flex items-end justify-between px-4 pb-4 pt-1 sm:px-8">
        <div className="hidden w-48 text-[11px] font-bold leading-snug text-white/50 sm:block">
          Pilih lingkaran di atas untuk ganti warna bolamu. Semua pemain melihat pilihanmu live!
        </div>
        <motion.button
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.25 }}
          onClick={() => { const r = !youReady; setYouReady(r); if (r) sound.ready(); else sound.close(); }} whileTap={{ scale: 0.94 }}
          className={`mx-auto flex items-center gap-2.5 rounded-t-2xl rounded-b-[20px] px-10 py-3.5 font-display text-2xl tracking-wide transition-all sm:text-3xl ${youReady ? 'bg-gradient-to-b from-[#2BD97B] to-[#12914B] text-white shadow-[0_8px_0_#0A5A2E,0_16px_36px_rgba(43,217,123,0.4)]' : 'bg-[#FFF7DC] text-[#5A5A72] shadow-[0_8px_0_rgba(0,0,0,0.4)] hover:text-[#3A2317]'}`}
        >
          <span className={`grid h-8 w-8 place-items-center rounded-full text-lg ${youReady ? 'bg-white text-[#12914B]' : 'bg-[#5A5A72] text-white'}`}>A</span>
          {youReady ? 'READY!' : 'UNREADY'}
        </motion.button>
        <div className="hidden w-48 items-center justify-end gap-2 text-right sm:flex">
          <button
            onClick={() => { sound.click(); setPulseCloset(true); scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => setPulseCloset(false), 1600); }}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black tracking-widest text-white/80 backdrop-blur transition hover:bg-white/20 hover:text-white"
          >
            <Gamepad2 size={16} /> CHANGE OUTFIT
          </button>
        </div>
      </div>

      {/* mobile change outfit */}
      <button onClick={() => { sound.click(); setPulseCloset(true); setTimeout(() => setPulseCloset(false), 1600); }} className="absolute bottom-24 right-3 z-20 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-[10px] font-black tracking-widest backdrop-blur sm:hidden">
        <Gamepad2 size={14} /> OUTFIT
      </button>

      {/* ===== STARTING OVERLAY (3-2-1-GO) ===== */}
      <AnimatePresence>
        {phase === 'starting' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#101018]/85 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-[#FF9E0B] to-[#E23A1E] px-8 py-5 shadow-2xl">
              <MapIcon size={34} />
              <div><div className="text-[11px] font-black tracking-[0.3em] text-white/80">MAP BERIKUTNYA</div><div className="font-display text-4xl leading-none">CANDY FALL</div></div>
            </motion.div>
            <div className="mt-6 grid h-36 w-36 place-items-center">
              <AnimatePresence mode="popLayout">
                <motion.div key={count} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="font-display text-[110px] leading-none text-[#FFC53D] drop-shadow-[0_8px_0_rgba(0,0,0,0.5)]">
                  {count > 0 ? count : 'GO!'}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-2 text-xs font-black tracking-[0.3em] text-white/60">BERSIAP DI ARENA...</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== RESULT OVERLAY ===== */}
      <AnimatePresence>
        {phase === 'result' && winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[#101018]/90 p-4 backdrop-blur-md">
            {/* confetti */}
            {Array.from({ length: 26 }).map((_, i) => (
              <motion.span
                key={i}
                initial={{ y: '-10vh', x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800), rotate: 0, opacity: 1 }}
                animate={{ y: '110vh', rotate: 720, opacity: 0.9 }}
                transition={{ duration: 2.6 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2, ease: 'linear' }}
                className="absolute top-0 h-3 w-2 rounded-sm"
                style={{ background: ['#FFC53D', '#E23A1E', '#2BD97B', '#2EA8FF', '#B16CFF'][i % 5] }}
              />
            ))}
            <motion.div initial={{ scale: 0.7, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-[#FFF7DC] p-7 text-center text-[#3A2317]">
              <div className="absolute inset-x-0 top-0 h-2.5 bg-gradient-to-r from-[#FF9E0B] via-[#FFC53D] to-[#E23A1E]" />
              <div className="mx-auto -mt-14 mb-2 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#FFC53D] to-[#E23A1E] text-white shadow-xl ring-8 ring-[#FFF7DC]">
                <Trophy size={36} />
              </div>
              <div className="text-[11px] font-black tracking-[0.3em] text-[#3A2317]/50">HASIL PERTANDINGAN (DEMO)</div>
              <h2 className="mt-1 font-display text-4xl leading-none">{winner === playerName ? 'KAMU MENANG!' : `${winner.toUpperCase()} MENANG!`}</h2>
              <div className="mx-auto mt-4 flex w-fit items-center gap-3">
                <BallFigure color={players.find((p) => p.name === winner)?.color ?? playerSkin} acc={players.find((p) => p.name === winner)?.acc ?? 'collar'} size="md" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[['KNOCKOUT', '4'], ['SURVIVE', '1:32'], ['POIN', '+120']].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-[#3A2317]/[.06] p-3"><div className="text-[10px] font-black tracking-widest text-[#3A2317]/50">{k}</div><div className="font-display text-2xl">{v}</div></div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button onClick={playAgain} className="flex items-center justify-center gap-2 rounded-2xl bg-[#3A2317] py-3 font-display text-lg text-[#FFF7DC]"><RotateCcw size={18} strokeWidth={3} /> MAIN LAGI</button>
                <button onClick={onLeave} className="flex items-center justify-center gap-2 rounded-2xl bg-[#FF9E0B] py-3 font-display text-lg text-white shadow-[0_5px_0_#7A3600]"><Home size={18} strokeWidth={3} /> MENU</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ================= TRANSITION WIPE (dipakai di App) ================= */
const TIPS = [
  'Tahan SPASI untuk lompat lebih tinggi!',
  'Tackle dari belakang lebih kuat 2x lipat!',
  'Pegang tepi arena saat gempa dimulai!',
  'Emote tepat waktu bikin lawan panik!',
];

export function LobbyWipe({ mode, title }: { mode: 'join' | 'leave'; title?: string }) {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPct((p) => Math.min(96, p + Math.random() * 22 + 8)), 220);
    return () => clearInterval(iv);
  }, []);
  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }}
      transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-[#FF9E0B]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_42%,#FFC53D_0%,#FFA914_55%,#F58A00_100%)]" />
      {/* curved top edge */}
      <div className="absolute -top-10 left-0 right-0 h-16 rounded-b-[50%] bg-[#FFF7DC]/20" />
      <motion.div animate={{ y: [0, -18, 0] }} transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }} className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#E23A1E] shadow-[inset_-8px_-10px_0_rgba(0,0,0,0.2),inset_6px_8px_0_rgba(255,255,255,0.5),0_18px_30px_rgba(0,0,0,0.3)]" />
        <div className="absolute left-4 top-3 h-5 w-5 rounded-full bg-white/90" />
        <div className="absolute left-[30%] top-[46%] h-[16%] w-[13%] rounded-full bg-[#23130B]" />
        <div className="absolute right-[30%] top-[46%] h-[16%] w-[13%] rounded-full bg-[#23130B]" />
      </motion.div>
      <div className="mt-3 h-3 w-24 rounded-full bg-black/20 blur-[2px]" />
      <div className="relative mt-6 text-center font-display text-3xl text-[#FFF7DC] drop-shadow-[0_3px_0_rgba(122,54,0,0.5)]">
        {title ?? (mode === 'join' ? 'JOINING LOBBY...' : 'BACK TO MENU...')}
      </div>
      <div className="relative mt-4 h-3.5 w-64 overflow-hidden rounded-full bg-black/20">
        <motion.div className="h-full rounded-full bg-[#FFF7DC]" animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut' }} />
      </div>
      <div className="relative mt-3 rounded-full bg-black/15 px-4 py-1.5 text-xs font-black tracking-wider text-[#FFF7DC]">TIPS: {tip}</div>
    </motion.div>
  );
}
