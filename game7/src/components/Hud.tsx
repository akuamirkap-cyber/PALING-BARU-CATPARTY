import type { HudState } from '../game/engine';
import { CatIcon } from './CatIcon';
import { pointsFor, RANKS } from '../game/fish';

function Timer({ t, frenzy }: { t: number; frenzy: boolean }) {
  const s = Math.max(0, Math.ceil(t));
  const urgent = s <= 10;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <div
        className={`chunky flex items-center gap-2 rounded-full px-5 py-1.5 ${urgent ? 'bg-red-500 anim-pulse' : frenzy ? 'bg-orange-400' : 'bg-white'}`}
      >
        <span className="text-2xl">{urgent ? '⏰' : '⏱️'}</span>
        <span className={`text-4xl font-bold tabular-nums leading-none ${urgent || frenzy ? 'text-white text-outline' : 'text-slate-800'}`}>{s}</span>
      </div>
    </div>
  );
}

function Board({ hud }: { hud: HudState }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 w-[170px] sm:w-[210px]">
      {hud.board.map((b) => (
        <div
          key={b.id}
          className={`chunky flex items-center gap-2 rounded-2xl px-2 py-1 transition-transform ${b.isPlayer ? 'bg-white scale-105 origin-left' : 'bg-white/85'}`}
          style={{ borderColor: b.isPlayer ? b.color : '#fff' }}
        >
          <div className="text-sm font-bold text-slate-500 w-4 text-center">{b.rank}</div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: b.color }}>
            <CatIcon id={b.animal} size={30} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{b.name}</div>
            <div className="text-[10px] text-slate-400 whitespace-nowrap truncate">
              🐟 {b.count} · ⚖️ {b.heaviest > 0 ? `${b.heaviest.toFixed(1)} kg` : '—'}
            </div>
          </div>
          <div className="text-xl font-bold text-slate-800 tabular-nums">{b.score}</div>
        </div>
      ))}
    </div>
  );
}

function ReelBar({ hud }: { hud: HudState }) {
  const r = hud.me.reel;
  if (!r) return null;
  const hold = hud.me.hold;
  return (
    <div className="absolute right-3 sm:right-10 top-1/2 -translate-y-[55%] z-10 flex flex-col items-center gap-2 anim-slide">
      <div className="chunky bg-white rounded-2xl px-3 py-1 text-sm font-bold text-slate-700 flex flex-col items-center leading-tight" style={{ borderColor: r.rankColor }}>
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 rounded-md text-white text-xs font-bold" style={{ background: r.rankColor }}>
            {r.rank}
          </span>
          <span>{r.emoji}</span> {r.name}
        </div>
        <div className="text-xs text-slate-500">
          {r.weight.toFixed(1)} kg · <span className="text-emerald-600">+{r.points} poin</span>
        </div>
      </div>
      <div className="flex gap-2.5 items-stretch" style={{ height: 'min(340px, 46vh)' }}>
        {/* track */}
        <div className="relative w-[62px] rounded-2xl overflow-hidden chunky" style={{ background: 'linear-gradient(#1b5e86,#0e3a5c)' }}>
          {[0.25, 0.5, 0.75].map((m) => (
            <div key={m} className="absolute left-0 right-0 h-[2px] bg-white/15" style={{ bottom: `${m * 100}%` }} />
          ))}
          <div
            className={`absolute left-0 right-0 border-y-4 ${r.inZone ? 'bg-lime-400/90 border-lime-200' : 'bg-lime-500/55 border-lime-300/70'}`}
            style={{ bottom: `${r.zone * 100}%`, height: `${r.size * 100}%` }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xl font-bold">{hold ? '▲' : '▼'}</div>
          </div>
          <div
            className={`absolute left-1/2 text-3xl ${r.thrash ? 'anim-pulse' : ''}`}
            style={{ bottom: `${r.fish * 100}%`, transform: 'translate(-50%, 50%)', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.5))' }}
          >
            {r.emoji}
          </div>
        </div>
        {/* progress */}
        <div className="relative w-6 rounded-full overflow-hidden chunky bg-slate-800/60">
          <div
            className="absolute left-0 right-0 bottom-0 rounded-b-full"
            style={{
              height: `${r.progress * 100}%`,
              background: r.progress > 0.66 ? 'linear-gradient(#b6ff5a,#3fd13f)' : r.progress > 0.33 ? 'linear-gradient(#ffe45a,#ffb02e)' : 'linear-gradient(#ff8a7a,#ff4d4d)',
            }}
          />
        </div>
      </div>
      <div className={`chunky rounded-full px-4 py-1 text-base font-bold text-white text-outline ${hold ? 'bg-emerald-500' : 'bg-sky-500'}`}>
        {hold ? 'TARIK ▲' : 'LEPAS ▼'}
      </div>
    </div>
  );
}

function RankLegend({ hud }: { hud: HudState }) {
  return (
    <div className="hidden [@media(min-height:700px)]:block absolute left-3 top-[252px] z-10 chunky rounded-2xl bg-white/85 px-2.5 py-2 w-[210px]">
      <div className="text-[11px] font-bold text-slate-500 mb-1 flex justify-between">
        <span>RANK IKAN</span>
        <span>berat↑ = poin↑</span>
      </div>
      {RANKS.slice()
        .reverse()
        .map((k) => (
          <div key={k.id} className="flex items-center gap-1.5 text-[11px] leading-5">
            <span className="w-5 h-5 rounded-md text-white font-bold flex items-center justify-center text-xs" style={{ background: k.color }}>
              {k.id}
            </span>
            <span className="w-[62px] text-slate-600 font-semibold">{k.max >= 99 ? `≥ ${k.min} kg` : k.min === 0 ? `< ${k.max} kg` : `${k.min}–${k.max} kg`}</span>
            <span className="text-slate-500 flex-1 text-right tabular-nums">
              {pointsFor(Math.max(0.2, k.min))}–{k.max >= 99 ? '600' : pointsFor(k.max)}
            </span>
          </div>
        ))}
      <div className="mt-1 pt-1 border-t border-slate-200 text-[11px] text-slate-600 flex justify-between font-semibold">
        <span>⚖️ Terberatmu</span>
        <span>{hud.me.heaviest > 0 ? `${hud.me.heaviest.toFixed(1)} kg` : '—'}</span>
      </div>
    </div>
  );
}

function PowerBar({ hud }: { hud: HudState }) {
  if (hud.me.fs !== 'charging') return null;
  const p = hud.me.power;
  return (
    <div className="absolute left-1/2 bottom-28 sm:bottom-24 -translate-x-1/2 z-10 w-[min(360px,80vw)]">
      <div className="text-center text-white text-outline font-bold mb-1">KEKUATAN LEMPAR</div>
      <div className="chunky h-6 rounded-full bg-slate-800/60 overflow-hidden relative">
        <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: 'linear-gradient(90deg,#7cf05a,#ffe14d,#ff5a4d)' }} />
      </div>
    </div>
  );
}

function BiteAlert({ hud }: { hud: HudState }) {
  if (hud.me.fs !== 'bite') return null;
  return (
    <div className="absolute left-1/2 top-[28%] z-20 anim-bite pointer-events-none">
      <div className="chunky rounded-3xl bg-yellow-300 px-8 py-3 text-center">
        <div className="text-5xl font-bold text-red-600 leading-none">❗ TARIK!</div>
        <div className="mt-2 h-3 rounded-full bg-black/20 overflow-hidden">
          <div className="h-full bg-red-500" style={{ width: `${hud.me.biteLeft * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function Hud({ hud, touch }: { hud: HudState; touch: boolean }) {
  const playing = hud.phase === 'playing';
  const active = playing || hud.phase === 'countdown';
  return (
    <div className="absolute inset-0 pointer-events-none">
      {active || hud.phase === 'finished' ? <Timer t={hud.timeLeft} frenzy={hud.frenzy} /> : null}
      {active || hud.phase === 'finished' ? <Board hud={hud} /> : null}
      {active || hud.phase === 'finished' ? <RankLegend hud={hud} /> : null}

      {playing && hud.me.sharkAlert > 0.2 && !hud.me.leaping && (
        <div
          className="absolute inset-0 z-[8]"
          style={{ background: 'radial-gradient(ellipse at center, rgba(255,40,70,0) 40%, rgba(255,50,80,0.5) 100%)', opacity: 0.35 + hud.me.sharkAlert * 0.65, animation: 'pulse-soft 0.35s ease-in-out infinite' }}
        />
      )}
      {playing && hud.me.sharkAlert > 0.2 && !hud.me.leaping && (
        <div className="absolute left-1/2 top-[27%] -translate-x-1/2 z-20 anim-pulse">
          <div className="chunky rounded-3xl bg-red-600 px-6 py-2 text-3xl font-bold text-white text-outline whitespace-nowrap">🦈 HIU MENGINCARMU!</div>
        </div>
      )}
      {playing && hud.me.edge && hud.me.sharkAlert <= 0.2 && !hud.me.leaping && (
        <div className="absolute left-1/2 top-[27%] -translate-x-1/2 z-10">
          <div className="chunky rounded-full bg-amber-400 px-4 py-1 text-base font-bold text-slate-800 whitespace-nowrap">⚠ Tepi air — hiu mengintai! 🦈</div>
        </div>
      )}
      {playing && hud.me.leaping && (
        <div className="absolute inset-x-0 top-[24%] flex justify-center z-20 pointer-events-none">
          <div className="title-sticker font-bold text-center anim-pulse" style={{ fontSize: 'min(11vw, 80px)' }}>
            WHEEEE! 🦈💨
          </div>
        </div>
      )}
      {hud.banner && (playing || hud.phase === 'finished') && (
        <div key={hud.banner} className="absolute inset-x-0 top-[17%] flex justify-center anim-count z-20 px-2">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(7vw, 46px)' }}>
            {hud.banner}
          </div>
        </div>
      )}

      {hud.frenzy && (
        <div className="absolute top-[74px] left-1/2 -translate-x-1/2 z-10 anim-pulse">
          <div className="chunky rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-5 py-1 text-white font-bold text-lg text-outline whitespace-nowrap">
            🔥 FRENZY! POIN ×2 🔥
          </div>
        </div>
      )}

      {playing && <ReelBar hud={hud} />}
      {playing && <PowerBar hud={hud} />}
      {playing && <BiteAlert hud={hud} />}

      {active && hud.hint && (
        <div className="absolute left-1/2 bottom-[118px] sm:bottom-6 -translate-x-1/2 z-10 w-[92vw] flex justify-center">
          <div className="rounded-full bg-slate-900/70 px-5 py-2 text-white font-semibold text-center text-sm sm:text-lg text-outline backdrop-blur-sm border-2 border-white/40">
            {touch ? hud.hint.replace(/\[SPASI\]/g, '🎣') : hud.hint}
          </div>
        </div>
      )}

      {hud.phase === 'countdown' && hud.countdown > 0 && (
        <div key={hud.countdown} className="absolute inset-0 flex items-center justify-center anim-count">
          <div className="title-sticker font-bold" style={{ fontSize: 'min(30vw, 240px)' }}>
            {hud.countdown}
          </div>
        </div>
      )}
      {hud.go && (
        <div className="absolute inset-0 flex items-center justify-center anim-count">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(14vw, 120px)' }}>
            MANCING! 🎣
          </div>
        </div>
      )}
      {hud.phase === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center anim-count">
          <div className="title-sticker font-bold text-center" style={{ fontSize: 'min(13vw, 110px)' }}>
            WAKTU HABIS!
          </div>
        </div>
      )}

      {!touch && active && (
        <div className="hidden xl:block absolute left-3 bottom-3 z-10 rounded-2xl bg-white/70 backdrop-blur-sm px-3 py-1.5 text-[11px] text-slate-700 leading-[18px] border-2 border-white/80">
          <div><b>WASD</b> jalan · <b>SPASI</b> / klik = mancing</div>
          <div><b>J</b> / klik kanan = pukul · <b>K</b> lompat · <b>L</b> terjang</div>
          <div>🦈 jangan dekat tepi air — hiu menggigit!</div>
        </div>
      )}
    </div>
  );
}
