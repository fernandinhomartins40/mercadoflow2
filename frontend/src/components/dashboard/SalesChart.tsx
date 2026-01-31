import React from 'react';
import Card from '../common/Card';
import Chart from '../common/Chart';

const SalesChart: React.FC<{ data: { date: string; revenue: number }[] }> = ({ data }) => {
  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Tendência de vendas</h3>
      <Chart data={data} />
    </Card>
  );
};

export default SalesChart;
