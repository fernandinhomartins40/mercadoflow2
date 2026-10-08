import React from 'react';

/**
 * Peças comuns dos gráficos (Recharts). Cores e formas seguem uma regra só:
 * série principal no verde do painel, série de comparação no azul (par
 * validado para daltonismo e contraste), linha de 2 px, área a ~10%, barras
 * de até 24 px com ponta arredondada, grade fina e discreta. Texto nunca usa
 * a cor da série.
 */
export const C = {
  main: '#157A3D',
  compare: '#5B86C5',
  grid: '#E1E8E2',
  axis: '#5F7067',
  ink: '#0B1F16',
  surface: '#FFFFFF',
};

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "2026-07-11" → Date ao meio-dia (sem pular de dia pelo fuso). */
export const parseDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const isIsoDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/** "2026-07-11" → "11/jul"; outro rótulo passa como veio. */
export const shortDay = (v: unknown) => {
  if (!isIsoDay(v)) return String(v ?? '');
  const d = parseDay(v);
  return `${d.getDate()}/${MONTHS[d.getMonth()]}`;
};
/** "2026-07-11" → "sábado, 11/jul". */
export const longDay = (v: unknown) => (isIsoDay(v) ? `${WEEKDAYS[parseDay(v).getDay()]}, ${shortDay(v)}` : String(v ?? ''));

export const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const NB = '\u00a0'; // espaço que não quebra: "R$ 520" nunca vira duas linhas
/** Eixo: R$ 950 · R$ 1,2 mil · R$ 3,4 mi. */
export const moneyTick = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$${NB}${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${NB}mi`;
  if (a >= 1e3) return `R$${NB}${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${NB}mil`;
  return `R$${NB}${v.toLocaleString('pt-BR', { minimumFractionDigits: a > 0 && a < 10 && !Number.isInteger(v) ? 2 : 0, maximumFractionDigits: a < 10 ? 2 : 0 })}`;
};
export const numberTick = (v: number) => (Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${NB}mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

/** Marcas redondas do eixo (1, 2, 2,5, 5 × 10ⁿ) cobrindo [min, max]. */
export const niceTicks = (min: number, max: number, count = 4): number[] => {
  if (!(max > min)) { max = min + (Math.abs(min) || 1); }
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) out.push(Math.round(v / step) * step);
  return out.map((v) => Number(v.toFixed(6)));
};

export const axisProps = {
  tick: { fill: C.axis, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export type TipRow = { name: string; value: string; color: string };

/** Caixa do tooltip: data no topo, uma linha por série com a marca colorida ao lado (o texto fica em tinta). */
export const TipBox: React.FC<{ title: string; rows: TipRow[] }> = ({ title, rows }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.grid}`, borderRadius: 12, padding: '8px 12px', boxShadow: '0 10px 30px -18px rgba(11,31,22,.35)', fontSize: 13, color: C.ink, minWidth: 140 }}>
    <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
    {rows.map((r) => (
      <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.axis }}>
          <i aria-hidden="true" style={{ width: 10, height: 3, borderRadius: 2, background: r.color, display: 'inline-block' }} />{r.name}
        </span>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</b>
      </div>
    ))}
  </div>
);

/** Legenda de duas ou mais séries (uma série dispensa: o título já diz o que é). */
export const Legend: React.FC<{ items: { name: string; color: string; dashed?: boolean }[] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: C.axis, marginTop: 6 }}>
    {items.map((i) => (
      <span key={i.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <i aria-hidden="true" style={{ width: 14, height: 3, borderRadius: 2, background: i.color, display: 'inline-block' }} />{i.name}
      </span>
    ))}
  </div>
);

/** Os mesmos números em tabela, para quem não lê gráfico (leitor de tela, conferência). */
export const DataTable: React.FC<{ head: string[]; rows: (string | number)[][] }> = ({ head, rows }) => (
  <details style={{ marginTop: 8 }}>
    <summary style={{ cursor: 'pointer', fontSize: 12.5, color: C.axis }}>Ver em tabela</summary>
    <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: C.axis, borderBottom: `1px solid ${C.grid}` }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '3px 6px', borderBottom: `1px solid ${C.grid}`, textAlign: j === 0 ? 'left' : 'right' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>
);

/** Lugar reservado enquanto o gráfico carrega: mesma altura, a página não pula. */
export const ChartSkeleton: React.FC<{ height: number }> = ({ height }) => (
  <div aria-hidden="true" className="animate-pulse" style={{ height, borderRadius: 12, background: '#F6F9F6' }} />
);
