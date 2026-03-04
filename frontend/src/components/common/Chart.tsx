import React from 'react';

interface ChartProps {
  data: { date: string; revenue: number }[];
}

const Chart: React.FC<ChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--muted)' }}>Sem dados</div>;
  }

  const width = 320;
  const height = 120;
  const left = 12;
  const right = width - 12;
  const bottom = height - 16;
  const top = 12;
  const safeMax = Math.max(...data.map((d) => Number(d.revenue || 0)), 1);

  const points = data.map((point, index) => {
    const x = data.length === 1
      ? width / 2
      : left + (index / (data.length - 1)) * (right - left);
    const y = bottom - ((Number(point.revenue || 0) / safeMax) * (bottom - top));
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--border)" strokeWidth="1" />
      <polyline
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="3"
        points={points.join(' ')}
      />
      {points.map((point, index) => {
        const [cx, cy] = point.split(',').map(Number);
        return <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="3.5" fill="var(--accent-primary)" />;
      })}
    </svg>
  );
};

export default Chart;
