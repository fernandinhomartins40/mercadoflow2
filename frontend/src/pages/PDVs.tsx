import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';

interface PDVItem {
  id: string;
  name: string;
  serialNumber?: string | null;
  createdAt?: string | null;
}

const PDVs: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<PDVItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getPdvs(marketId);
      setItems(data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar PDVs');
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
      setError('Informe o nome do PDV');
      return;
    }
    await marketService.createPdv(marketId, { name: name.trim(), serialNumber: serialNumber.trim() || undefined });
    setName('');
    setSerialNumber('');
    await load();
  };

  return (
    <Layout>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>PDVs</h3>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Atualizar
          </Button>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="card soft" style={{ marginTop: 14, marginBottom: 14 }}>
          <strong>Novo PDV</strong>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <input className="input" placeholder="Nome do PDV" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="input"
              placeholder="Serial (opcional)"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
            <Button onClick={create}>Criar</Button>
          </div>
        </div>

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Serial</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)' }}>
                    Nenhum PDV cadastrado.
                  </td>
                </tr>
              ) : (
                items.map((pdv) => (
                  <tr key={pdv.id}>
                    <td>{pdv.name}</td>
                    <td>{pdv.serialNumber || '-'}</td>
                    <td>{pdv.createdAt ? new Date(pdv.createdAt).toLocaleString('pt-BR') : '-'}</td>
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

export default PDVs;

