import React from 'react';
import type { Fixture, StorePlan } from '../../../types/storeMap.types';
import { DEPT_BY_KEY, FIXTURES, fixtureName } from '../model';

/**
 * Móveis de supermercado vistos de cima, desenhados em metros: gôndola com
 * os módulos de 1 m e a divisória no meio, geladeira com as portas de vidro,
 * freezer com as tampas, banca com os caixotes, caixa com a esteira. A faixa
 * colorida na borda mostra os setores do móvel.
 */

export const INK = '#1f2a24';
export const WALL = '#2f3d36';

interface GlyphProps {
  f: Fixture;
  /** Cor de fundo imposta (calor de vendas). */
  fill?: string;
  /** Pixels por metro: detalhe fino some quando o desenho fica pequeno. */
  scale: number;
  dim?: boolean;
}

const r2 = (v: number) => Math.round(v * 1000) / 1000;

export const FixtureGlyph: React.FC<GlyphProps> = ({ f, fill, scale, dim }) => {
  const meta = FIXTURES[f.type];
  const vertical = f.h > f.w;
  const long = vertical ? f.h : f.w;
  const short = vertical ? f.w : f.h;
  const detail = scale >= 9 && !fill;
  const hair = Math.max(0.02, 0.8 / scale);
  const base = fill ?? meta.fill;
  // Ponto ao longo do eixo comprido: t em metros desde o começo, s em 0..1 na largura.
  const at = (t: number, s: number): [number, number] =>
    vertical ? [f.x + s * f.w, f.y + t] : [f.x + t, f.y + s * f.h];
  const cross = (t: number, s1 = 0.08, s2 = 0.92) => {
    const [x1, y1] = at(t, s1);
    const [x2, y2] = at(t, s2);
    return <line key={`c${t}`} x1={r2(x1)} y1={r2(y1)} x2={r2(x2)} y2={r2(y2)} stroke={meta.stroke} strokeWidth={hair} opacity={0.55} />;
  };
  const along = (s: number, t1 = 0.05, t2 = long - 0.05, dash?: string, op = 0.6) => {
    const [x1, y1] = at(t1, s);
    const [x2, y2] = at(t2, s);
    return <line key={`a${s}`} x1={r2(x1)} y1={r2(y1)} x2={r2(x2)} y2={r2(y2)} stroke={meta.stroke} strokeWidth={hair} strokeDasharray={dash} opacity={op} />;
  };

  const details: React.ReactNode[] = [];
  if (detail) {
    if (f.type === 'gondola') {
      details.push(along(0.5, 0.05, long - 0.05, undefined, 0.8));
      for (let t = 1; t < long - 0.2; t += 1) details.push(cross(t));
    } else if (f.type === 'geladeira' || f.type === 'balcao') {
      // Vidro na frente (lado de baixo/direita) e portas a cada 0,7 m.
      const [gx, gy] = at(0, 0.62);
      details.push(
        <rect key="glass" x={r2(vertical ? gx : f.x)} y={r2(vertical ? f.y : gy)}
          width={r2(vertical ? f.w * 0.34 : f.w)} height={r2(vertical ? f.h : f.h * 0.34)}
          fill="#ffffff" opacity={0.45} />,
      );
      const step = f.type === 'geladeira' ? 0.7 : 1.2;
      for (let t = step; t < long - 0.2; t += step) details.push(cross(t, 0.1, 0.96));
    } else if (f.type === 'freezer') {
      details.push(along(0.5));
      for (let t = 1; t < long - 0.3; t += 1) details.push(cross(t));
    } else if (f.type === 'banca') {
      const n = Math.max(1, Math.round(long / 0.55));
      const rows = Math.max(1, Math.round(short / 0.55));
      for (let i = 1; i < n; i++) details.push(cross((long / n) * i, 0.04, 0.96));
      for (let j = 1; j < rows; j++) details.push(along(j / rows, 0.04, long - 0.04, undefined, 0.5));
    } else if (f.type === 'caixa') {
      details.push(along(0.3, 0.1, long * 0.62, `${r2(0.12)} ${r2(0.08)}`, 0.8));
      const [bx, by] = at(long * 0.7, 0.18);
      details.push(<rect key="pos" x={r2(bx)} y={r2(by)} width={r2(vertical ? f.w * 0.64 : long * 0.24)} height={r2(vertical ? long * 0.24 : f.h * 0.64)} rx={0.05} fill={meta.stroke} opacity={0.35} />);
    } else if (f.type === 'ilha') {
      details.push(<rect key="in" x={r2(f.x + 0.15)} y={r2(f.y + 0.15)} width={r2(Math.max(0, f.w - 0.3))} height={r2(Math.max(0, f.h - 0.3))} rx={0.12}
        fill="none" stroke={meta.stroke} strokeWidth={hair} strokeDasharray={`${r2(0.15)} ${r2(0.1)}`} opacity={0.6} />);
    }
  }

  if (f.type === 'entrada') {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const a = Math.min(f.w, 1.2) * 0.35;
    return (
      <g opacity={dim ? 0.35 : 1}>
        <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#ffffff" />
        <line x1={f.x} y1={cy} x2={f.x + f.w} y2={cy} stroke="#15803d" strokeWidth={Math.max(0.06, 2 / scale)} strokeDasharray={`${r2(0.25)} ${r2(0.15)}`} />
        <path d={`M ${cx - a} ${cy - 0.1} L ${cx} ${cy - 0.1 - a} L ${cx + a} ${cy - 0.1}`} fill="none" stroke="#15803d"
          strokeWidth={Math.max(0.07, 2.2 / scale)} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  // Faixa de setores: divide o comprimento entre os setores do móvel.
  const depts = f.departments.slice(0, 4);
  const band = Math.min(0.16, short * 0.18);
  const strips = depts.map((d, i) => {
    const t1 = (long / depts.length) * i;
    const t2 = (long / depts.length) * (i + 1);
    const color = DEPT_BY_KEY[d]?.color ?? '#94a3b8';
    return vertical
      ? <rect key={d} x={f.x} y={f.y + t1} width={band} height={t2 - t1} fill={color} />
      : <rect key={d} x={f.x + t1} y={f.y + f.h - band} width={t2 - t1} height={band} fill={color} />;
  });

  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={Math.min(0.12, short * 0.2)} fill={base} stroke={meta.stroke} strokeWidth={Math.max(0.03, 1.2 / scale)} />
      {details}
      {!fill && strips.length > 0 && <g opacity={0.9}>{strips}</g>}
    </g>
  );
};

/** Rótulo do móvel, girado quando ele está em pé, com contorno para ler sobre qualquer cor. */
export const FixtureLabel: React.FC<{ f: Fixture; main: string; sub?: string; scale: number; ink?: string; halo?: string }> = ({
  f, main, sub, scale, ink = INK, halo = '#ffffff',
}) => {
  if (f.type === 'entrada') return null;
  const vertical = f.h > f.w * 1.3;
  const long = vertical ? f.h : f.w;
  const short = vertical ? f.w : f.h;
  // Tamanho de letra em metros, com piso em pixels para continuar legível.
  const fontSize = Math.max(10.5 / scale, Math.min(0.46, short * 0.42));
  if (fontSize * scale < 7 || long * scale < 26) return null;
  const cap = Math.max(3, Math.floor((long - 0.1) / (fontSize * 0.56)));
  // Nome que só caberia com 3 ou 4 letras não ajuda: some (o leitor de tela e o inspetor mostram).
  if (main.length > cap && cap < 6) return null;
  const cut = (s: string) => (s.length > cap ? `${s.slice(0, Math.max(1, cap - 1))}…` : s);
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const twoLines = !!sub && short * scale >= 30;
  const stroke = Math.max(0.03, 3 / scale);
  return (
    <g transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined} pointerEvents="none"
      style={{ paintOrder: 'stroke', fontVariantNumeric: 'tabular-nums' }}>
      <text x={cx} y={twoLines ? cy - fontSize * 0.12 : cy + fontSize * 0.36} textAnchor="middle" fontSize={fontSize}
        fontWeight={650} fill={ink} stroke={halo} strokeWidth={stroke} strokeLinejoin="round">{cut(main)}</text>
      {twoLines && (
        <text x={cx} y={cy + fontSize * 0.92} textAnchor="middle" fontSize={fontSize * 0.8} fill={ink} opacity={0.72}
          stroke={halo} strokeWidth={stroke} strokeLinejoin="round">{cut(sub!)}</text>
      )}
    </g>
  );
};

export const subLabel = (f: Fixture) => {
  const meta = FIXTURES[f.type];
  if (meta.noProducts) return '';
  const first = f.departments[0] ? DEPT_BY_KEY[f.departments[0]]?.label ?? '' : '';
  if (!first) return 'sem setor';
  return f.departments.length > 1 ? `${first} +${f.departments.length - 1}` : first;
};

/** Piso da loja: grade de 1 m e linha mais forte a cada 5 m. */
export const FloorDefs: React.FC<{ id: string; scale: number }> = ({ id, scale }) => (
  <defs>
    <pattern id={`${id}-1`} width="1" height="1" patternUnits="userSpaceOnUse">
      <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dfe5de" strokeWidth={Math.max(0.01, 0.7 / scale)} />
    </pattern>
    <pattern id={`${id}-5`} width="5" height="5" patternUnits="userSpaceOnUse">
      <rect width="5" height="5" fill={`url(#${id}-1)`} />
      <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#c9d2c8" strokeWidth={Math.max(0.02, 1 / scale)} />
    </pattern>
  </defs>
);

/** A planta inteira sem interação: miniaturas dos modelos. */
export const StaticPlan: React.FC<{ plan: StorePlan; className?: string }> = ({ plan, className }) => {
  const pad = 0.8;
  const scale = 12;
  return (
    <svg viewBox={`${-pad} ${-pad} ${plan.width + pad * 2} ${plan.height + pad * 2}`} className={className} aria-hidden="true">
      <FloorDefs id="thumb" scale={scale} />
      <rect x={0} y={0} width={plan.width} height={plan.height} fill="#f4f6f3" />
      <rect x={0} y={0} width={plan.width} height={plan.height} fill="url(#thumb-5)" />
      <rect x={0} y={0} width={plan.width} height={plan.height} fill="none" stroke={WALL} strokeWidth={0.22} />
      {plan.fixtures.map((f) => <FixtureGlyph key={f.id} f={f} scale={scale} />)}
      {plan.fixtures.map((f) => <FixtureLabel key={`l${f.id}`} f={f} main={fixtureName(f)} scale={scale} />)}
    </svg>
  );
};
