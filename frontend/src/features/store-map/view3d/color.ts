/** Cores para as faces das caixas 3D: escurecer e misturar hex ou rgb(). */

const parse = (c: string): [number, number, number] => {
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = c.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
};

const hex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** f < 1 escurece (0,8 = 20% mais escuro). */
export const shade = (c: string, f: number) => hex(parse(c).map((v) => v * f));

/** t = 0 devolve a, t = 1 devolve b. */
export const mix = (a: string, b: string, t: number) => {
  const x = parse(a);
  const y = parse(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
};
