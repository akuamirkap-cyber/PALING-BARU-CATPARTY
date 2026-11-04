import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Play, Users, Swords, Trophy, Map as MapIcon, Copy, Plus,
  GraduationCap, Gamepad2, Volume2, Monitor, Globe, Check, Gift, Sparkles, Crown, Zap, Heart, Hand, ArrowRight, Music
} from 'lucide-react';
import { sound } from '../utils/sound';

export function Shell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    sound.open();
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  const bye = () => {
    sound.close();
    onClose();
  };
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2B1200]/60 p-4 backdrop-blur-md"
      onClick={bye}
    >
      <motion.div
        initial={{ scale: 0.86, y: 30, rotate: -1 }} animate={{ scale: 1, y: 0, rotate: 0 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-hidden rounded-[28px] bg-[#FFF7DC] text-[#3A2317] shadow-[0_30px_80px_rgba(0,0,0,0.45)]`}
      >
        <div className="absolute inset-x-0 top-0 h-2.5 bg-gradient-to-r from-[#FF9E0B] via-[#FFC53D] to-[#E23A1E]" />
        <button onClick={bye} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#3A2317]/10 transition hover:rotate-90 hover:bg-[#3A2317] hover:text-[#FFF7DC]">
          <X size={18} strokeWidth={3} />
        </button>
        <div className="max-h-[86vh] overflow-y-auto nice-scroll p-6 sm:p-8">{children}</div>
      </motion.div>
    </motion.div>
  );
}

const Title = ({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) => (
  <div className="mb-5">
    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#FF9E0B] px-3 py-1 text-[11px] font-black tracking-[0.18em] text-white">
      <Sparkles size={12} strokeWidth={3} /> {kicker}
    </div>
    <h2 className="font-display text-3xl leading-none sm:text-4xl">{title}</h2>
    {desc && <p className="mt-2 text-sm font-bold text-[#3A2317]/60">{desc}</p>}
  </div>
);

/* ---------------- QUICK MATCH ---------------- */
export function QuickMatchModal({ onClose, onToast, onEnterLobby }: { onClose: () => void; onToast: (m: string) => void; onEnterLobby?: () => void }) {
  const [mode, setMode] = useState(0);
  const [searching, setSearching] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!searching) return;
    setPct(0);
    const iv = setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => {
            if (onEnterLobby) onEnterLobby();
            else { onToast('Match ditemukan! Menuju arena...'); onClose(); }
          }, 600);
          return 100;
        }
        return p + Math.random() * 14 + 4;
      });
    }, 380);
    return () => clearInterval(iv);
  }, [searching]);

  const modes = [
    { icon: Swords, name: 'KNOCKOUT', desc: '8 pemain • terakhir bertahan menang', players: '4.2K bermain', grad: 'from-[#E23A1E] to-[#FF7A00]', maps: 'Candy Fall • Spin Ring' },
    { icon: Users, name: 'TEAM 2v2', desc: 'Duo bola • kerja sama + dorong lawan', players: '8.7K bermain', grad: 'from-[#1E9E6A] to-[#7ED957]', maps: 'Bouncy Dome • Lava Pit' },
    { icon: Crown, name: 'CROWN RUSH', desc: 'Rebut mahkota • tahan 20 detik', players: '1.9K bermain', grad: 'from-[#6C3BFF] to-[#B16CFF]', maps: 'Sky Crown • Neon Roof' },
  ];

  return (
    <Shell onClose={onClose} wide>
      <Title kicker="MATCHMAKING" title="QUICK MATCH" desc="Pilih mode, kami carikan lawan selevel dalam hitungan detik." />
      <div className="grid gap-3 sm:grid-cols-3">
        {modes.map((m, i) => (
          <button
            key={m.name}
            onClick={() => { setMode(i); sound.select(i); }}
            className={`group relative overflow-hidden rounded-2xl border-[3px] p-4 text-left transition-all ${mode === i ? 'border-[#3A2317] bg-white shadow-[0_8px_0_#3A2317] -translate-y-1' : 'border-transparent bg-[#3A2317]/[.06] hover:bg-white'}`}
          >
            <div className={`mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${m.grad} text-white shadow-lg transition group-hover:rotate-6 group-hover:scale-110`}>
              <m.icon size={26} strokeWidth={2.5} />
            </div>
            <div className="font-display text-lg leading-none">{m.name}</div>
            <div className="mt-1.5 text-[12px] font-bold leading-snug text-[#3A2317]/60">{m.desc}</div>
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#1E9E6A]/15 px-2.5 py-1 text-[11px] font-black text-[#1E7A4A]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1E9E6A]" /> {m.players}
            </div>
            {mode === i && <div className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#3A2317] text-white"><Check size={14} strokeWidth={4} /></div>}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#3A2317] p-4 text-[#FFF7DC]">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10"><MapIcon size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black tracking-[0.2em] text-white/50">MAP AKTIF</div>
          <div className="truncate font-display text-base">{modes[mode].maps}</div>
        </div>
        <div className="hidden items-center -space-x-2 sm:flex">
          {['#FF7A00', '#E23A1E', '#1E9E6A', '#6C3BFF'].map((c, i) => (
            <div key={i} className="h-8 w-8 rounded-full border-[3px] border-[#3A2317]" style={{ background: c }} />
          ))}
          <div className="grid h-8 w-8 place-items-center rounded-full border-[3px] border-[#3A2317] bg-white text-[10px] font-black text-[#3A2317]">+5</div>
        </div>
      </div>

      {!searching ? (
        <button onClick={() => { setSearching(true); sound.ready(); }} className="shine mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF9E0B] to-[#FF6A00] py-4 font-display text-2xl text-white shadow-[0_8px_0_#7A3600] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-none">
          <Play size={24} fill="currentColor" /> FIND MATCH
        </button>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-5 text-center">
          <div className="font-display text-xl">MENCARI LAWAN... {Math.min(99, Math.floor(pct))}%</div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-[#3A2317]/10">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-[#FF9E0B] to-[#E23A1E]" animate={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-2 text-xs font-black tracking-widest text-[#3A2317]/50">ESTIMASI 0:0{Math.max(1, 6 - Math.floor(pct / 20))} • ASIA 24MS</div>
          <button onClick={() => { setSearching(false); sound.close(); }} className="mt-3 rounded-full bg-[#3A2317]/10 px-6 py-2 text-sm font-black hover:bg-[#E23A1E] hover:text-white">BATAL</button>
        </div>
      )}
    </Shell>
  );
}

/* ---------------- CUSTOM ---------------- */
export function CustomModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [tab, setTab] = useState<'buat' | 'gabung'>('buat');
  const [code] = useState('PAWS-7X2K');
  return (
    <Shell onClose={onClose}>
      <Title kicker="PRIVATE LOBBY" title="CUSTOM GAME" desc="Main bareng teman dengan aturanmu sendiri." />
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#3A2317]/[.07] p-1.5">
        {(['buat', 'gabung'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2.5 font-display text-lg uppercase transition ${tab === t ? 'bg-[#3A2317] text-[#FFF7DC] shadow' : 'text-[#3A2317]/50'}`}>{t === 'buat' ? 'Buat Room' : 'Gabung'}</button>
        ))}
      </div>
      {tab === 'buat' ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-2xl border-[3px] border-dashed border-[#3A2317]/25 bg-white p-4">
            <div><div className="text-[11px] font-black tracking-[0.2em] text-[#3A2317]/50">KODE ROOM</div><div className="font-display text-3xl tracking-wider">{code}</div></div>
            <button onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); sound.coin(); onToast('Kode room disalin!'); }} className="flex items-center gap-1.5 rounded-xl bg-[#3A2317] px-4 py-2.5 text-sm font-black text-white hover:bg-black"><Copy size={16} /> SALIN</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['4 Pemain', '8 Pemain', '12 Pemain'].map((p, i) => (
              <div key={p} className={`rounded-xl py-2.5 text-center text-sm font-black ${i === 1 ? 'bg-[#FF9E0B] text-white shadow' : 'bg-[#3A2317]/[.07]'}`}>{p}</div>
            ))}
          </div>
          <button onClick={() => onToast('Room dibuat! Undang temanmu.')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3A2317] py-3.5 font-display text-xl text-[#FFF7DC] shadow-[0_6px_0_rgba(0,0,0,0.3)] hover:bg-black"><Plus size={20} strokeWidth={3} /> BUAT LOBBY</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input placeholder="cth: PAWS-7X2K" className="w-full rounded-2xl border-[3px] border-[#3A2317]/15 bg-white px-5 py-4 text-center font-display text-2xl tracking-[0.2em] outline-none placeholder:text-[#3A2317]/25 focus:border-[#FF9E0B]" />
          <button onClick={() => { sound.success(); onToast('Menghubungkan ke room...'); }} className="w-full rounded-2xl bg-gradient-to-r from-[#1E9E6A] to-[#4CC38A] py-3.5 font-display text-xl text-white shadow-[0_6px_0_#0E5A35]">GABUNG SEKARANG</button>
        </div>
      )}
    </Shell>
  );
}

/* ---------------- TUTORIAL ---------------- */
export function TutorialModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: Gamepad2, t: '1. GERAK & LOMPAT', d: 'WASD untuk menggelinding, SPASI untuk melompat. Tahan untuk lompat lebih tinggi.' },
    { icon: Zap, t: '2. DORONG & TACKLE', d: 'Klik kiri untuk menubruk. Waktu yang pas bisa melempar lawan keluar arena!' },
    { icon: Crown, t: '3. MENANGKAN MAHKOTA', d: 'Bertahan hingga akhir atau rebut mahkota dan tahan 20 detik untuk menang.' },
  ];
  return (
    <Shell onClose={onClose}>
      <Title kicker="PEMULA" title="TUTORIAL" desc="3 hal yang wajib dikuasai sebelum masuk arena." />
      <div className="space-y-3">
        {steps.map((s, i) => (
          <motion.div key={s.t} initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.12 }} className="flex gap-4 rounded-2xl bg-white p-4 shadow-[0_4px_0_rgba(58,35,23,0.12)]">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#FF9E0B] text-white"><s.icon size={24} /></div>
            <div><div className="font-display text-lg">{s.t}</div><div className="text-sm font-bold text-[#3A2317]/60">{s.d}</div></div>
          </motion.div>
        ))}
      </div>
      <button onClick={onClose} className="mt-4 w-full rounded-2xl bg-[#3A2317] py-3 font-display text-lg text-[#FFF7DC]">MENGERTI, GAS MAIN!</button>
    </Shell>
  );
}

/* ---------------- LOCKER ---------------- */
export const SKINS = [
  { name: 'Tangerine', color: '#FF7A00' },
  { name: 'Creamy', color: '#FFF1C8' },
  { name: 'Ember', color: '#E23A1E' },
  { name: 'Matcha', color: '#4CC38A' },
  { name: 'Berry', color: '#B16CFF' },
  { name: 'Ocean', color: '#2EA8FF' },
  { name: 'Choco', color: '#7A4A2B' },
  { name: 'Midnight', color: '#2B2B3A' },
  { name: 'Bubblegum', color: '#FF7AB8' },
];

export function LockerModal({ onClose, left, right, setLeft, setRight, onToast, onOpenStudio }: {
  onClose: () => void; left: string; right: string; setLeft: (c: string) => void; setRight: (c: string) => void; onToast: (m: string) => void; onOpenStudio?: () => void;
}) {
  const [tab, setTab] = useState<'kiri' | 'kanan'>('kiri');
  const active = tab === 'kiri' ? left : right;
  const setActive = tab === 'kiri' ? setLeft : setRight;
  return (
    <Shell onClose={onClose} wide>
      <Title kicker="KOLEKSI • 9 SKIN" title="LOCKER BOLA" desc="Ganti warna bola kiri & kanan. Perubahan langsung tampil di tengah layar." />
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#3A2317]/[.07] p-1.5">
        {(['kiri', 'kanan'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); sound.click(); }} className={`rounded-xl py-2 font-display text-lg uppercase ${tab === t ? 'bg-[#FF9E0B] text-white shadow' : 'text-[#3A2317]/50'}`}>Bola {t}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {SKINS.map((s) => {
          const isActive = active === s.color;
          return (
            <button key={s.color + s.name} onClick={() => { setActive(s.color); onToast(`Bola ${tab} → ${s.name}`); }}
              className={`group rounded-2xl bg-white p-3 text-center transition ${isActive ? 'ring-[3px] ring-[#3A2317] shadow-[0_8px_0_#3A2317] -translate-y-1' : 'hover:-translate-y-1 hover:shadow-lg'}`}>
              <div className="relative mx-auto h-16 w-16">
                <div className="absolute inset-0 rounded-full shadow-[inset_-8px_-10px_0_rgba(0,0,0,0.18),inset_6px_8px_0_rgba(255,255,255,0.45)]" style={{ background: s.color }} />
                <div className="absolute left-3 top-2.5 h-4 w-4 rounded-full bg-white/90" />
                {isActive && <div className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-[#1E9E6A] text-white"><Check size={14} strokeWidth={4} /></div>}
              </div>
              <div className="mt-2 text-[12px] font-black">{s.name.toUpperCase()}</div>
            </button>
          );
        })}
      </div>
      <button onClick={() => onOpenStudio?.()} className="shine mt-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-[#3A2317] to-[#6B4A1E] p-4 text-left text-white ring-2 ring-[#FFC53D] transition hover:-translate-y-0.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#FFC53D] to-[#E8A800] text-[#3A2317]"><Crown size={26} /></span>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#E23A1E] to-[#FF6A00]"><Hand size={26} /></span>
        <span className="flex-1">
          <span className="block font-display text-lg leading-none">LIHAT ASET 3D</span>
          <span className="text-xs font-bold text-white/70">15 aset: Crown, Sapu, Hidung + lainnya</span>
        </span>
        <ArrowRight size={22} strokeWidth={3} className="text-[#FFC53D]" />
      </button>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#6C3BFF] to-[#B16CFF] p-4 text-white">
        <Gift size={28} />
        <div className="flex-1 text-sm font-bold">Login 7 hari beruntun untuk membuka skin <b>Golden Glow</b>!</div>
        <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-black">5/7</div>
      </div>
    </Shell>
  );
}

/* ---------------- SETTINGS ---------------- */
export function SettingsModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [vol, setVol] = useState(80);
  const [music, setMusic] = useState(60);
  const [sens, setSens] = useState(50);
  const [gfx, setGfx] = useState(1);
  const [vib, setVib] = useState(true);
  return (
    <Shell onClose={onClose}>
      <Title kicker="PENGATURAN" title="SETTINGS" desc="Atur suara, grafik, dan kontrol sesukamu." />
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm font-black"><span className="flex items-center gap-2"><Volume2 size={18} /> VOLUME SFX</span><span>{vol}%</span></div>
          <input type="range" value={vol} onChange={(e) => { const v = +e.target.value; setVol(v); sound.setSfxVol(v / 100); }} className="w-full" />
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-black"><span className="flex items-center gap-2"><Music size={18} /> MUSIK LOBBY</span><span>{music}%</span></div>
          <input type="range" value={music} onChange={(e) => { const v = +e.target.value; setMusic(v); sound.setMusicVol(v / 100); sound.startMusic(); }} className="w-full" />
          <button onClick={() => sound.coin()} className="mt-3 w-full rounded-xl bg-[#3A2317]/[.07] py-2 text-xs font-black tracking-widest text-[#3A2317]/60 transition hover:bg-[#FF9E0B] hover:text-white">TES SUARA</button>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-black"><Monitor size={18} /> KUALITAS GRAFIK</div>
          <div className="grid grid-cols-3 gap-2">
            {['LOW', 'MEDIUM', 'ULTRA'].map((g, i) => (
              <button key={g} onClick={() => { setGfx(i); sound.select(i); }} className={`rounded-xl py-2 text-sm font-black ${gfx === i ? 'bg-[#3A2317] text-white' : 'bg-[#3A2317]/[.08]'}`}>{g}</button>
            ))}
          </div>
          <div className="mb-2 mt-4 flex items-center justify-between text-sm font-black"><span>SENSITIVITAS KAMERA</span><span>{sens}%</span></div>
          <input type="range" value={sens} onChange={(e) => setSens(+e.target.value)} className="w-full" />
        </div>
        <button onClick={() => { setVib(!vib); sound.click(); }} className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-sm font-black">
          <span className="flex items-center gap-2"><Gamepad2 size={18} /> GETARAN CONTROLLER</span>
          <span className={`relative h-7 w-12 rounded-full transition ${vib ? 'bg-[#1E9E6A]' : 'bg-[#3A2317]/20'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${vib ? 'left-6' : 'left-1'}`} /></span>
        </button>
        <button onClick={() => { sound.success(); onToast('Pengaturan disimpan!'); onClose(); }} className="w-full rounded-2xl bg-[#FF9E0B] py-3 font-display text-xl text-white shadow-[0_6px_0_#7A3600]">SIMPAN</button>
      </div>
    </Shell>
  );
}

export function ExitModal({ onClose }: { onClose: () => void }) {
  return (
    <Shell onClose={onClose}>
      <div className="py-2 text-center">
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-[#E23A1E]/10 text-[#E23A1E]"><Heart size={36} /></div>
        <h2 className="font-display text-4xl">EXIT GAME?</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm font-bold text-[#3A2317]/60">Yakin mau keluar? Bola-bolamu bakal kangen lho. Daily reward besok hangus kalau skip hari ini.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={() => { sound.ready(); onClose(); }} className="rounded-2xl bg-[#3A2317] py-3 font-display text-lg text-white">LANJUT MAIN</button>
          <button onClick={() => { sound.close(); onClose(); }} className="rounded-2xl bg-[#E23A1E]/10 py-3 font-display text-lg text-[#E23A1E] hover:bg-[#E23A1E] hover:text-white">KELUAR</button>
        </div>
      </div>
    </Shell>
  );
}

export function VoteModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [voted, setVoted] = useState<number | null>(null);
  const opts = [
    { name: 'CANDY FALL', votes: 12840, color: '#FF7AB8', icon: Gift },
    { name: 'LAVA PIT', votes: 9640, color: '#E23A1E', icon: Trophy },
  ];
  const total = opts[0].votes + opts[1].votes + (voted !== null ? 1 : 0);
  return (
    <Shell onClose={onClose}>
      <Title kicker="COMMUNITY VOTE" title="VOTE MAP" desc="Map dengan vote terbanyak jadi map weekend ini." />
      <div className="space-y-3">
        {opts.map((o, i) => {
          const pct = Math.round(((o.votes + (voted === i ? 1 : 0)) / total) * 100);
          return (
            <button key={o.name} onClick={() => { setVoted(i); sound.success(); onToast(`Vote untuk ${o.name} tercatat!`); }}
              className={`w-full overflow-hidden rounded-2xl border-[3px] p-4 text-left transition ${voted === i ? 'border-[#3A2317] bg-white shadow-[0_6px_0_#3A2317]' : 'border-transparent bg-white hover:border-[#3A2317]/20'}`}>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: o.color }}><o.icon size={24} /></div>
                <div className="flex-1"><div className="font-display text-xl">{o.name}</div><div className="h-2.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: o.color }} /></div></div>
                <div className="font-display text-2xl">{pct}%</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-center text-xs font-black tracking-widest text-[#3A2317]/50">VOTING BERAKHIR DALAM 02:14:55</div>
    </Shell>
  );
}

export function DraculaModal({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  return (
    <Shell onClose={onClose}>
      <div className="overflow-hidden rounded-2xl bg-[#1E1E26] text-white">
        <div className="relative h-64 overflow-hidden">
          <img src="/images/dracula-cat.png" alt="Dracula Levi" className="h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E26] via-transparent to-transparent" />
          <div className="absolute left-4 top-4 rounded-full bg-[#E23A1E] px-3 py-1 text-[11px] font-black tracking-[0.2em]">SEASON 6 • LEGENDARY</div>
        </div>
        <div className="p-5">
          <h2 className="font-display text-4xl leading-none">DRACULA<br />LEVI</h2>
          <div className="mt-2 flex gap-2 text-[11px] font-black">
            <span className="rounded-full bg-white/10 px-3 py-1">VAMPIRE</span>
            <span className="rounded-full bg-white/10 px-3 py-1">TANK</span>
            <span className="rounded-full bg-[#E23A1E] px-3 py-1">POWER S+</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[['POWER', 92], ['SPEED', 64], ['BOUNCE', 88]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-white/[.07] p-3"><div className="text-[10px] font-black tracking-widest text-white/50">{k}</div><div className="font-display text-2xl">{v}</div></div>
            ))}
          </div>
          <button onClick={() => { sound.success(); onToast('Dracula Levi ditambahkan ke Locker!'); onClose(); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#E23A1E] to-[#FF6A00] py-3.5 font-display text-xl shadow-[0_6px_0_#7A1500]"><Crown size={22} /> DAPATKAN — 1200 <Globe size={16} /></button>
        </div>
      </div>
    </Shell>
  );
}

export function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Shell onClose={onClose}>
      <Title kicker="TENTANG" title="BOUNCE PAWS" desc="Party game 3D: jadi bola paling menggemaskan & paling rusuh di arena." />
      <div className="grid grid-cols-2 gap-3 text-sm font-bold">
        <div className="rounded-2xl bg-white p-4"><GraduationCap size={22} className="mb-2 text-[#FF9E0B]" /><b>Kontrol</b><br /><span className="text-[#3A2317]/60">WASD + Space + Mouse. Support stik PS/Xbox.</span></div>
        <div className="rounded-2xl bg-white p-4"><Users size={22} className="mb-2 text-[#1E9E6A]" /><b>Cross-play</b><br /><span className="text-[#3A2317]/60">PC, Mobile & Console dalam satu lobby.</span></div>
      </div>
      <div className="mt-3 rounded-2xl bg-[#3A2317] p-4 text-center text-xs font-black tracking-widest text-[#FFF7DC]/70">VERSI 1.4.2 • SERVER ASIA 24MS • © 2026 BOUNCE PAWS STUDIO</div>
    </Shell>
  );
}
