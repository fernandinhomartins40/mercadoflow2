import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHeader from '../components/layout/PageHeader';
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

  const withSerialCount = useMemo(() => items.filter((item) => Boolean(item.serialNumber)).length, [items]);

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
      <div className="page analytics-page">
        <PageHeader
          title="Pontos de venda"
          subtitle="Cadastre e gerencie os PDVs do mercado."
          actions={<Button variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricsCard title="PDVs" value={items.length} icon="PD" />
          <MetricsCard title="Com serial" value={withSerialCount} icon="SR" />
          <MetricsCard title="Sem serial" value={Math.max(items.length - withSerialCount, 0)} icon="NS" />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <div className="min-w-0">
            {loading ? (
              <div className="panel-empty">Carregando PDVs...</div>
            ) : (
              <div className="table-shell responsive-data-table-wrap">
                <table className="table responsive-data-table">
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
                          <td data-label="Nome">{pdv.name}</td>
                          <td data-label="Serial">{pdv.serialNumber || '-'}</td>
                          <td data-label="Criado em">{pdv.createdAt ? new Date(pdv.createdAt).toLocaleString('pt-BR') : '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-3">
            <div className="border-b border-slate-100 pb-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">Cadastrar</p>
              <h3 className="text-sm font-semibold text-slate-900">Novo PDV</h3>
            </div>
            <div className="grid gap-3">
              <input className="input" placeholder="Nome do PDV" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" placeholder="Serial (opcional)" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
              <Button onClick={create}>Criar PDV</Button>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
};

export default PDVs;
