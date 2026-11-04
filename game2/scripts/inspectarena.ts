const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Arena } from "../src/game/Arena";
const sc = new THREE.Scene(); const w = new CANNON.World(); const a = new Arena(w, sc, new CANNON.Material("g"));
a.group.updateMatrixWorld(true);
a.group.traverse((o) => {
 const m=o as THREE.Mesh; if(!m.isMesh) return; const mat=Array.isArray(m.material)?m.material[0]:m.material as any;
 const col=mat.color?.getHexString?.() ?? ""; if(!["ff5b5b","ff6a63","d63a4a","fff5df"].includes(col)) return;
 if(!m.geometry.boundingBox)m.geometry.computeBoundingBox(); const box=m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
 console.log(col,o.type,o.geometry.type,"y",box.min.y.toFixed(2),box.max.y.toFixed(2),"x",box.min.x.toFixed(1),box.max.x.toFixed(1),"z",box.min.z.toFixed(1),box.max.z.toFixed(1),"pos",o.position.toArray().map((x:number)=>x.toFixed(2)).join(","));
});
