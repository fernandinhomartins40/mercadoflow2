import React from 'react';
import Card from '../common/Card';
import Chart from '../common/Chart';

const SalesChart: React.FC<{ data: { date: string; revenue: number }[] }> = ({ data }) => {
  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Curva de receita</h3>
      <p style={{ color: 'var(--muted)', marginTop: -6, marginBottom: 14 }}>
        Receita agregada por dia no periodo selecionado.
      </p>
      <Chart data={data} />
    </Card>
  );
};

export default SalesChart;
