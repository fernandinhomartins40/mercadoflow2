import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart2, ChevronRight, Clock, FileImage, ImagePlus, Layers, Sparkles, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { buildOffersUrl } from '../lib/offersApp';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { useOffersService } from '../hooks/useOffersService';
import { OfferGenerationJob, OfferOverview, OfferTemplate } from '../types/offers.types';
import { ProductPairInsight, ProductPerformance, PromotionImpact } from '../types/analytics.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  READY: { text: 'Pronto', cls: 'positive' },
  PARTIAL: { text: 'Parcial', cls: 'soft' },
  PROCESSING: { text: 'Processando', cls: 'soft' },
  QUEUED: { text: 'Na fila', cls: 'soft' },
  FAILED: { text: 'Falhou', cls: 'negative' },
  DRAFT: { text: 'Rascunho', cls: 'soft' },
};

// ─── Quick action button ──────────────────────────────────────────────────────
const QuickAction: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  primary?: boolean;
  onClick: () => void;
}> = ({ icon, title, desc, primary, onClick }) => (
  <button type="button" onClick={onClick} className={`dash-action ${primary ? 'dash-action-primary' : ''}`}>
    <span className="dash-action-icon">{icon}</span>
    <span className="dash-action-body">
      <strong className="dash-action-title">{title}</strong>
      <span className="dash-action-desc">{desc}</span>
    </span>
    <ChevronRight size={18} className="dash-action-arrow" />
  </button>
);

// ─── Linha de job recente ─────────────────────────────────────────────────────
const RecentJobRow: React.FC<{ job: OfferGenerationJob }> = ({ job }) => {
  const s = STATUS_LABEL[String(job.status || '').toUpperCase()] || { text: job.status || '—', cls: 'soft' };
  return (
    <div className="dash-recent-row">
      <div className="dash-recent-thumbs">
        {job.items.slice(0, 3).map((item) => (
          <div key={item.id} className="dash-recent-thumb">
            <OfferProductImage src={item.productImageUrl} alt={item.productName} className="dash-recent-img" />
          </div>
        ))}
      </div>
      <div className="dash-recent-info">
        <strong className="dash-recent-name">{job.name}</strong>
        <span className="dash-recent-meta">{job.productCount} produtos · {formatDate(job.createdAt)}</span>
      </div>
      <span className={`sales-pill ${s.cls}`}>{s.text}</span>
    </div>
  );
};

// ─── Sugestão de produto (linha) ──────────────────────────────────────────────
const SuggestionRow: React.FC<{
  product: ProductPerformance;
  label: string;
  metric: string;
  onUse: () => void;
}> = ({ product, label, metric, onUse }) => (
  <div className="dash-suggest-row">
    <div className="dash-suggest-thumb">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="dash-suggest-img" />
    </div>
    <div className="dash-suggest-info">
      <strong className="dash-suggest-name">{product.name}</strong>
      <span className="dash-suggest-metric">{label} · {metric}</span>
    </div>
    <button type="button" className="dash-suggest-btn" onClick={onUse}>
      Usar
      <ArrowRight size={13} />
    </button>
  </div>
);

const PromotionRow: React.FC<{
  product: PromotionImpact;
  onUse: () => void;
}> = ({ product, onUse }) => (
  <div className="dash-suggest-row">
    <div className="dash-suggest-thumb">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="dash-suggest-img" />
    </div>
    <div className="dash-suggest-info">
      <strong className="dash-suggest-name">{product.name}</strong>
      <span className="dash-suggest-metric">
        Promoção · lift {Number(product.quantityLiftPercent || 0).toFixed(0)}% · {formatMoney(product.promoAveragePrice)}
      </span>
    </div>
    <button type="button" className="dash-suggest-btn" onClick={onUse}>
      Usar
      <ArrowRight size={13} />
    </button>
  </div>
);

const PairRow: React.FC<{
  pair: ProductPairInsight;
  onUse: () => void;
}> = ({ pair, onUse }) => (
  <div className="dash-suggest-row">
    <div className="dash-suggest-thumb dash-suggest-thumb-pair">
      <OfferProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || ''} className="dash-suggest-img" />
      <OfferProductImage src={pair.consequentImageUrl} alt={pair.consequentName || ''} className="dash-suggest-img dash-suggest-img-b" />
    </div>
    <div className="dash-suggest-info">
      <strong className="dash-suggest-name">{pair.antecedentName} + {pair.consequentName}</strong>
      <span className="dash-suggest-metric">Compra casada · {pair.pairCount || 0} cestas</span>
    </div>
    <button type="button" className="dash-suggest-btn" onClick={onUse}>
      Usar
      <ArrowRight size={13} />
    </button>
  </div>
);

// ─── Bloco de sugestões ───────────────────────────────────────────────────────
const SuggestBlock: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="dash-suggest-block">
    <div className="dash-suggest-head">
      <span className="dash-suggest-icon">{icon}</span>
      <h3 className="dash-suggest-title">{title}</h3>
    </div>
    <div className="dash-suggest-list">{children}</div>
  </div>
);

// ─── Screen principal ─────────────────────────────────────────────────────────
const OffersDashboard: React.FC = () => {
  const { marketId } = useAuth();
  const offersService = useOffersService();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId) { setError('Mercado não encontrado.'); setLoading(false); return; }
      try {
        setOverview(await offersService.getOverview(marketId));
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível carregar o módulo de ofertas.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [marketId]);

  const leadTemplate = useMemo<OfferTemplate | null>(() => overview?.templates?.[0] || null, [overview]);

  const openDesigner = (templateId?: string | null, productId?: string | null) => {
    const params = new URLSearchParams();
    if (templateId) params.set('templateId', templateId);
    if (productId) params.set('productId', productId);
    navigate(buildOffersUrl('/ofertas', 'admin', params.toString()));
  };

  const hasSuggestions = overview && (
    overview.replenishmentSuggestions.length > 0 ||
    overview.seasonalSuggestions.length > 0 ||
    overview.promotionSuggestions.length > 0 ||
    overview.pairSuggestions.length > 0
  );

  return (
    <Layout>
      <div className="page offers-page">

        {/* ── Título da página ───────────────────────────────────────────── */}
        <div className="dash-page-head">
          <div>
            <h1 className="dash-page-title">Encartes de ofertas</h1>
            <p className="dash-page-sub">Crie encartes, acompanhe seus pedidos e veja sugestões do catálogo.</p>
          </div>
        </div>

        {/* ── Loading / error ────────────────────────────────────────────── */}
        {loading && <div className="ofd-feedback">Carregando…</div>}
        {error && <div className="ofd-feedback ofd-feedback-error">{error}</div>}

        {!loading && !error && (
          <div className="dash-layout">

            {/* ── Coluna principal ──────────────────────────────────────── */}
            <div className="dash-main">

              {/* Ações rápidas */}
              <section className="dash-section">
                <h2 className="dash-section-title">O que você quer fazer?</h2>
                <div className="dash-actions-list">
                  <QuickAction
                    primary
                    icon={<ImagePlus size={22} />}
                    title="Criar novo encarte"
                    desc="Escolher um modelo e montar seu encarte de ofertas"
                    onClick={() => openDesigner(leadTemplate?.id)}
                  />
                  <QuickAction
                    icon={<Layers size={22} />}
                    title="Ver modelos disponíveis"
                    desc="Escolher entre os modelos de encarte prontos"
                    onClick={() => navigate(buildOffersUrl('/ofertas', 'admin'))}
                  />
                  <QuickAction
                    icon={<FileImage size={22} />}
                    title="Ver arquivos gerados"
                    desc="Baixar e revisar seus encartes prontos"
                    onClick={() => navigate(buildOffersUrl('/ofertas/jobs', 'admin'))}
                  />
                </div>
              </section>

              {/* Atividade recente */}
              {overview && overview.recentJobs.length > 0 && (
                <section className="dash-section">
                  <div className="dash-section-head">
                    <h2 className="dash-section-title">Atividade recente</h2>
                    <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas/jobs', 'admin')}>
                      Ver todos
                    </ButtonLink>
                  </div>
                  <div className="dash-recent-list">
                    {overview.recentJobs.map((job) => <RecentJobRow key={job.id} job={job} />)}
                  </div>
                </section>
              )}

              {/* Estado vazio */}
              {overview && overview.recentJobs.length === 0 && (
                <section className="dash-section">
                  <div className="ofd-empty">
                    Nenhum encarte ainda. Clique em "Criar novo encarte" para começar.
                  </div>
                </section>
              )}
            </div>

            {/* ── Coluna lateral: sugestões ─────────────────────────────── */}
            {hasSuggestions && (
              <aside className="dash-sidebar">
                <div className="dash-sidebar-head">
                  <Sparkles size={16} />
                  <h2 className="dash-sidebar-title">Sugestões do catálogo</h2>
                </div>
                <p className="dash-sidebar-desc">
                  Produtos com alto potencial para virar arte com base nas suas vendas.
                </p>

                {overview!.replenishmentSuggestions.length > 0 && (
                  <SuggestBlock icon={<TrendingUp size={15} />} title="Reposição urgente">
                    {overview!.replenishmentSuggestions.slice(0, 4).map((p) => (
                      <SuggestionRow
                        key={p.productId}
                        product={p}
                        label="Giro"
                        metric={`${Number(p.salesVelocity || 0).toFixed(1)}/dia`}
                        onUse={() => openDesigner(leadTemplate?.id, p.productId)}
                      />
                    ))}
                  </SuggestBlock>
                )}

                {overview!.seasonalSuggestions.length > 0 && (
                  <SuggestBlock icon={<Sparkles size={15} />} title="Sazonalidade próxima">
                    {overview!.seasonalSuggestions.slice(0, 3).map((p) => (
                      <SuggestionRow
                        key={p.productId}
                        product={p}
                        label="Receita"
                        metric={formatMoney(p.revenue)}
                        onUse={() => openDesigner(leadTemplate?.id, p.productId)}
                      />
                    ))}
                  </SuggestBlock>
                )}

                {overview!.promotionSuggestions.length > 0 && (
                  <SuggestBlock icon={<BarChart2 size={15} />} title="Reagem bem a desconto">
                    {overview!.promotionSuggestions.slice(0, 3).map((p) => (
                      <PromotionRow
                        key={p.productId}
                        product={p}
                        onUse={() => openDesigner(leadTemplate?.id, p.productId)}
                      />
                    ))}
                  </SuggestBlock>
                )}

                {overview!.pairSuggestions.length > 0 && (
                  <SuggestBlock icon={<Clock size={15} />} title="Compra casada">
                    {overview!.pairSuggestions.slice(0, 3).map((pair) => (
                      <PairRow
                        key={`${pair.antecedentId}-${pair.consequentId}`}
                        pair={pair}
                        onUse={() => openDesigner(leadTemplate?.id, pair.antecedentId || pair.consequentId || undefined)}
                      />
                    ))}
                  </SuggestBlock>
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OffersDashboard;
