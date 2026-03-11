import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
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
  const latestItem = items[0];

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
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Estrutura operacional</span>
              <h1 className="dashboard-command-title">Organize os PDVs como inventario operacional, nao como lista solta.</h1>
              <p className="dashboard-command-text">
                A pagina separa cadastro, inventario e contexto de uso para facilitar manutencao dos pontos de venda e reduzir erro de identificacao no dia a dia.
              </p>
              <div className="hero-inline-actions">
                <Button variant="secondary" onClick={load} disabled={loading}>Atualizar lista</Button>
              </div>
              <div className="hero-chip-row">
                <span className="hero-chip">{items.length} PDVs cadastrados</span>
                <span className="hero-chip">{withSerialCount} com serial informado</span>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Ultimo cadastro</span>
                <strong>{latestItem?.name || 'Nenhum PDV cadastrado'}</strong>
                <p>{latestItem?.createdAt ? `Criado em ${new Date(latestItem.createdAt).toLocaleString('pt-BR')}` : 'Assim que um PDV for criado, ele passa a aparecer aqui com mais destaque.'}</p>
              </article>

              <div className="dashboard-command-mosaic">
                <article className="dashboard-mini-tile">
                  <span>Serial</span>
                  <strong>{latestItem?.serialNumber || '--'}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Sem serial</span>
                  <strong>{Math.max(items.length - withSerialCount, 0)}</strong>
                </article>
                <article className="dashboard-mini-tile">
                  <span>Status</span>
                  <strong>{loading ? 'Atualizando' : 'Pronta'}</strong>
                </article>
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Boa pratica</span>
              <h3>Use nomes reconheciveis para a operacao.</h3>
              <p>Gerentes, compradores e equipe de loja precisam bater o olho e identificar o PDV sem duvida.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Risco comum</span>
              <h3>Duplicar PDV por variacao de nome.</h3>
              <p>Padronize o cadastro para nao espalhar historico e configuracao entre nomes parecidos.</p>
            </article>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="PDVs" value={items.length} icon="PD" caption="pontos de venda cadastrados" />
          <MetricsCard title="Com serial" value={withSerialCount} icon="SR" caption="equipamentos identificados" />
          <MetricsCard title="Sem serial" value={Math.max(items.length - withSerialCount, 0)} icon="NS" caption="pedem complemento" />
          <MetricsCard title="Status da pagina" value={loading ? 'Atualizando' : 'Pronta'} icon="OK" caption="situacao atual do cadastro" />
        </div>

        {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        <div className="dashboard-page-grid">
          <section className="analytics-panel reveal dashboard-table-panel">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Inventario</span>
                <h3>Lista de PDVs cadastrados</h3>
              </div>
            </div>

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
          </section>

          <div className="dashboard-side-stack">
            <section className="analytics-panel reveal dashboard-form-panel">
              <div className="analytics-panel-head compact">
                <div>
                  <span className="section-kicker">Cadastro rapido</span>
                  <h3>Novo PDV</h3>
                </div>
              </div>
              <div className="dashboard-form-stack">
                <input className="input" placeholder="Nome do PDV" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="input" placeholder="Serial (opcional)" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
                <Button onClick={create}>Criar PDV</Button>
              </div>
            </section>

            <section className="analytics-panel reveal dashboard-note-card">
              <span className="section-kicker">Boas praticas</span>
              <h3>Padrao de cadastro</h3>
              <div className="dashboard-quick-list">
                <div className="dashboard-quick-item">
                  <strong>Use nomes reconheciveis</strong>
                  <span>Facilita a leitura para gerentes, compradores e equipe de operacao.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Preencha serial quando existir</strong>
                  <span>Ajuda na identificacao do equipamento e reduz erro operacional.</span>
                </div>
                <div className="dashboard-quick-item">
                  <strong>Mantenha a lista enxuta</strong>
                  <span>Evite duplicar PDVs com nomes parecidos ou abreviacoes diferentes.</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PDVs;
