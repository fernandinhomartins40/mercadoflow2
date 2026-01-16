import React from 'react';

interface ChartProps {
  data: { date: string; revenue: number }[];
}

const Chart: React.FC<ChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--muted)' }}>Sem dados</div>;
  }

  const max = Math.max(...data.map((d) => d.revenue));
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 280 + 10;
    const y = 90 - (d.revenue / max) * 80 + 10;
    return `${x},${y}`;
  });

  return (
    <svg width="320" height="120" viewBox="0 0 320 120">
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        points={points.join(' ')}
      />
    </svg>
  );
};

export default Chart;
