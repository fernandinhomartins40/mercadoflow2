import React from 'react';
import Card from '../common/Card';
import Chart from '../common/Chart';

const formatMoney = (value?: number | null) => `R$ ${Number(value || 0).toFixed(2)}`;

const SalesChart: React.FC<{ data: { date: string; revenue: number }[] }> = ({ data }) => {
  const lastPoint = data[data.length - 1];

  return (
    <Card className="analytics-panel chart-panel reveal stagger-1">
      <div className="analytics-panel-head">
        <div>
          <span className="section-kicker">Pulso de receita</span>
          <h3>Curva diaria de faturamento</h3>
        </div>
        <div className="chart-callout">
          <span>Ultimo ponto</span>
          <strong>{lastPoint ? formatMoney(lastPoint.revenue) : 'R$ 0.00'}</strong>
        </div>
      </div>
      <p className="panel-copy">A linha mostra a cadencia real das notas processadas no periodo selecionado.</p>
      <Chart data={data} />
    </Card>
  );
};

export default SalesChart;
