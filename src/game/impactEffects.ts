import type { HitKind } from './Character';

const PUNCH = { count: 9, color: 0xffffff, size: 0.17, speed: 1.15 } as const;
const BAT = { count: 14, color: 0xffffff, size: 0.22, speed: 1.4 } as const;
const PAN = { count: 14, color: 0xffe9a6, size: 0.22, speed: 1.4 } as const;
const BIG = { count: 14, color: 0xffe066, size: 0.22, speed: 1.4 } as const;

/** Keep combat readable while the bat's impact puff stays white. */
export function impactEffect(kind: HitKind) {
  return kind === 'punch' ? PUNCH : kind === 'bat' ? BAT : kind === 'pan' ? PAN : BIG;
}

/** A bat KO can spawn a second puff before the normal impact effect. */
export function knockoutEffectColor(lastHitKind: string) {
  return lastHitKind === 'bat' ? 0xffffff : 0xffd93d;
}
