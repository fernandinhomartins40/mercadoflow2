import type { MotionPreset } from '../../types/art.types';

/**
 * Animações prontas dos encartes. Cada preset é uma função pura do tempo:
 * dado um elemento da arte (fundo, camada, selo, logo, cartão, rodapé) e o
 * instante t, devolve o deslocamento dele. Por ser pura, a prévia e o vídeo
 * exportado desenham exatamente os mesmos quadros.
 *
 * Os presets em loop usam ciclos inteiros dentro da duração: o último quadro
 * emenda no primeiro (TV da loja tocando sem pulo).
 */

export type MotionKind = 'base' | 'layer' | 'seal' | 'logo' | 'card' | 'footer';

export interface MotionTarget {
  kind: MotionKind;
  /** Posição na ordem do seu grupo (camadas de trás para frente, cartões na grade). */
  index: number;
  count: number;
  /** Centro do elemento em fração da arte. */
  cx: number;
  cy: number;
  hero?: boolean;
  still?: boolean;
}

/** dx/dy em fração do menor lado da arte; rotate em graus. */
export interface Pose { dx: number; dy: number; scale: number; rotate: number; alpha: number }

export const IDENTITY: Pose = { dx: 0, dy: 0, scale: 1, rotate: 0, alpha: 1 };

export const MOTION_PRESETS: Record<MotionPreset, { label: string; hint: string; loop: boolean }> = {
  respirar: { label: 'Respirar', hint: 'Enfeites flutuam devagar e o selo pulsa. Bom para TV.', loop: true },
  parallax: { label: 'Profundidade', hint: 'A câmera desliza; o que está na frente se move mais.', loop: true },
  entrada: { label: 'Entrada', hint: 'Enfeites entram pelas bordas, produtos aparecem um a um e o selo quica.', loop: false },
  selo: { label: 'Selo em destaque', hint: 'O selo bate como um coração; o resto quase parado.', loop: true },
  zoom: { label: 'Zoom lento', hint: 'Aproximação suave, como em documentário.', loop: false },
  festa: { label: 'Festa', hint: 'Enfeites balançam e os produtos fazem uma onda.', loop: true },
};

export const MOTION_KEYS = Object.keys(MOTION_PRESETS) as MotionPreset[];
export const DEFAULT_DURATION = 8;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeOutBack = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/** Onda com `cycles` voltas inteiras na duração: emenda no fim. */
const wave = (t: number, d: number, cycles: number, phase = 0) => Math.sin(2 * Math.PI * (cycles * (t / d) + phase));
const progress = (t: number, start: number, length: number) => clamp01((t - start) / length);
/** Profundidade 0 (fundo) a 1 (frente). */
const depthOf = (m: MotionTarget) => (m.count > 1 ? m.index / (m.count - 1) : 1);

const pose = (p: Partial<Pose>): Pose => ({ ...IDENTITY, ...p });
const combine = (a: Pose, b: Pose): Pose => ({
  dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale, rotate: a.rotate + b.rotate, alpha: a.alpha * b.alpha,
});

const heroPulse = (m: MotionTarget, t: number, d: number) =>
  (m.kind === 'card' && m.hero ? pose({ scale: 1 + 0.02 * (0.5 + 0.5 * wave(t, d, Math.max(1, Math.round(d / 2)))) }) : IDENTITY);

const breathe = (m: MotionTarget, t: number, d: number, strength = 1): Pose => {
  const cycles = Math.max(1, Math.round(d / 4));
  if (m.kind === 'layer') {
    return pose({
      dy: strength * 0.008 * (0.5 + depthOf(m)) * wave(t, d, cycles, m.index * 0.17),
      rotate: strength * 0.6 * wave(t, d, cycles, m.index * 0.31),
    });
  }
  if (m.kind === 'seal') {
    return pose({ scale: 1 + strength * 0.035 * (0.5 + 0.5 * wave(t, d, cycles * 2)), rotate: strength * 1.2 * wave(t, d, cycles, 0.25) });
  }
  return heroPulse(m, t, d);
};

const PRESETS: Record<MotionPreset, (m: MotionTarget, t: number, d: number) => Pose> = {
  respirar: breathe,

  parallax: (m, t, d) => {
    const x = wave(t, d, 1);
    const y = wave(t, d, 1, 0.25);
    if (m.kind === 'base') return pose({ scale: 1.05, dx: 0.01 * x, dy: 0.006 * y });
    if (m.kind === 'layer') {
      const k = 0.6 + 2.4 * depthOf(m);
      return pose({ scale: 1.02, dx: 0.01 * k * x, dy: 0.006 * k * y });
    }
    if (m.kind === 'seal') return combine(pose({ dx: 0.03 * x, dy: 0.018 * y }), breathe(m, t, d, 0.6));
    return heroPulse(m, t, d);
  },

  entrada: (m, t, d) => {
    // A entrada cabe na primeira metade, mesmo em vídeo curto; depois respira.
    const k = Math.min(1, d / 8);
    const idle = breathe(m, t, d, 0.6);
    switch (m.kind) {
      case 'base': {
        // Só aproxima, nunca esmaece nem encolhe: o fundo não pode abrir buraco.
        const p = easeOutCubic(progress(t, 0, 0.8 * k));
        return pose({ scale: 1.08 - 0.08 * p });
      }
      case 'layer': {
        const p = easeOutCubic(progress(t, (0.15 + m.index * 0.08) * k, 0.7 * k));
        let vx = m.cx - 0.5;
        let vy = m.cy - 0.5;
        const len = Math.hypot(vx, vy);
        if (len < 0.08) { vx = 0; vy = 1; } else { vx /= len; vy /= len; }
        return combine(pose({ dx: vx * 0.6 * (1 - p), dy: vy * 0.6 * (1 - p), alpha: p }), idle);
      }
      case 'logo': {
        const p = easeOutCubic(progress(t, 0.5 * k, 0.5 * k));
        return pose({ dy: -0.05 * (1 - p), alpha: p });
      }
      case 'seal': {
        const p = progress(t, 0.7 * k, 0.6 * k);
        return combine(pose({ scale: Math.max(0, easeOutBack(p)), rotate: -15 * (1 - p), alpha: clamp01(p * 3) }), idle);
      }
      case 'card': {
        const step = Math.min(0.06, (d * 0.35) / Math.max(1, m.count));
        const p = progress(t, 0.9 * k + m.index * step, 0.45 * k);
        return combine(pose({ scale: 0.6 + 0.4 * easeOutBack(p), alpha: clamp01(p * 2) }), idle);
      }
      default: {
        const p = easeOutCubic(progress(t, 1.2 * k, 0.5 * k));
        return pose({ dy: 0.04 * (1 - p), alpha: p });
      }
    }
  },

  selo: (m, t, d) => {
    if (m.kind === 'seal') {
      const beats = Math.max(2, Math.round(d / 1.2));
      const beat = Math.max(0, wave(t, d, beats)) ** 4;
      return pose({ scale: 1 + 0.1 * beat, rotate: 3 * wave(t, d, Math.max(1, Math.round(beats / 2))) });
    }
    return breathe(m, t, d, 0.5);
  },

  zoom: (m, t, d) => {
    const p = easeInOut(clamp01(t / d));
    if (m.kind === 'base') return pose({ scale: 1 + 0.08 * p });
    if (m.kind === 'layer') {
      const k = 1 + depthOf(m);
      return pose({ scale: 1 + 0.08 * p * k, dx: (m.cx - 0.5) * 0.06 * p * k, dy: (m.cy - 0.5) * 0.06 * p * k });
    }
    if (m.kind === 'seal') return pose({ scale: 1 + 0.06 * p });
    return heroPulse(m, t, d);
  },

  festa: (m, t, d) => {
    const cycles = Math.max(2, Math.round(d / 2));
    if (m.kind === 'layer') {
      return pose({ rotate: 5 * wave(t, d, cycles, m.index * 0.21), dy: 0.012 * wave(t, d, cycles, m.index * 0.21 + 0.25) });
    }
    if (m.kind === 'seal') return pose({ rotate: 8 * wave(t, d, cycles), scale: 1 + 0.05 * Math.abs(wave(t, d, cycles)) });
    if (m.kind === 'card') return pose({ dy: -0.012 * Math.max(0, wave(t, d, cycles, -m.index * 0.08)) });
    if (m.kind === 'logo') return pose({ rotate: 2 * wave(t, d, cycles) });
    return IDENTITY;
  },
};

/** Deslocamento do elemento no instante t (segundos) de uma animação de `duration` segundos. */
export const poseAt = (preset: MotionPreset, target: MotionTarget, t: number, duration: number): Pose => {
  const fn = PRESETS[preset];
  if (!fn || target.still) return IDENTITY;
  const d = Math.max(1, duration);
  return fn(target, Math.max(0, Math.min(d, t)), d);
};
