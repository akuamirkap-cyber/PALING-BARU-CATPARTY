const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import { ANIMALS } from "../src/game/animals";
import { buildCharacterVisual } from "../src/game/characterMesh";
for (const a of ANIMALS) {
  const t0 = performance.now();
  const v = buildCharacterVisual(a);
  const t1 = performance.now();
  const g = v.mesh.geometry;
  const pos = g.getAttribute("position");
  const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for (let i = 0; i < pos.count; i++) for (let k=0;k<3;k++){ const x=pos.getComponent(i,k); mn[k]=Math.min(mn[k],x); mx[k]=Math.max(mx[k],x); }
  const col = g.getAttribute("color");
  const uniq = new Set<string>(); for (let i=0;i<col.count;i+=7) uniq.add([col.getX(i),col.getY(i),col.getZ(i)].map(c=>Math.round(c*8)).join());
  const eyes = v.eyesNormal.children.map(c=>c.position.toArray().map(n=>n.toFixed(2)).join(",")).join(" | ");
  console.log(a.id.padEnd(8), `${(t1-t0).toFixed(0)}ms verts=${pos.count} x=[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] y=[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] z=[${mn[2].toFixed(2)},${mx[2].toFixed(2)}] colors~${uniq.size} eyes=${eyes} headKids=${v.head.children.length}`);
}
