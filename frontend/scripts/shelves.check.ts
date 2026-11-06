// Verificação das regras de divisão das prateleiras: node scripts/shelves.check.ts
import assert from 'node:assert/strict';
import {
  addSlot, applyLayoutToSide, copySide, defaultSides, describePlace, moveDivider, setShare, setShelfCount,
  splitBy, splitByFacings, usedShare,
} from '../src/features/store-map/shelves.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≠ ${b}`);

// Gôndola de 4,7 m: 4 módulos de 1 m + 1 de 70 cm, dois lados, 5 prateleiras.
const g = { id: 'g', type: 'gondola' as const, x: 0, y: 0, w: 1, h: 4.7, label: 'Gôndola 1', departments: [] };
const sides = defaultSides(g);
assert.deepEqual(sides.map((s) => s.key), ['A', 'B']);
assert.deepEqual(sides[0].modules.map((m) => m.widthCm), [100, 100, 100, 100, 70]);
assert.equal(sides[0].modules[0].shelves.length, 5);
// Sobra menor que 30 cm junta no último módulo: 2,1 m = 100 + 110.
assert.deepEqual(defaultSides({ ...g, h: 2.1 })[0].modules.map((m) => m.widthCm), [100, 110]);
assert.equal(defaultSides({ ...g, type: 'geladeira' }).length, 1, 'geladeira tem um lado');

// Primeiro produto ocupa a prateleira toda; o segundo, sem espaço livre, divide por igual.
let s = addSlot([], { productId: 'nescau' });
near(s[0].share, 1);
s = addSlot(s, { productId: 'toddy' });
near(s[0].share, 0.5); near(s[1].share, 0.5);
assert.equal(addSlot(s, { productId: 'toddy' }).length, 2, 'mesmo produto não duplica na prateleira');

// 80/20, frentes, divisória e limites: nunca passa de 100%, ninguém abaixo de 5%.
s = splitBy(s, [80, 20]);
near(s[0].share, 0.8);
s = splitByFacings([{ productId: 'a', share: 0.5, facings: 3 }, { productId: 'b', share: 0.5, facings: 1 }]);
near(s[0].share, 0.75);
s = moveDivider(s, 0, 0.5);
near(s[1].share, 0.05); near(usedShare(s), 1);
s = setShare(s, 1, 0.9);
near(usedShare(s), 1);
s = addSlot([{ productId: 'a', share: 0.6 }], { label: 'Promoção' });
near(s[1].share, 0.4);

// Estrutura aplicada aos outros módulos mantém os produtos de cada um.
const f = { ...g, sides };
const m0 = f.sides[0].modules[0];
const withProd = { ...f, sides: [{ ...f.sides[0], modules: f.sides[0].modules.map((m, i) => (i === 1
  ? { ...m, shelves: m.shelves.map((sh, j) => (j === 0 ? { ...sh, slots: [{ productId: 'x', share: 1 }] } : sh)) } : m)) }, f.sides[1]] };
const tall = { ...withProd, sides: [{ ...withProd.sides[0], modules: [{ ...setShelfCount(m0, 4), widthCm: 120 }, ...withProd.sides[0].modules.slice(1)] }, withProd.sides[1]] };
const applied = applyLayoutToSide(tall, 'A', m0.id).sides![0].modules;
assert.ok(applied.every((m) => m.widthCm === 120 && m.shelves.length === 4));
assert.equal(applied[1].shelves[0].slots[0].productId, 'x', 'produto continua no lugar');
assert.equal(setShelfCount(m0, 99).shelves.length, 12, 'no máximo 12 prateleiras');

// Copiar o lado A para o B leva produtos, com ids novos.
const copied = copySide(withProd, 'A', 'B').sides!;
assert.equal(copied[1].modules[1].shelves[0].slots[0].productId, 'x');
assert.notEqual(copied[1].modules[1].id, copied[0].modules[1].id);

assert.equal(
  describePlace({ fixtureId: 'g', fixtureLabel: 'Gôndola 3', side: 'A', module: 2, modules: 5, shelf: 3, shelves: 5, start: 0, share: 0.57 }, true),
  'Gôndola 3 · lado A · módulo 2 de 5 · 3ª prateleira de cima (de 5) · 57% da prateleira, à esquerda',
);

console.log('shelves: ok');
