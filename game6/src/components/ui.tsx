import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border-[3px] border-ink bg-cream shadow-[0_5px_0_#1f2430] backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}

type Tone = 'yellow' | 'coral' | 'teal' | 'blue' | 'white' | 'ink';
const TONES: Record<Tone, string> = {
  yellow: 'bg-sun text-ink',
  coral: 'bg-coral text-white',
  teal: 'bg-teal text-ink',
  blue: 'bg-ocean text-white',
  white: 'bg-white text-ink',
  ink: 'bg-ink text-cream',
};

export function ChunkyButton({
  children,
  onClick,
  tone = 'white',
  className,
  disabled,
  title,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  className?: string;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-xl border-[3px] border-ink px-3 py-1.5 font-display text-sm font-semibold',
        'shadow-[0_4px_0_#1f2430] transition-all duration-100 hover:-translate-y-0.5 hover:shadow-[0_6px_0_#1f2430]',
        'active:translate-y-[3px] active:shadow-[0_1px_0_#1f2430] disabled:cursor-not-allowed disabled:opacity-50',
        TONES[tone],
        active && 'translate-y-[2px] bg-sun shadow-[0_2px_0_#1f2430] ring-2 ring-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-4 first:mt-0">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wider text-ink/70">{children}</h3>
      {hint && <p className="text-xs leading-snug text-ink/55">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  emoji,
  checked,
  onChange,
  hint,
}: {
  label: string;
  emoji?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors',
        checked ? 'border-ink bg-white' : 'border-ink/20 bg-white/50 hover:border-ink/50',
      )}
    >
      {emoji && <span className="text-lg leading-none">{emoji}</span>}
      <span className="flex-1">
        <span className={cn('block text-sm font-semibold', checked ? 'text-ink' : 'text-ink/60')}>{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-ink/50">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border-2 border-ink transition-colors',
          checked ? 'bg-teal' : 'bg-ink/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full border-2 border-ink bg-white transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

export function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-ink/15 bg-white/70 px-2.5 py-1.5 transition-colors hover:border-ink/50">
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border-2 border-ink shadow-[0_2px_0_#1f2430]">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      <span className="font-mono text-[11px] uppercase text-ink/50">{value}</span>
    </label>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-semibold text-ink shadow-[0_2px_0_#1f2430]',
        className,
      )}
    >
      {children}
    </span>
  );
}
