const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import { ANIMALS } from "../src/game/animals";
import { buildCharacterVisual } from "../src/game/characterMesh";
import { setTuning, TUNING_SPECS, resetTuning } from "../src/game/tuning";
for (const mode of ["min", "max", "default"]) {
  if (mode === "default") resetTuning();
  else setTuning(Object.fromEntries(TUNING_SPECS.map((s) => [s.key, mode === "min" ? s.min : s.max])));
  const t0 = performance.now();
  let bad = 0, verts = 0, decals = 0;
  for (const a of ANIMALS) {
    const v = buildCharacterVisual(a);
    const n = v.mesh.geometry.getAttribute("position").count;
    verts += n;
    if (n < 3000) bad++;
    v.head.traverse((o: any) => { if (o.isMesh) { decals++; const p = o.geometry.getAttribute("position").array; for (const x of p) if (!Number.isFinite(x)) bad++; } });
  }
  console.log(mode.padEnd(8), `${((performance.now() - t0) / ANIMALS.length).toFixed(0)}ms/cat avgVerts=${(verts / ANIMALS.length).toFixed(0)} faceMeshes=${decals} bad=${bad}`);
}
