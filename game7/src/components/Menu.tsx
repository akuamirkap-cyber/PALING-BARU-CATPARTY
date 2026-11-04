import { ANIMALS } from '../game/animals';
import { CatIcon } from './CatIcon';
import { RANKS } from '../game/fish';
import type { GameId } from '../App';

interface Props {
  game: GameId;
  onGame: (g: GameId) => void;
  selected: string;
  onSelect: (id: string) => void;
  onStart: () => void;
}

const GAMES: { id: GameId; icon: string; name: string; sub: string; grad: string }[] = [
  { id: 'fishing', icon: '🎣', name: 'Mancing Gokil', sub: 'pantai · hiu · ikan berrank', grad: 'from-sky-400 to-blue-500' },
  { id: 'kart', icon: '🏎️', name: 'Go-Kart Gila', sub: '3 lap · drift & item', grad: 'from-fuchsia-400 to-pink-500' },
  { id: 'ruins', icon: '🗿', name: 'Kuil Batu Maut', sub: 'panjat, hindari batu raksasa', grad: 'from-amber-500 to-orange-700' },
  { id: 'snow', icon: '⛄', name: 'Bola Salju', sub: 'gulung lawan dari bukit', grad: 'from-sky-300 to-indigo-500' },
  { id: 'plane', icon: '✈️', name: 'Pesawat Gila', sub: 'bertahan di atas pesawat', grad: 'from-cyan-400 to-blue-600' },
  { id: 'bomb', icon: '💣', name: 'Bom Atap', sub: 'bertahan di atas gedung', grad: 'from-orange-400 to-red-500' },
  { id: 'hunt', icon: '🦆', name: 'Duck Hunt Sniper', sub: '90 detik · scope & senggol', grad: 'from-emerald-400 to-green-600' },
];

export function Menu({ game, onGame, selected, onSelect, onStart }: Props) {
  const cur = ANIMALS.find((a) => a.id === selected) ?? ANIMALS[0];
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between pointer-events-none">
      <div className="pt-3 sm:pt-5 text-center">
        <div className="title-sticker font-bold leading-[0.9] anim-float" style={{ fontSize: 'min(12vw, 84px)' }}>
          PARTY CATS
        </div>
        <div className="mt-3 flex justify-center gap-1 sm:gap-2 px-2 pointer-events-auto flex-wrap max-w-[820px] mx-auto">
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={(e) => {
                e.currentTarget.blur();
                if (g.id !== game) onGame(g.id);
              }}
              title={g.sub}
              className={`chunky rounded-2xl w-[clamp(74px,8.2vw,100px)] px-1 py-1.5 text-center text-white text-outline bg-gradient-to-b ${g.grad} transition-transform flex flex-col items-center ${
                game === g.id ? 'scale-110 ring-4 ring-yellow-300 shadow-xl' : 'opacity-85 hover:opacity-100 hover:scale-105'
              }`}
            >
              <span className="leading-none" style={{ fontSize: 'clamp(18px, 2.6vw, 30px)' }}>{g.icon}</span>
              <span className="block mt-0.5 font-bold leading-[1.1] px-0.5 break-words" style={{ fontSize: 'clamp(7px, 1.55vw, 11px)' }}>{g.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hidden [@media(min-width:1180px)_and_(min-height:700px)]:block absolute right-4 top-[196px] w-[250px] chunky rounded-3xl bg-white/92 p-3.5 text-slate-700 pointer-events-auto anim-slide" key={game}>
        {game === 'fishing' ? (
          <>
            <div className="text-xl font-bold mb-2">🎣 Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Lempar</b> — TAHAN <kbd className="px-1.5 rounded bg-slate-200">SPASI</kbd>, LEPAS untuk lempar. Makin jauh = ikan makin <b>berat</b> &amp; langka!
              </li>
              <li>
                <b>2. Gigit!</b> — saat muncul ❗ tekan SPASI secepatnya.
              </li>
              <li>
                <b>3. Tarik–Lepas</b> — TAHAN = zona hijau naik, LEPAS = turun. Jaga ikan di dalam zona!
              </li>
              <li>
                <b>4. Rank ikan</b> — makin <b>berat</b> makin banyak poin:{' '}
                {RANKS.map((k) => (
                  <span key={k.id} className="inline-block px-1.5 mx-0.5 rounded text-white text-xs font-bold" style={{ background: k.color }}>
                    {k.id}
                  </span>
                ))}{' '}
                Tuna raksasa 12 kg+ = rank S!
              </li>
              <li>
                <b>5. Awas HIU! 🦈</b> — jangan dekat tepi air atau kecebur: hiu menggigit &amp; kamu <b>dilempar kocak</b> balik ke pantai.
              </li>
              <li>
                <b>6. Jahilin!</b> — Pukul (<b>J</b>), terjang (<b>L</b>) lawan sampai kecebur ke hiu 😈
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">WASD jalan · K lompat · M mute · 🔥 15 detik terakhir poin ×2</div>
          </>
        ) : game === 'ruins' ? (
          <>
            <div className="text-xl font-bold mb-2">🗿 Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Panjat!</b> — lari (WASD) menaiki tanjakan kuil sampai <b>berhala emas</b> di puncak. Yang pertama sampai menang 🏆
              </li>
              <li>
                <b>2. Batu menggelinding!</b> — batu raksasa digelindingkan dari mulut patung di puncak. Lihat <b style={{ color: '#e02020' }}>jalur merah</b> sebelum batu keluar!
              </li>
              <li>
                <b>3. Menghindar</b> — geser ke samping, <b>loncat</b> (<kbd className="px-1.5 rounded bg-slate-200">SPASI</kbd>) untuk batu kecil, atau <b>terjang</b> (SHIFT). Masuk <b>relung di dinding</b> = tempat aman 🟢
              </li>
              <li>
                <b>4. Gelombang</b> — tiap 8 detik batu makin banyak &amp; besar. Kena batu = terpental turun, tapi tidak mati. <b>E</b> senggol rival ke jalur batu 😈
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">Kamera ala Fall Guys: geser mouse (klik dulu) / Q-R putar kamera · WASD ke arah kamera</div>
          </>
        ) : game === 'snow' ? (
          <>
            <div className="text-xl font-bold mb-2">⛄ Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Bikin bola</b> — tekan <kbd className="px-1.5 rounded bg-slate-200">N</kbd>, lalu <b>jalan / lari</b> (WASD) sambil menggulung bola di salju. Makin jauh digulung, bola makin <b>besar</b>.
              </li>
              <li>
                <b>2. Lepas</b> — hadapkan ke lawan, tekan <kbd className="px-1.5 rounded bg-slate-200">M</kbd>. Bola <b>menggelinding sendiri</b> lurus ke depan, walau di tanah datar!
              </li>
              <li>
                <b>3. Gulung lawan</b> — kucing yang kelindas bola besar <b>tergulung &amp; terbawa</b> keluar arena, jatuh dari puncak bukit = <b>KO +100</b>. Yang tergulung bisa lolos dengan menekan <kbd className="px-1.5 rounded bg-slate-200">SPASI</kbd> berkali-kali.
              </li>
              <li>
                <b>4. Hindari &amp; ganggu</b> — <b>SHIFT</b> terjang menghindar, <b>E</b> senggol lawan ke tepi. Boneka &amp; igloo bisa jadi tempat sembunyi (dan poin kalau dihancurkan) ⛄
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">Kamera ala Fall Guys: geser mouse (klik dulu) / Q-R putar kamera · WASD ke arah kamera · 🔥 15 detik terakhir ×2 · (M = lepas bola, bukan mute)</div>
          </>
        ) : game === 'plane' ? (
          <>
            <div className="text-xl font-bold mb-2">✈️ Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Bertahan</b> — kamu di atas pesawat besar yang terbang kencang. Jatuh dari tepi (garis kuning-hitam) = <b>tersingkir</b>. Penyintas terakhir menang 👑
              </li>
              <li>
                <b>2. Berpegangan</b> — <b>TAHAN</b> <kbd className="px-1.5 rounded bg-slate-200">F</kbd> atau klik saat ada <b>angin kencang</b>, pesawat <b>miring</b>, atau <b>turbulensi</b>. Staminanya terbatas!
              </li>
              <li>
                <b>3. Hindari</b> — 🐦 <b>burung raksasa</b> menyambar di lajur merah: <b>LOMPAT</b> (SPASI). Daerah di belakang baling-baling juga berangin.
              </li>
              <li>
                <b>4. Jahilin</b> — <b>E</b> senggol, <b>SHIFT</b> terjang lawan ke tepi pesawat 😈
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">WASD jalan · tiap 9 detik GELOMBANG baru, makin ganas · M mute</div>
          </>
        ) : game === 'bomb' ? (
          <>
            <div className="text-xl font-bold mb-2">💣 Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Bertahan!</b> — bom jatuh dari langit di atap gedung. Lingkaran <b style={{ color: '#e02020' }}>merah</b> = zona ledakan. Pergi dari sana!
              </li>
              <li>
                <b>2. Ambil &amp; lempar</b> — tekan <kbd className="px-1.5 rounded bg-slate-200">F</kbd> dekat bom untuk mengambilnya. <b>Tahan F</b> lalu lepas untuk melempar — kena lawan = meledak seketika!
              </li>
              <li>
                <b>3. Terpental</b> — yang kena ledakan terlempar jauh. Jatuh dari tepi atap = <b>tersingkir</b>. Penyintas terakhir menang 👑
              </li>
              <li>
                <b>4. Makin gawat</b> — tiap 11 detik ada GELOMBANG baru: bom makin banyak, ada bom raksasa &amp; bom pecah.
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">WASD jalan · SPASI lompat · SHIFT terjang (menendang bom) · E senggol · M mute</div>
          </>
        ) : game === 'hunt' ? (
          <>
            <div className="text-xl font-bold mb-2">🦆 Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Bidik</b> — gerakkan <b>MOUSE</b>. Tahan <b>KLIK KANAN</b> untuk <b>SCOPE</b> sniper (zoom 4,8×). Diam di scope = bidikan stabil.
              </li>
              <li>
                <b>2. Tembak</b> — <b>KLIK KIRI</b>. Peluru butuh waktu terbang, jadi <b>bidik di DEPAN</b> bebek yang terbang! 5 peluru lalu reload.
              </li>
              <li>
                <b>3. Bebek</b> — 🟤 biasa 10 · 🔵 cepat 25 · 🌟 <b>emas 75</b> · 💣 <b>bom −25</b>. Headshot ×1,5, beruntun 3× = skor ×2, 6× = ×3.
              </li>
              <li>
                <b>4. Ganggu lawan!</b> — <b>F</b> senggol, <b>SHIFT</b> terjang, atau tabrak mereka. Bidikan lawan buyar & bisa kecebur 😈
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">WASD jalan · SPASI lompat · R reload · M mute · 🔥 15 detik terakhir poin ×2</div>
          </>
        ) : (
          <>
            <div className="text-xl font-bold mb-2">🏎️ Cara Main</div>
            <ol className="space-y-2 text-sm leading-snug">
              <li>
                <b>1. Ngebut</b> — <kbd className="px-1.5 rounded bg-slate-200">W</kbd> gas, <kbd className="px-1.5 rounded bg-slate-200">S</kbd> rem, <kbd className="px-1.5 rounded bg-slate-200">A/D</kbd> belok. Tekan GAS pas angka <b>1</b> = ROCKET START 🚀
              </li>
              <li>
                <b>2. Drift</b> — tahan <kbd className="px-1.5 rounded bg-slate-200">SPASI</kbd> sambil belok. Makin lama → api <b style={{ color: '#2a9df4' }}>biru</b> lalu <b style={{ color: '#ff8a00' }}>oranye</b>. Lepas = TURBO!
              </li>
              <li>
                <b>3. Item</b> — tabrak kotak ❔ lalu <kbd className="px-1.5 rounded bg-slate-200">SHIFT</kbd>: 🚀 turbo · 🍌 pisang · 🎯 cangkang.
              </li>
              <li>
                <b>4. Panah kuning</b> di jalan = turbo gratis. Jangan nabrak tembok & keluar ke pasir!
              </li>
            </ol>
            <div className="mt-2 text-xs text-slate-500">R balik ke jalur · M mute · 3 lap lawan 3 bot</div>
          </>
        )}
      </div>

      <div className="pointer-events-auto pb-4 sm:pb-6 px-3 flex flex-col items-center gap-3">
        <div className="text-center text-white text-outline rounded-2xl bg-slate-900/45 backdrop-blur-sm px-5 py-1.5 border-2 border-white/50">
          <div className="text-lg sm:text-xl font-bold leading-tight">{cur.name}</div>
          <div className="text-[11px] sm:text-xs opacity-95">{cur.blurb}</div>
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-center">
          {ANIMALS.map((a) => (
            <button
              key={a.id}
              onClick={(e) => {
                e.currentTarget.blur();
                onSelect(a.id);
              }}
              className={`chunky w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full pt-1 flex items-center justify-center transition-transform hover:scale-110 ${
                selected === a.id ? 'bg-yellow-300 scale-110 ring-4 ring-yellow-200' : 'bg-white/90'
              }`}
              title={a.name}
            >
              <CatIcon id={a.id} size={46} />
            </button>
          ))}
        </div>
        <button
          onClick={(e) => {
            e.currentTarget.blur();
            onStart();
          }}
          className="chunky rounded-full bg-gradient-to-b from-lime-400 to-green-500 px-12 py-3 text-3xl sm:text-4xl font-bold text-white text-outline hover:scale-105 active:scale-95 transition-transform anim-pulse"
        >
          {game === 'fishing' ? 'MANCING! 🎣' : game === 'kart' ? 'BALAPAN! 🏎️' : game === 'bomb' ? 'LEMPAR BOM! 💣' : game === 'plane' ? 'TERBANG! ✈️' : game === 'snow' ? 'GULUNG! ⛄' : game === 'ruins' ? 'NAIK! 🗿' : 'TEMBAK! 🎯'}
        </button>
      </div>
    </div>
  );
}
