import type { AnimalId } from "../game/animals";
import type { EyeStyleId, ExpressionId } from "../game/eyes";
import { usePortraits } from "../game/portraits";

/** 3D-rendered cat face (falls back to emoji while it's being generated) */
export default function Portrait({ id, fallback, className = "", eyeStyle = "default", expression = "default" }: { id: AnimalId; fallback: string; className?: string; eyeStyle?: EyeStyleId; expression?: ExpressionId }) {
  const portraits = usePortraits();
  const url = portraits[`${id}:${eyeStyle}:${expression}`];
  return url ? (
    <img src={url} alt={id} draggable={false} className={`h-full w-full scale-125 object-cover object-[50%_28%] ${className}`} />
  ) : (
    <span className={className}>{fallback}</span>
  );
}
