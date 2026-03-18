import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import OfferProductImage from '../components/offers/OfferProductImage';
import { offersService } from '../services/offers.service';
import { useAuth } from '../context/AuthContext';
import { OfferGenerationJob, OfferOverview, OfferTemplate } from '../types/offers.types';
import { ProductPairInsight, ProductPerformance, PromotionImpact } from '../types/analytics.types';

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => {
  if (!value) return 'Sem categoria';
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
};

const OfferJobCard: React.FC<{ job: OfferGenerationJob }> = ({ job }) => (
  <article className="offer-job-card">
    <div className="offer-job-card-head">
      <div>
        <span className="section-kicker">{job.outputType} · {job.generationMode === 'CATALOG' ? 'Encarte' : 'Peças individuais'}</span>
        <h3>{job.name}</h3>
      </div>
      <span className={`status-pill ${String(job.status || '').toLowerCase()}`}>{job.status}</span>
    </div>
    <div className="offer-job-card-meta">
      <span>{job.productCount} produtos</span>
      <span>{job.pageCount} páginas/peças</span>
      <span>{job.createdAt ? new Date(job.createdAt).toLocaleString('pt-BR') : 'Agora'}</span>
    </div>
    <div className="offer-job-card-items">
      {job.items.slice(0, 4).map((item) => (
        <div key={item.id} className="offer-job-item-pill">
          <OfferProductImage src={item.productImageUrl} alt={item.productName} className="offer-job-item-thumb" />
          <span>{item.productName}</span>
        </div>
      ))}
    </div>
  </article>
);

const SuggestionProductCard: React.FC<{
  product: ProductPerformance;
  label: string;
  onUse: () => void;
}> = ({ product, label, onUse }) => (
  <article className="offer-product-suggestion-card">
    <div className="offer-product-suggestion-frame">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-product-suggestion-image" />
    </div>
    <div className="offer-product-suggestion-body">
      <span className="sales-pill soft">{label}</span>
      <h3>{product.name}</h3>
      <p>{compactCategory(product.category)}</p>
      <div className="offer-product-suggestion-metrics">
        <div>
          <span>Receita</span>
          <strong>{formatMoney(product.revenue)}</strong>
        </div>
        <div>
          <span>Giro</span>
          <strong>{Number(product.salesVelocity || 0).toFixed(1)}/dia</strong>
        </div>
      </div>
      <Button type="button" onClick={onUse}>Usar na arte</Button>
    </div>
  </article>
);

const PromotionSuggestionCard: React.FC<{
  product: PromotionImpact;
  onUse: () => void;
}> = ({ product, onUse }) => (
  <article className="offer-product-suggestion-card">
    <div className="offer-product-suggestion-frame">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-product-suggestion-image" />
    </div>
    <div className="offer-product-suggestion-body">
      <span className="sales-pill positive">Promoção</span>
      <h3>{product.name}</h3>
      <p>{compactCategory(product.category)}</p>
      <div className="offer-product-suggestion-metrics">
        <div>
          <span>Lift volume</span>
          <strong>{Number(product.quantityLiftPercent || 0).toFixed(0)}%</strong>
        </div>
        <div>
          <span>Preço promo</span>
          <strong>{formatMoney(product.promoAveragePrice)}</strong>
        </div>
      </div>
      <Button type="button" onClick={onUse}>Usar na arte</Button>
    </div>
  </article>
);

const PairSuggestionCard: React.FC<{
  pair: ProductPairInsight;
  onUse: () => void;
}> = ({ pair, onUse }) => (
  <article className="offer-pair-suggestion-card">
    <div className="offer-pair-suggestion-media">
      <div className="offer-pair-suggestion-frame">
        <OfferProductImage src={pair.antecedentImageUrl} alt={pair.antecedentName || 'Produto'} className="offer-pair-suggestion-image" />
      </div>
      <div className="offer-pair-suggestion-plus">+</div>
      <div className="offer-pair-suggestion-frame">
        <OfferProductImage src={pair.consequentImageUrl} alt={pair.consequentName || 'Produto'} className="offer-pair-suggestion-image" />
      </div>
    </div>
    <div className="offer-pair-suggestion-body">
      <span className="sales-pill soft">Compra casada</span>
      <h3>{pair.antecedentName || 'Produto principal'}</h3>
      <p>{pair.consequentName || 'Produto complementar'}</p>
      <div className="offer-pair-suggestion-stats">
        <span>{pair.pairCount || 0} cestas</span>
        <span>Lift {Number(pair.lift || 0).toFixed(2)}</span>
      </div>
      <Button type="button" variant="secondary" onClick={onUse}>Montar peça combinada</Button>
    </div>
  </article>
);

const OffersDashboard: React.FC = () => {
  const { marketId } = useAuth();
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
    navigate(`/app/ofertas/designer${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <Layout>
      <div className="page analytics-page offers-page">
        <PageHero
          badge="Designer de ofertas"
          title="Crie peças de oferta a partir do catálogo e das vendas reais do mercado."
          description="Modelos em JSON, binding automático com nome, preço, unidade e imagem, preview em tempo real e geração de lotes já ligada ao motor de render."
          actions={
            <>
              <Button type="button" onClick={() => openDesigner(leadTemplate?.id)}>Abrir designer</Button>
              <ButtonLink variant="secondary" to="/app/ofertas/modelos">Gerenciar modelos</ButtonLink>
              <ButtonLink variant="secondary" to="/app/ofertas/jobs">Ver lotes</ButtonLink>
            </>
          }
          feature={<OfferCanvasPreview template={leadTemplate} className="offer-dashboard-canvas" />}
          featureClassName="offers-command-showcase"
        />

        {loading ? <div className="sales-empty-card">Carregando módulo de ofertas...</div> : null}
        {error ? <div className="sales-empty-card">{error}</div> : null}

        {overview ? (
          <>
            <div className="metrics-grid analytics-metrics-grid sales-metric-strip">
              <MetricsCard title="Modelos" value={String(overview.templatesCount)} icon="MD" />
              <MetricsCard title="Lotes" value={String(overview.jobsCount)} icon="LT" />
              <MetricsCard title="Na fila" value={String(overview.queuedJobs)} icon="Q" />
              <MetricsCard title="Sugestões" value={String((overview.replenishmentSuggestions?.length || 0) + (overview.promotionSuggestions?.length || 0))} icon="SG" />
            </div>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Modelos</span>
                  <h2>Base nativa para cartaz e encarte</h2>
                </div>
                <p>Os modelos ficam no banco, em JSON, e já abastecem o estúdio visual usado para montagem, preview e publicação.</p>
              </div>
              <div className="offer-template-rail">
                {overview.templates.map((template) => (
                  <article key={template.id} className="offer-template-card">
                    <OfferCanvasPreview template={template} className="offer-template-card-preview" />
                    <div className="offer-template-card-body">
                      <span className="section-kicker">{template.channel}</span>
                      <h3>{template.name}</h3>
                      <p>{template.description || 'Modelo pronto para personalização.'}</p>
                      <div className="offer-template-card-meta">
                        <span>{template.canvasWidth}x{template.canvasHeight}</span>
                        <span>{template.systemTemplate ? 'Template base' : 'Template do mercado'}</span>
                      </div>
                      <div className="offer-template-card-actions">
                        <Button type="button" onClick={() => openDesigner(template.id)}>Usar no designer</Button>
                        <ButtonLink variant="secondary" to="/app/ofertas/modelos">Editar</ButtonLink>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Fila de geração</span>
                  <h2>Lotes já preparados</h2>
                </div>
                <p>Os lotes já são gravados com template, produtos e saídas renderizadas pelo motor server-side do módulo.</p>
              </div>
              {overview.recentJobs.length === 0 ? (
                <div className="sales-empty-card">Nenhum lote foi criado ainda.</div>
              ) : (
                <div className="offer-job-grid">
                  {overview.recentJobs.map((job) => <OfferJobCard key={job.id} job={job} />)}
                </div>
              )}
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Recomendados pelas vendas</span>
                  <h2>Itens com maior urgência para virar arte</h2>
                </div>
                <p>Use este trilho para transformar itens de giro forte, sazonalidade próxima e performance promocional em campanha visual rapidamente.</p>
              </div>
              <div className="offer-suggestion-rail">
                {overview.replenishmentSuggestions.map((product) => (
                  <SuggestionProductCard
                    key={product.productId}
                    product={product}
                    label="Reposição"
                    onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                  />
                ))}
              </div>
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Calendário comercial</span>
                  <h2>Sazonalidade mais próxima</h2>
                </div>
                <p>Os produtos abaixo vêm do período sazonal mais próximo no calendário e ajudam a preparar campanhas sem hardcode manual.</p>
              </div>
              <div className="offer-suggestion-rail">
                {overview.seasonalSuggestions.map((product) => (
                  <SuggestionProductCard
                    key={product.productId}
                    product={product}
                    label="Sazonalidade"
                    onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                  />
                ))}
              </div>
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Performance promocional</span>
                  <h2>Itens com maior resposta a desconto</h2>
                </div>
                <p>Esses produtos já provaram nas notas que reagem bem a ação comercial e são candidatos naturais para cartaz e tabloide.</p>
              </div>
              <div className="offer-suggestion-rail">
                {overview.promotionSuggestions.map((product) => (
                  <PromotionSuggestionCard
                    key={product.productId}
                    product={product}
                    onUse={() => openDesigner(leadTemplate?.id, product.productId)}
                  />
                ))}
              </div>
            </section>

            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Venda combinada</span>
                  <h2>Pares que merecem peça conjunta</h2>
                </div>
                <p>Use pares fortes para encarte, ponta e comunicação cruzada de exposição.</p>
              </div>
              <div className="offer-pair-rail">
                {overview.pairSuggestions.map((pair) => (
                  <PairSuggestionCard
                    key={`${pair.antecedentId}-${pair.consequentId}`}
                    pair={pair}
                    onUse={() => openDesigner(leadTemplate?.id, pair.antecedentId || pair.consequentId || undefined)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Layout>
  );
};

export default OffersDashboard;
