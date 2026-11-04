/// <reference lib="webworker" />
import { buildCat } from './build';
import { SPECS } from './specs';

type Req = { id: 'oyen' | 'siam'; h: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, h } = e.data;
  const post = (msg: unknown, transfer?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);
  let last = 0;
  const build = buildCat(SPECS[id], h, (p) => {
    if (p - last > 0.02 || p >= 1) { last = p; post({ type: 'progress', id, p }); }
  });
  const transfer: Transferable[] = [
    build.body.positions.buffer, build.body.normals.buffer, build.body.colors.buffer, build.body.indices.buffer,
    build.decal.positions.buffer, build.decal.normals.buffer, build.decal.uvs.buffer, build.decal.indices.buffer,
    build.tex.rgba.buffer, build.tex.mat.buffer,
    ...build.whiskers.map((w) => w.buffer),
  ] as Transferable[];
  post({ type: 'done', id, build }, transfer);
};
