import React, { useEffect, useState } from 'react';

const LogViewer: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');

  const load = async () => {
    const data = await (window as any).pdv2cloud.readLogs();
    setLines(data);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const filtered = lines.filter((line) => {
    if (filter === 'error') return line.includes('ERROR');
    if (filter === 'warn') return line.includes('WARN');
    return true;
  });

  const exportCsv = async () => {
    await (window as any).pdv2cloud.exportLogs();
  };

  return (
    <div className="card">
      <h3>Logs</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">Todos</option>
          <option value="error">Erros</option>
          <option value="warn">Avisos</option>
        </select>
        <button onClick={exportCsv}>Exportar CSV</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Ultimas entradas</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((line, idx) => (
            <tr key={idx}>
              <td>{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LogViewer;
