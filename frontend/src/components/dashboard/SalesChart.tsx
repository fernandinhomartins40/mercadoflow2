import React from 'react';
import Card from '../common/Card';
import Chart from '../common/Chart';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;

interface SalesChartProps {
  data: { date: string; revenue: number }[];
  kicker?: string;
  title?: string;
  panelCopy?: string;
  calloutLabel?: string;
  formatter?: (value?: number | null) => string;
  className?: string;
}

const SalesChart: React.FC<SalesChartProps> = ({
  data,
  kicker = 'Pulso de receita',
  title = 'Curva diaria de faturamento',
  panelCopy = 'A linha mostra a cadencia real das notas processadas no periodo selecionado.',
  calloutLabel = 'Último ponto',
  formatter = formatMoney,
  className = '',
}) => {
  const lastPoint = data[data.length - 1];
  const mergedClassName = ['reveal', 'stagger-1', className].filter(Boolean).join(' ');

  return (
    <Card className={mergedClassName}>
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{kicker}</span>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">{calloutLabel}</span>
          <strong className="mt-0.5 block text-lg font-semibold text-slate-900">{lastPoint ? formatter(lastPoint.revenue) : formatter(0)}</strong>
        </div>
      </div>
      <p className="px-5 pt-2 text-sm leading-relaxed text-slate-500">{panelCopy}</p>
      <Chart data={data} />
    </Card>
  );
};

export default SalesChart;
