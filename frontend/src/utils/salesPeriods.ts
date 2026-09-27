/**
 * Números do Painel com período explícito (UX-01).
 *
 * O cockpit devolve somas da janela de 90 dias; rotuladas como "Faturamento",
 * pareciam ser do dia. A série diária (`salesTrend`) já vem na mesma resposta,
 * então "hoje" e "últimos 7 dias" saem dela sem outra chamada.
 */

export interface DailyRevenue {
  date: string; // yyyy-MM-dd
  revenue: number | string | null;
}

export interface PeriodComparison {
  value: number;
  previous: number;
  /** Variação percentual; null quando não há base de comparação. */
  change: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data local (não UTC): às 22h no Brasil o UTC já está no dia seguinte. */
export const localIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (d: Date, days: number) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
};

const compare = (value: number, previous: number): PeriodComparison => ({
  value,
  previous,
  change: previous > 0 ? ((value - previous) / previous) * 100 : null,
});

const indexByDate = (points: DailyRevenue[]) => {
  const map = new Map<string, number>();
  for (const p of points) map.set(p.date, (map.get(p.date) || 0) + (Number(p.revenue) || 0));
  return map;
};

const sumRange = (byDate: Map<string, number>, end: Date, days: number) => {
  let total = 0;
  for (let i = 0; i < days; i++) total += byDate.get(localIsoDate(addDays(end, -i))) || 0;
  return total;
};

/** Hoje × mesmo dia da semana anterior (compara terça com terça). */
export const todayVsLastWeek = (points: DailyRevenue[], now = new Date()): PeriodComparison => {
  const byDate = indexByDate(points);
  return compare(
    byDate.get(localIsoDate(now)) || 0,
    byDate.get(localIsoDate(addDays(now, -7))) || 0,
  );
};

/** Últimos 7 dias (incluindo hoje) × os 7 dias antes deles. */
export const last7VsPrevious7 = (points: DailyRevenue[], now = new Date()): PeriodComparison => {
  const byDate = indexByDate(points);
  return compare(sumRange(byDate, now, 7), sumRange(byDate, addDays(now, -7), 7));
};
