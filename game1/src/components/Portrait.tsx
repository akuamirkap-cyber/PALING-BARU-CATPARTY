import type { AnimalId } from "../game/animals";
import { usePortraits } from "../game/portraits";

/** 3D-rendered cat face (falls back to emoji while it's being generated) */
export default function Portrait({ id, fallback, className = "" }: { id: AnimalId; fallback: string; className?: string }) {
  const portraits = usePortraits();
  const url = portraits[id];
  return url ? (
    <img src={url} alt={id} draggable={false} className={`h-full w-full scale-125 object-cover object-[50%_28%] ${className}`} />
  ) : (
    <span className={className}>{fallback}</span>
  );
}
