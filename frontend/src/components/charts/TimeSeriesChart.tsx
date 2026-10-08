import React, { useMemo } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C, DataTable, Legend, TipBox, axisProps, longDay, money, moneyTick, niceTicks, numberTick, parseDay, shortDay } from './chartKit';

/**
 * Série diária (faturamento, preço, unidades). Linha de 2 px com área clara,
 * média de 7 dias por cima quando pedida, eixo com valores, datas "11/jul",
 * tooltip com o dia da semana e tabela com os mesmos números.
 * Preço que não mudou não vira gráfico: vira uma frase.
 */
export type SeriesPoint = { date: string; value: number | null };

const DAY = 86_400_000;
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TimeSeriesChart: React.FC<{
  data: SeriesPoint[];
  /** Nome da série no tooltip e na legenda ("Faturamento", "Preço médio"). */
  name: string;
  kind?: 'money' | 'number';
  /** Dia sem dado: 'zero' (venda: não vendeu) ou 'gap' (preço: sem registro, a linha passa por cima). */
  missing?: 'zero' | 'gap';
  /** Média móvel de 7 dias por cima da série diária. */
  average?: boolean;
  /** Eixo vertical a partir de zero (magnitude) ou na faixa dos dados (preço). */
  zeroBased?: boolean;
  height?: number;
  /** Frase quando a série não variou (ex.: "O preço não mudou"). Sem ela, desenha mesmo assim. */
  flatLabel?: string;
}> = ({ data, name, kind = 'money', missing = 'zero', average = false, zeroBased = true, height = 240, flatLabel }) => {
  const fmt = kind === 'money' ? money : (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  // Preço (fora de zero): todas as marcas com centavos, para não misturar "R$ 6" com "R$ 6,50".
  const tick = kind === 'money'
    ? (zeroBased ? moneyTick : (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`)
    : numberTick;

  // Um ponto por dia entre o primeiro e o último; dia sem dado vira zero ou buraco.
  const rows = useMemo(() => {
    const clean = data.filter((d) => d.date).map((d) => ({ date: d.date.slice(0, 10), value: d.value == null ? null : Number(d.value) }));
    if (clean.length === 0) return [];
    const byDay = new Map(clean.map((d) => [d.date, d.value]));
    const first = parseDay(clean[0].date).getTime();
    const last = parseDay(clean[clean.length - 1].date).getTime();
    const out: { date: string; value: number | null; avg?: number | null }[] = [];
    for (let t = first; t <= last + 1; t += DAY) {
      const iso = isoOf(new Date(t));
      const v = byDay.has(iso) ? byDay.get(iso)! : missing === 'zero' ? 0 : null;
      out.push({ date: iso, value: v });
    }
    if (average) {
      out.forEach((r, i) => {
        const win = out.slice(Math.max(0, i - 6), i + 1).map((x) => x.value).filter((x): x is number => x != null);
        r.avg = i >= 6 && win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
      });
    }
    return out;
  }, [data, missing, average]);

  const values = rows.map((r) => r.value).filter((v): v is number => v != null);
  if (values.length === 0) return <p style={{ color: C.axis, fontSize: 14, margin: '12px 0' }}>Sem dados neste período.</p>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lastValue = [...rows].reverse().find((r) => r.value != null)?.value ?? null;

  if (flatLabel && max > 0 && (max - min) / max < 0.005) {
    return (
      <p style={{ margin: '14px 0 4px', fontSize: 15, color: C.ink }}>
        {flatLabel}: <b>{fmt(max)}</b> de {shortDay(rows[0].date)} a {shortDay(rows[rows.length - 1].date)}.
      </p>
    );
  }

  // Eixo com marcas redondas: magnitude parte de zero; preço fica na faixa dos dados.
  const pad = (max - min) * 0.2 || max * 0.05;
  const ticks = zeroBased ? niceTicks(0, max) : niceTicks(Math.max(0, min - pad), max + pad);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const label = `${name} por dia, de ${shortDay(rows[0].date)} a ${shortDay(rows[rows.length - 1].date)}. Mínimo ${fmt(min)}, máximo ${fmt(max)}${lastValue != null ? `, último ${fmt(lastValue)}` : ''}.`;

  return (
    <figure style={{ margin: 0 }}>
      <div role="img" aria-label={label} style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={shortDay} minTickGap={28} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={72} domain={domain} ticks={ticks} tickFormatter={tick} allowDecimals />
            <Tooltip
              cursor={average ? { fill: 'rgba(21,122,61,.06)' } : { stroke: C.axis, strokeWidth: 1 }}
              content={(p: any) => p.active && p.payload?.length ? (
                <TipBox title={longDay(p.label)} rows={[
                  { name, value: p.payload[0].payload.value == null ? 'sem registro' : fmt(p.payload[0].payload.value), color: C.main },
                  ...(average && p.payload[0].payload.avg != null ? [{ name: 'Média de 7 dias', value: fmt(p.payload[0].payload.avg), color: C.compare }] : []),
                ]} />
              ) : null}
            />
            {/* Venda do dia em barras finas (cada dia é um valor, não uma curva); preço em degraus (muda de um dia para o outro). */}
            {average ? (
              <Bar dataKey="value" fill={C.main} fillOpacity={0.55} maxBarSize={10} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            ) : (
              <Area type={missing === 'gap' ? 'stepAfter' : 'linear'} dataKey="value" stroke={C.main} strokeWidth={2} fill={C.main} fillOpacity={0.1}
                connectNulls={missing === 'gap'} dot={false} isAnimationActive={false} baseValue={domain[0]}
                activeDot={{ r: 5, fill: C.main, stroke: C.surface, strokeWidth: 2 }} />
            )}
            {average && (
              <Line type="linear" dataKey="avg" stroke={C.compare} strokeWidth={2} dot={false} isAnimationActive={false}
                activeDot={{ r: 5, fill: C.compare, stroke: C.surface, strokeWidth: 2 }} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {average && <Legend items={[{ name: `${name} do dia`, color: C.main }, { name: 'Média de 7 dias', color: C.compare }]} />}
      <DataTable head={['Dia', name]} rows={[...rows].reverse().map((r) => [longDay(r.date), r.value == null ? '—' : fmt(r.value)])} />
    </figure>
  );
};

export default TimeSeriesChart;
