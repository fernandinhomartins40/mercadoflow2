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
  calloutLabel = 'Ultimo ponto',
  formatter = formatMoney,
  className = '',
}) => {
  const lastPoint = data[data.length - 1];
  const mergedClassName = ['analytics-panel', 'chart-panel', 'reveal', 'stagger-1', className].filter(Boolean).join(' ');

  return (
    <Card className={mergedClassName}>
      <div className="analytics-panel-head">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h3>{title}</h3>
        </div>
        <div className="chart-callout">
          <span>{calloutLabel}</span>
          <strong>{lastPoint ? formatter(lastPoint.revenue) : formatter(0)}</strong>
        </div>
      </div>
      <p className="panel-copy">{panelCopy}</p>
      <Chart data={data} />
    </Card>
  );
};

export default SalesChart;
