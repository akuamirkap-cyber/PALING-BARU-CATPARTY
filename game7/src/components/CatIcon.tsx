import { ANIMALS } from '../game/animals';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function CatIcon({ id, size = 48 }: { id: string; size?: number }) {
  const d = ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
  const m1 = hex(d.mark);
  const m2 = hex(d.mark2 ?? d.mark);
  const clip = `clip-${d.id}`;
  const eye = (cx: number) => (
    <g key={cx}>
      <ellipse cx={cx} cy={52} rx={9.5} ry={10.5} fill="#0e0e14" />
      <path d={`M ${cx - 7} 54 A 7.5 8 0 0 0 ${cx + 7} 54`} fill="none" stroke={hex(d.iris)} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={cx + 0.5} cy={47} r={2.6} fill="#fff" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={clip}>
          <ellipse cx={50} cy={58} rx={42} ry={36} />
        </clipPath>
      </defs>
      {/* telinga */}
      <polygon points="10,48 16,6 46,26" fill={hex(d.ear)} />
      <polygon points="19,38 21,17 37,28" fill={hex(d.earIn)} />
      <polygon points="90,48 84,6 54,26" fill={hex(d.ear2 ?? d.ear)} />
      <polygon points="81,38 79,17 63,28" fill={hex(d.earIn)} />
      {/* kepala */}
      <ellipse cx={50} cy={58} rx={42} ry={36} fill={hex(d.body)} />
      <g clipPath={`url(#${clip})`}>
        {d.kind === 'tabby' && (
          <g stroke={m1} strokeWidth={4} strokeLinecap="round">
            <line x1={50} y1={24} x2={50} y2={36} />
            <line x1={42} y1={25} x2={43} y2={35} />
            <line x1={58} y1={25} x2={57} y2={35} />
            <line x1={10} y1={60} x2={20} y2={58} />
            <line x1={10} y1={68} x2={20} y2={68} />
            <line x1={90} y1={60} x2={80} y2={58} />
            <line x1={90} y1={68} x2={80} y2={68} />
          </g>
        )}
        {d.kind === 'calico' && (
          <g>
            <ellipse cx={28} cy={38} rx={22} ry={18} fill={m1} />
            <ellipse cx={84} cy={44} rx={24} ry={22} fill={m2} />
          </g>
        )}
        {d.kind === 'cow' && (
          <g fill={m1}>
            <ellipse cx={30} cy={46} rx={14} ry={12} />
            <ellipse cx={78} cy={40} rx={18} ry={13} />
            <ellipse cx={88} cy={72} rx={12} ry={10} />
          </g>
        )}
        {d.kind === 'siamese' && <ellipse cx={50} cy={66} rx={30} ry={26} fill={m1} opacity={0.75} />}
      </g>
      {/* moncong */}
      <ellipse cx={39} cy={76} rx={13} ry={9} fill={hex(d.muzzle)} />
      <ellipse cx={61} cy={76} rx={13} ry={9} fill={hex(d.muzzle)} />
      {eye(33)}
      {eye(67)}
      <ellipse cx={50} cy={69} rx={3.4} ry={2.6} fill={hex(d.nose)} />
      <path d="M 44 77 Q 47 81 50 77 Q 53 81 56 77" fill="none" stroke="#1b1117" strokeWidth={1.6} strokeLinecap="round" />
      {d.blush && (
        <g fill="#ff8fa8" opacity={0.45}>
          <ellipse cx={17} cy={68} rx={6} ry={4} />
          <ellipse cx={83} cy={68} rx={6} ry={4} />
        </g>
      )}
      {/* kumis */}
      <g stroke="#fff" strokeWidth={1.3} strokeLinecap="round">
        <line x1={24} y1={72} x2={4} y2={68} />
        <line x1={24} y1={77} x2={5} y2={80} />
        <line x1={76} y1={72} x2={96} y2={68} />
        <line x1={76} y1={77} x2={95} y2={80} />
      </g>
    </svg>
  );
}
