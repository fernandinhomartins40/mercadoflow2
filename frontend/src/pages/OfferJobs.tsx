import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import { OfferGenerationJob } from '../types/offers.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const OfferJobs: React.FC = () => {
  const { marketId } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OfferGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setLoading(false);
        setError('Mercado não encontrado.');
        return;
      }
      try {
        const data = await offersService.getJobs(marketId);
        setJobs(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível carregar os lotes.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [marketId]);

  return (
    <Layout>
      <div className="page analytics-page offers-page">
        <section className="dashboard-command-grid reveal">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Lotes de geração</span>
              <h1 className="dashboard-command-title">Acompanhe o que já foi preparado para renderização e exportação.</h1>
              <p className="dashboard-command-text">A fila já registra template, produtos e binding. O próximo passo é plugar o worker de export server-side.</p>
            </div>
            <div className="hero-inline-actions">
              <button type="button" className="button" onClick={() => navigate('/app/ofertas/designer')}>Novo lote</button>
              <button type="button" className="button secondary" onClick={() => navigate('/app/ofertas/modelos')}>Modelos</button>
            </div>
          </article>
        </section>

        {loading ? <div className="sales-empty-card">Carregando lotes...</div> : null}
        {error ? <div className="sales-empty-card">{error}</div> : null}

        {!loading && !error ? (
          <div className="offer-jobs-page-grid">
            {jobs.length === 0 ? <div className="sales-empty-card">Nenhum lote foi criado ainda.</div> : null}
            {jobs.map((job) => (
              <article key={job.id} className="offer-job-detail-card">
                <div className="offer-job-detail-head">
                  <div>
                    <span className="section-kicker">{job.templateName}</span>
                    <h2>{job.name}</h2>
                  </div>
                  <span className={`status-pill ${String(job.status || '').toLowerCase()}`}>{job.status}</span>
                </div>
                <div className="offer-job-detail-meta">
                  <span>Saída {job.outputType}</span>
                  <span>Modo {job.generationMode === 'CATALOG' ? 'Encarte' : 'Individual'}</span>
                  <span>{job.productCount} produtos</span>
                  <span>{job.pageCount} páginas/peças</span>
                </div>
                <div className="offer-job-detail-items">
                  {job.items.map((item) => (
                    <article key={item.id} className="offer-job-detail-item">
                      <div className="offer-job-detail-item-frame">
                        <OfferProductImage src={item.productImageUrl} alt={item.productName} className="offer-job-detail-item-image" />
                      </div>
                      <div className="offer-job-detail-item-body">
                        <h3>{item.productName}</h3>
                        <p>{item.productUnit || 'Unidade'}</p>
                        <strong>{formatMoney(item.currentPrice)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default OfferJobs;

