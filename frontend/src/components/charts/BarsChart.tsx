import React from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C, DataTable, Legend, TipBox, axisProps, longDay, money, moneyTick, niceTicks, numberTick, shortDay } from './chartKit';

/**
 * Barras por período (hora, dia), com uma referência opcional em linha
 * (ex.: média das últimas 4 segundas). Barras de até 24 px, ponta
 * arredondada, valor só na barra que mais vendeu; o resto fica no tooltip
 * e na tabela.
 */
export type BarPoint = { label: string; value: number; reference?: number | null };

const BarsChart: React.FC<{
  data: BarPoint[];
  name: string;
  /** Nome da referência na legenda e no tooltip (só aparece se houver referência). */
  referenceName?: string;
  kind?: 'money' | 'number';
  unit?: string;
  height?: number;
  /** Escreve o valor em cima da maior barra. */
  labelBest?: boolean;
}> = ({ data, name, referenceName, kind = 'money', unit = '', height = 220, labelBest = true }) => {
  if (data.length === 0) return <p style={{ color: C.axis, fontSize: 14, margin: '12px 0' }}>Sem dados neste período.</p>;
  const fmt = kind === 'money' ? money : (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unit}`;
  const tick = kind === 'money' ? moneyTick : numberTick;
  const hasRef = data.some((d) => d.reference != null && Number(d.reference) > 0);
  const best = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  const rows = data.map((d) => ({ ...d, best: labelBest && d === best && d.value > 0 ? d.value : null }));
  const top = Math.max(...data.map((d) => Math.max(d.value, Number(d.reference ?? 0))), 0);
  const ticks = niceTicks(0, top || 1);
  const label = `${name}: maior valor ${fmt(best.value)} em ${shortDay(best.label)}${hasRef && referenceName ? `; linha azul é ${referenceName}` : ''}.`;

  return (
    <figure style={{ margin: 0 }}>
      <div role="img" aria-label={label} style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} tickFormatter={shortDay} minTickGap={12} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={72} domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={tick} />
            <Tooltip
              cursor={{ fill: 'rgba(21,122,61,.06)' }}
              content={(p: any) => p.active && p.payload?.length ? (
                <TipBox title={longDay(p.label)} rows={[
                  { name, value: fmt(Number(p.payload[0].payload.value)), color: C.main },
                  ...(hasRef && referenceName && p.payload[0].payload.reference != null ? [{ name: referenceName, value: fmt(Number(p.payload[0].payload.reference)), color: C.compare }] : []),
                ]} />
              ) : null}
            />
            <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.label} fill={C.main} />)}
              {labelBest && <LabelList dataKey="best" position="top" formatter={(v: any) => (v == null ? '' : tick(Number(v)))} style={{ fill: C.ink, fontSize: 12, fontWeight: 700 }} />}
            </Bar>
            {hasRef && (
              <Line type="linear" dataKey="reference" stroke={C.compare} strokeWidth={2} dot={false} isAnimationActive={false}
                activeDot={{ r: 5, fill: C.compare, stroke: C.surface, strokeWidth: 2 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasRef && referenceName && <Legend items={[{ name, color: C.main }, { name: referenceName, color: C.compare }]} />}
      <DataTable head={hasRef && referenceName ? ['Quando', name, referenceName] : ['Quando', name]}
        rows={data.map((d) => [longDay(d.label), fmt(d.value), ...(hasRef && referenceName ? [d.reference == null ? '—' : fmt(Number(d.reference))] : [])])} />
    </figure>
  );
};

export default BarsChart;
