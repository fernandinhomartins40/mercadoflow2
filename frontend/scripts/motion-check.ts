// Confere o motor de animação: `node scripts/motion-check.ts` (Node 23.6+ roda TypeScript direto).
import assert from 'node:assert/strict';
import { IDENTITY, MOTION_KEYS, MOTION_PRESETS, poseAt, type MotionKind } from '../src/features/art-studio/motion.ts';

const kinds: MotionKind[] = ['base', 'layer', 'seal', 'logo', 'card', 'footer'];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

for (const preset of MOTION_KEYS) {
  for (const d of [4, 8, 15]) {
    for (const kind of kinds) {
      const target = { kind, index: 2, count: 5, cx: 0.9, cy: 0.1, hero: true };
      for (let t = 0; t <= d; t += 0.25) {
        const p = poseAt(preset, target, t, d);
        for (const v of Object.values(p)) assert.ok(Number.isFinite(v), `${preset}/${kind} t=${t}: valor inválido`);
        assert.ok(p.alpha >= 0 && p.alpha <= 1, `${preset}/${kind}: alpha fora de 0..1`);
      }
      const a = poseAt(preset, target, 0, d);
      const b = poseAt(preset, target, d, d);
      if (MOTION_PRESETS[preset].loop) {
        // Loop: último quadro igual ao primeiro.
        assert.ok(near(a.dx, b.dx) && near(a.dy, b.dy) && near(a.scale, b.scale) && near(a.rotate, b.rotate) && near(a.alpha, b.alpha),
          `${preset}/${kind} d=${d}: loop não emenda`);
      }
    }
  }
}

// Entrada: começa escondido e termina visível, no lugar (a menos da respiração).
const card = { kind: 'card' as const, index: 7, count: 8, cx: 0.5, cy: 0.5 };
assert.equal(poseAt('entrada', card, 0, 8).alpha, 0);
assert.equal(poseAt('entrada', card, 8, 8).alpha, 1);
const layer = { kind: 'layer' as const, index: 0, count: 3, cx: 0.95, cy: 0.05 };
assert.ok(Math.abs(poseAt('entrada', layer, 8, 8).dx) < 0.02);
// Camada marcada como parada não anima.
assert.deepEqual(poseAt('festa', { ...layer, still: true }, 3, 8), IDENTITY);
console.log('motion: ok');
