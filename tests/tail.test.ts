import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMALS } from '../src/game/animals';
import { buildCharacterVisual, buildTailPath } from '../src/game/characterMesh';
import { resetTuning, setTuning } from '../src/game/tuning';

test('the refined tail remains a connected, skinned surface with and without a cap', () => {
  try {
    for (const [bodyH, accessory] of [[0.59, 'none'], [0.85, 'capNewRed']] as const) {
      setTuning({ bodyH });
      const geometry = buildCharacterVisual(ANIMALS[1], accessory).mesh.geometry;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const weight = geometry.getAttribute('skinWeight');
      const index = geometry.getIndex()!;
      const inTail = (i: number) => position.getZ(i) < -0.5 && Math.abs(position.getX(i)) < 0.22 && position.getY(i) > -0.65 && position.getY(i) < 0.05;
      const edges = new Map<string, number>();
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if (inTail(a) || inTail(b) || inTail(c)) assert(a !== b && b !== c && a !== c, 'tail contains a degenerate triangle');
        for (const [x, y] of [[a, b], [b, c], [c, a]]) {
          const key = x < y ? `${x}:${y}` : `${y}:${x}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      let tailEdges = 0;
      for (const [edge, count] of edges) {
        const [a, b] = edge.split(':').map(Number);
        if (!inTail(a) || !inTail(b)) continue;
        tailEdges++;
        assert.equal(count, 2, 'tail should not have a crack at a subdivided edge');
      }
      assert(tailEdges > 100, 'tail region should have smooth, detailed geometry');
      for (let i = 0; i < position.count; i++) {
        if (!inTail(i)) continue;
        assert(Number.isFinite(normal.getX(i)) && Number.isFinite(normal.getY(i)) && Number.isFinite(normal.getZ(i)));
        assert(Math.abs(weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i) - 1) < 1e-4, 'tail skinning weights must remain normalized');
      }
    }
  } finally {
    resetTuning();
  }
});


test('tail and base are scaled to 90% while remaining anchored to the body', () => {
  const height = 0.59;
  const { points, radii } = buildTailPath(height);
  const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  close(points[0][0], 0);
  close(points[0][1], -0.4 * height);
  close(points[0][2], -0.25);
  close(radii[0], 0.12 * 0.9);
  const tip = points[points.length - 1];
  close(tip[0], 0.05 * 0.9);
  close(tip[1], (-0.4 + (0.4 - 0.15) * 0.9) * height);
  close(tip[2], -0.25 + (-0.71 + 0.25) * 0.9);
  close(radii[radii.length - 1], 0.122 * 0.9);
});
