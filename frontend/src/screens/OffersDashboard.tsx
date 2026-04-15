import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart2, Clock, Layers, Lightbulb, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { buildOffersUrl } from '../lib/offersApp';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { useAuth } from '../context/AuthContext';
import { useOffersService } from '../hooks/useOffersService';
import { OfferGenerationJob, OfferOverview, OfferTemplate } from '../types/offers.types';
import { ProductPairInsight, ProductPerformance, PromotionImpact } from '../types/analytics.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
};

// ─── Job card compacto ───────────────────────────────────────────────────────
const OfferJobCard: React.FC<{ job: OfferGenerationJob }> = ({ job }) => {
  const statusMap: Record<string, { label: string; cls: string }> = {
    READY: { label: 'Pronto', cls: 'positive' },
    PARTIAL: { label: 'Parcial', cls: 'soft' },
    PROCESSING: { label: 'Processando', cls: 'soft' },
    QUEUED: { label: 'Na fila', cls: 'soft' },
    FAILED: { label: 'Falhou', cls: 'negative' },
    DRAFT: { label: 'Rascunho', cls: 'soft' },
  };
  const s = statusMap[String(job.status || '').toUpperCase()] || { label: job.status || '—', cls: 'soft' };

  return (
    <article className="ofd-job-card">
      <div className="ofd-job-card-top">
        <div className="min-w-0">
          <span className="section-kicker">{job.outputType} · {job.generationMode === 'CATALOG' ? 'Encarte' : 'Individual'}</span>
          <h3 className="ofd-job-card-title">{job.name}</h3>
        </div>
        <span className={`sales-pill ${s.cls}`}>{s.label}</span>
      </div>
      <div className="ofd-job-card-meta">
        <span>{job.productCount} produtos</span>
        <span>{job.pageCount} peças</span>
        <span>{job.createdAt ? new Date(job.createdAt).toLocaleDateString('pt-BR') : 'Agora'}</span>
      </div>
      <div className="ofd-job-card-thumbs">
        {job.items.slice(0, 5).map((item) => (
          <div key={item.id} className="ofd-job-thumb">
            <OfferProductImage src={item.productImageUrl} alt={item.productName} className="ofd-job-thumb-img" />
          </div>
        ))}
        {job.items.length > 5 && (
          <div className="ofd-job-thumb ofd-job-thumb-more">+{job.items.length - 5}</div>
        )}
      </div>
    </article>
  );
};

// ─── Card de produto sugerido ────────────────────────────────────────────────
const SuggestionProductCard: React.FC<{
  product: ProductPerformance;
  label: string;
  labelCls?: string;
  onUse: () => void;
}> = ({ product, label, labelCls = 'soft', onUse }) => (
  <article className="ofd-suggestion-card">
    <div className="ofd-suggestion-media">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="ofd-suggestion-img" />
    </div>
    <div className="ofd-suggestion-body">
      <span className={`sales-pill ${labelCls}`}>{label}</span>
      <h3 className="ofd-suggestion-name">{product.name}</h3>
      <p className="ofd-suggestion-category">{compactCategory(product.category)}</p>
      <div className="ofd-suggestion-metrics">
        <div>
          <span>Receita</span>
          <strong>{formatMoney(product.revenue)}</strong>
        </div>
        <div>
          <span>Giro</span>
          <strong>{Number(product.salesVelocity || 0).toFixed(1)}/dia</strong>
        </div>
      </div>
      <button type="button" className="ofd-use-btn" onClick={onUse}>
        Usar na arte
        <ArrowRight size={14} strokeWidth={2.2} />
      </button>
    </div>
  </article>
);

const PromotionSuggestionCard: React.FC<{
  product: PromotionImpact;
  onUse: () => void;
}> = ({ product, onUse }) => (
  <article className="ofd-suggestion-card">
    <div className="ofd-suggestion-media">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="ofd-suggestion-img" />
    </div>
    <div className="ofd-suggestion-body">
      <span className="sales-pill positive">Promoção</span>
      <h3 className="ofd-suggestion-name">{product.name}</h3>
      <p className="ofd-suggestion-category">{compactCategory(product.category)}</p>
      <div className="ofd-suggestion-metrics">
        <div>
          <span>Lift volume</span>
          <strong>{Number(product.quantityLiftPercent || 0).toFixed(0)}%</strong>
        </div>
        <div>
          <span>Preço promo</span>
          <strong>{formatMoney(product.promoAveragePrice)}</strong>
        </div>
      </div>
      <button type="button" className="ofd-use-btn" onClick={onUse}>
        Usar na arte
        <ArrowRight size={14} strokeWidth={2.2} />
      </button>
    </div>
  </article>
);

// ─── Card de par de produtos ─────────────────────────────────────────────────
const PairSuggestionCard: React.FC<{
  pair: ProductPairInsight;
  onUse: () => void;
}> = ({ pair, onUse }) => (
  <article className="ofd-pair-card">
    <div className="ofd-pair-images">
      <div className="ofd-pair-img-wrap">
        <OfferProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="ofd-pair-img" />
      </div>
      <div className="ofd-pair-plus">+</div>
      <div className="ofd-pair-img-wrap">
        <OfferProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="ofd-pair-img" />
      </div>
    </div>
    <div className="ofd-pair-body">
      <span className="sales-pill soft">Compra casada</span>
      <h3 className="ofd-suggestion-name">{pair.antecedentName || 'Produto principal'}</h3>
      <p className="ofd-suggestion-category">{pair.consequentName || 'Produto complementar'}</p>
      <div className="ofd-pair-stats">
        <span>{pair.pairCount || 0} cestas</span>
        <span>Lift {Number(pair.lift || 0).toFixed(2)}</span>
      </div>
      <button type="button" className="ofd-use-btn ofd-use-btn-secondary" onClick={onUse}>
        Montar peça combinada
        <ArrowRight size={14} strokeWidth={2.2} />
      </button>
    </div>
  </article>
);

// ─── Stat chip inline ────────────────────────────────────────────────────────
const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <div className="ofd-stat-chip">
    <span className="ofd-stat-chip-icon">{icon}</span>
    <span className="ofd-stat-chip-label">{label}</span>
    <strong className="ofd-stat-chip-value">{value}</strong>
  </div>
);

// ─── Template card ───────────────────────────────────────────────────────────
const TemplateCard: React.FC<{ template: OfferTemplate; onUse: () => void }> = ({ template, onUse }) => (
  <article className="ofd-template-card">
    <div className="ofd-template-preview">
      <OfferCanvasPreview template={template} className="ofd-template-canvas" />
    </div>
    <div className="ofd-template-body">
      <span className="section-kicker">{template.channel}</span>
      <h3 className="ofd-template-name">{template.name}</h3>
      <p className="ofd-template-desc">{template.description || 'Template pronto para personalização.'}</p>
      <div className="ofd-template-footer">
        <span className="ofd-template-dim">{template.canvasWidth}×{template.canvasHeight}</span>
        <Button type="button" onClick={onUse}>Usar no designer</Button>
      </div>
    </div>
  </article>
);

// ─── Seção com cabeçalho ─────────────────────────────────────────────────────
const PageSection: React.FC<{
  kicker: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ kicker, title, description, icon, children, action }) => (
  <section className="ofd-section reveal">
    <div className="ofd-section-head">
      <div className="ofd-section-label">
        {icon && <span className="ofd-section-icon">{icon}</span>}
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2 className="ofd-section-title">{title}</h2>
          {description && <p className="ofd-section-desc">{description}</p>}
        </div>
      </div>
      {action && <div className="ofd-section-action">{action}</div>}
    </div>
    {children}
  </section>
);

// ─── Screen principal ────────────────────────────────────────────────────────
const OffersDashboard: React.FC = () => {
  const { marketId } = useAuth();
  const offersService = useOffersService();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OfferOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!marketId) {
        setError('Mercado não encontrado.');
        setLoading(false);
        return;
      }
      try {
        const data = await offersService.getOverview(marketId);
        setOverview(data);
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

  return (
    <Layout>
      <div className="page offers-page">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="ofd-hero reveal">
          <div className="ofd-hero-copy">
            <span className="ofd-hero-kicker">Designer de ofertas</span>
            <h1 className="ofd-hero-title">Crie peças de oferta a partir do catálogo e das vendas reais.</h1>
            <p className="ofd-hero-desc">
              Modelos em JSON, binding automático com nome, preço e imagem, preview em tempo real e geração de lotes integrada ao motor de render.
            </p>
            <div className="ofd-hero-actions">
              <Button type="button" onClick={() => openDesigner(leadTemplate?.id)}>
                Abrir designer
              </Button>
              <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas', 'admin')}>Gerenciar modelos</ButtonLink>
              <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas/jobs', 'admin')}>Ver lotes</ButtonLink>
            </div>
          </div>
          {leadTemplate && (
            <div className="ofd-hero-preview">
              <OfferCanvasPreview template={leadTemplate} className="ofd-hero-canvas" />
            </div>
          )}
        </header>

        {/* ── Loading / error ───────────────────────────────────────────── */}
        {loading && <div className="ofd-feedback">Carregando módulo de ofertas…</div>}
        {error && <div className="ofd-feedback ofd-feedback-error">{error}</div>}

        {overview && (
          <>
            {/* ── KPI strip ────────────────────────────────────────────── */}
            <div className="ofd-kpi-strip reveal">
              <StatChip icon={<Layers size={16} />} label="Modelos" value={overview.templatesCount} />
              <StatChip icon={<Clock size={16} />} label="Lotes" value={overview.jobsCount} />
              <StatChip icon={<BarChart2 size={16} />} label="Na fila" value={overview.queuedJobs} />
              <StatChip
                icon={<Lightbulb size={16} />}
                label="Sugestões"
                value={(overview.replenishmentSuggestions?.length || 0) + (overview.promotionSuggestions?.length || 0)}
              />
            </div>

            {/* ── Templates ────────────────────────────────────────────── */}
            {overview.templates.length > 0 && (
              <PageSection
                kicker="Modelos disponíveis"
                title="Templates prontos para uso"
                description="Selecione um modelo e abra o designer para montar sua campanha visual."
                icon={<Layers size={16} />}
                action={
                  <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas', 'admin')}>
                    Ver todos
                    <ArrowRight size={14} strokeWidth={2.2} />
                  </ButtonLink>
                }
              >
                <div className="ofd-template-rail">
                  {overview.templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onUse={() => openDesigner(template.id)}
                    />
                  ))}
                </div>
              </PageSection>
            )}

            {/* ── Fila de geração ──────────────────────────────────────── */}
            <PageSection
              kicker="Fila de geração"
              title="Lotes preparados"
              description="Acompanhe o status dos lotes gerados pelo motor server-side."
              icon={<Clock size={16} />}
              action={
                <ButtonLink variant="secondary" to={buildOffersUrl('/ofertas/jobs', 'admin')}>
                  Ver todos
                  <ArrowRight size={14} strokeWidth={2.2} />
                </ButtonLink>
              }
            >
              {overview.recentJobs.length === 0 ? (
                <div className="ofd-empty">Nenhum lote criado ainda. Crie uma campanha para começar.</div>
              ) : (
                <div className="ofd-job-grid">
                  {overview.recentJobs.map((job) => <OfferJobCard key={job.id} job={job} />)}
                </div>
              )}
            </PageSection>

            {/* ── Sugestões de reposição ────────────────────────────────── */}
            {overview.replenishmentSuggestions.length > 0 && (
              <PageSection
                kicker="Recomendados pelas vendas"
                title="Itens com urgência para virar arte"
                description="Produtos com giro forte, sazonalidade próxima e alta performance promocional."
                icon={<TrendingUp size={16} />}
              >
                <div className="ofd-suggestion-rail">
                  {overview.replenishmentSuggestions.map((product) => (
                    <SuggestionProductCard
                      key={product.productId}
                      product={product}
                      label="Reposição"
                      labelCls="soft"
                      onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                    />
                  ))}
                </div>
              </PageSection>
            )}

            {/* ── Sazonalidade ─────────────────────────────────────────── */}
            {overview.seasonalSuggestions.length > 0 && (
              <PageSection
                kicker="Calendário comercial"
                title="Sazonalidade mais próxima"
                description="Prepare campanhas baseadas no período sazonal mais próximo no calendário."
                icon={<Sparkles size={16} />}
              >
                <div className="ofd-suggestion-rail">
                  {overview.seasonalSuggestions.map((product) => (
                    <SuggestionProductCard
                      key={product.productId}
                      product={product}
                      label="Sazonalidade"
                      labelCls="soft"
                      onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                    />
                  ))}
                </div>
              </PageSection>
            )}

            {/* ── Performance promocional ───────────────────────────────── */}
            {overview.promotionSuggestions.length > 0 && (
              <PageSection
                kicker="Performance promocional"
                title="Maior resposta a desconto"
                description="Produtos que comprovadamente reagem bem a ação comercial — candidatos naturais para cartaz e tabloide."
                icon={<BarChart2 size={16} />}
              >
                <div className="ofd-suggestion-rail">
                  {overview.promotionSuggestions.map((product) => (
                    <PromotionSuggestionCard
                      key={product.productId}
                      product={product}
                      onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                    />
                  ))}
                </div>
              </PageSection>
            )}

            {/* ── Pares ────────────────────────────────────────────────── */}
            {overview.pairSuggestions.length > 0 && (
              <PageSection
                kicker="Venda combinada"
                title="Pares que merecem peça conjunta"
                description="Use pares fortes para encarte, ponta e comunicação cruzada."
                icon={<Users size={16} />}
              >
                <div className="ofd-pair-rail">
                  {overview.pairSuggestions.map((pair) => (
                    <PairSuggestionCard
                      key={`${pair.antecedentId}-${pair.consequentId}`}
                      pair={pair}
                      onUse={() => openDesigner(leadTemplate?.id, pair.antecedentId || pair.consequentId || undefined)}
                    />
                  ))}
                </div>
              </PageSection>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default OffersDashboard;
