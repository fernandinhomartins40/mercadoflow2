import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

interface CampaignItem {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
}

const Campaigns: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getCampaigns(marketId);
      setItems(data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar campanhas');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [marketId]);

  const create = async () => {
    if (!marketId) return;
    if (!name.trim()) {
      setError('Informe o nome da campanha');
      return;
    }
    await marketService.createCampaign(marketId, {
      name: name.trim(),
      description: description.trim() || undefined,
      startDate: startDate.trim() || undefined,
      endDate: endDate.trim() || undefined,
    });
    setName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    await load();
  };

  return (
    <Layout>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Campanhas</h3>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Atualizar
          </Button>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="card soft" style={{ marginTop: 14, marginBottom: 14 }}>
          <strong>Nova campanha</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
            <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="input"
              placeholder="Início (ISO, opcional)"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              className="input"
              placeholder="Fim (ISO, opcional)"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <input
              className="input"
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ gridColumn: '1 / -1' }}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Button onClick={create}>Criar</Button>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: 10 }}>
            Datas aceitas: `2026-02-07`, `2026-02-07T10:00:00`, `2026-02-07T10:00:00-03:00`.
          </p>
        </div>

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Período</th>
                <th>Descrição</th>
                <th>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)' }}>
                    Nenhuma campanha cadastrada.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {(c.startDate ? new Date(c.startDate).toLocaleString('pt-BR') : '-') +
                        ' → ' +
                        (c.endDate ? new Date(c.endDate).toLocaleString('pt-BR') : '-')}
                    </td>
                    <td>{c.description || '-'}</td>
                    <td>{c.createdAt ? new Date(c.createdAt).toLocaleString('pt-BR') : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
};

export default Campaigns;

