export function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button
      className="absolute top-3 right-3 z-40 chunky w-11 h-11 rounded-full bg-white/90 text-xl flex items-center justify-center active:scale-90"
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      title="Suara (M)"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
