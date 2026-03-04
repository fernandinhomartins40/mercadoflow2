import React from 'react';

interface ChartProps {
  data: { date: string; revenue: number }[];
}

const Chart: React.FC<ChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Sem dados para desenhar a curva.</div>;
  }

  const width = 640;
  const height = 240;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 36;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingX * 2;
  const safeMax = Math.max(...data.map((d) => Number(d.revenue || 0)), 1);

  const points = data.map((point, index) => {
    const x = data.length === 1
      ? width / 2
      : paddingX + (index / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((Number(point.revenue || 0) / safeMax) * chartHeight);
    return { x, y, label: point.date, revenue: Number(point.revenue || 0) };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const fillPath = [`M ${points[0].x} ${height - paddingBottom}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${points[points.length - 1].x} ${height - paddingBottom}`, 'Z'].join(' ');
  const guideLevels = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart-shell">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {guideLevels.map((level) => {
          const y = paddingTop + chartHeight - chartHeight * level;
          return <line key={level} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="chart-guide" />;
        })}

        <path d={fillPath} fill="rgba(36, 99, 235, 0.12)" />
        <polyline fill="none" stroke="#2463eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={polyline} />

        {points.map((point, index) => (
          <g key={`${point.x}-${point.y}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" className="chart-node-shadow" />
            <circle cx={point.x} cy={point.y} r="3.5" className="chart-node" />
          </g>
        ))}
      </svg>

      <div className="chart-axis">
        <span>{data[0]?.date || '--'}</span>
        <span>{data[Math.floor(data.length / 2)]?.date || '--'}</span>
        <span>{data[data.length - 1]?.date || '--'}</span>
      </div>
    </div>
  );
};

export default Chart;
