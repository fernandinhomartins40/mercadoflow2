import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Eye,
  Minus,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import UsageBanner from '../components/billing/UsageBanner';
import ProductImage from '../components/product/ProductImage';
import ActivationChecklist from '../components/activation/ActivationChecklist';
import CollectingBanner from '../components/activation/CollectingBanner';
import RecommendationCard from '../components/intelligence/RecommendationCard';
import DecisionFeedback from '../components/intelligence/DecisionFeedback';
import DailyBriefCard from '../components/intelligence/DailyBriefCard';
import { useMarketData } from '../hooks/useMarketData';
import { useActivation } from '../hooks/useActivation';
import { useRecommendationDecision } from '../hooks/useRecommendationDecision';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { formatDecimal, formatMoney } from '../utils/formatters';
import { last7VsPrevious7, todayVsLastWeek } from '../utils/salesPeriods';
import type {
  OpportunityItem,
  OutcomesResponse,
  ProductPerformance,
  RecommendationItem,
  SupplierOrder,
} from '../types/analytics.types';

/**
 * Hoje (R-08, D-021): Painel do dia e Central de Inteligência numa tela só.
 *
 * A ordem é a da decisão, não a dos relatórios: primeiro o que decidir agora
 * (as 5 de maior impacto, aceitáveis aqui mesmo), depois o que está pronto
 * para sair (pedidos em rascunho), o que está sendo acompanhado e o resultado
 * do que já foi decidido. Os números de venda vêm por último, como apoio.
 * Alertas deixaram de existir como conceito separado.
 */

const TOP_DECISIONS = 5;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${formatDecimal(value, 1)}%`;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

/** "Domingo, 27 de setembro": maiúscula só no início (o capitalize do CSS faria "27 De Setembro"). */
const todayLabel = () => {
  const text = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "vs sábado passado" / "vs segunda-feira passada". */
const lastSameWeekday = () => {
  const now = new Date();
  const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now);
  return `${name} ${now.getDay() === 0 || now.getDay() === 6 ? 'passado' : 'passada'}`;
};

// ── Dados da tela ───────────────────────────────────────────────────────────

interface TodayFeed {
  recommendations: RecommendationItem[];
  tracking: OpportunityItem[];
  drafts: SupplierOrder[];
  outcomes: OutcomesResponse | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const useTodayFeed = (marketId: string | null, enabled: boolean): TodayFeed => {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [tracking, setTracking] = useState<OpportunityItem[]>([]);
  const [drafts, setDrafts] = useState<SupplierOrder[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!marketId || !enabled) { setLoading(false); return; }
    // Cada bloco é independente: uma falha não apaga a tela inteira.
    const [recs, opps, orders, outc] = await Promise.allSettled([
      marketService.getPendingRecommendations(marketId),
      marketService.getOpportunities(marketId),
      marketService.listSupplierOrders(marketId, 'RASCUNHO'),
      marketService.getOutcomes(marketId),
    ]);
    if (recs.status === 'fulfilled') setRecommendations(recs.value || []);
    if (opps.status === 'fulfilled') {
      setTracking((opps.value?.oportunidades || []).filter((o: OpportunityItem) => o.status === 'EM_ACAO'));
    }
    if (orders.status === 'fulfilled') setDrafts(orders.value || []);
    if (outc.status === 'fulfilled') setOutcomes(outc.value);
    setLoading(false);
  }, [marketId, enabled]);

  useEffect(() => { reload(); }, [reload]);

  return { recommendations, tracking, drafts, outcomes, loading, reload };
};

// ── Peças visuais ───────────────────────────────────────────────────────────

const Panel: React.FC<{
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}> = ({ title, icon: Icon, action, children, id }) => (
  <section
    id={id}
    aria-labelledby={id ? `${id}-title` : undefined}
    className="flex min-w-0 flex-col gap-3 rounded-2xl p-4 sm:p-5"
    style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
  >
    <div className="flex items-center justify-between gap-3">
      <h2 id={id ? `${id}-title` : undefined} className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
        {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const Stat: React.FC<{
  label: string;
  value: string;
  change?: number | null;
  changeLabel?: string;
  note?: string;
  to?: string;
  tone?: 'default' | 'attention';
}> = ({ label, value, change, changeLabel, note, to, tone = 'default' }) => {
  const up = change != null && change > 0.05;
  const down = change != null && change < -0.05;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const body = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-soft)' }}>{label}</span>
      <span className="text-2xl font-bold tracking-tight" style={{ color: tone === 'attention' ? 'var(--brand-700)' : 'var(--text-primary)' }}>{value}</span>
      {change != null && changeLabel ? (
        <span className="flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold"
            style={{
              background: up ? 'var(--surface-success)' : down ? '#fef2f2' : 'var(--surface-muted)',
              color: up ? 'var(--brand-700)' : down ? '#b91c1c' : 'var(--text-muted)',
            }}
          >
            <DeltaIcon className="h-3 w-3" aria-hidden="true" />
            {signedPercent(change)}
          </span>
          {changeLabel}
        </span>
      ) : note ? (
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{note}</span>
      ) : null}
    </>
  );
  const className = `flex min-w-0 flex-col gap-1 rounded-2xl p-4 no-underline ${FOCUS}`;
  const style: React.CSSProperties = {
    border: `1px solid ${tone === 'attention' ? 'var(--border-success)' : 'var(--border-soft)'}`,
    background: tone === 'attention' ? 'var(--surface-success)' : 'var(--surface-base)',
  };
  if (to?.startsWith('#')) {
    // Âncora na própria tela: rola até o bloco em vez de navegar.
    return (
      <a
        href={to}
        className={`${className} transition hover:shadow-sm`}
        style={style}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        {body}
      </a>
    );
  }
  return to
    ? <Link to={to} className={`${className} transition hover:shadow-sm`} style={style}>{body}</Link>
    : <div className={className} style={style}>{body}</div>;
};

const ProductLine: React.FC<{ product: ProductPerformance }> = ({ product }) => {
  const trend = Number(product.revenueTrendPercentage || 0);
  const Trend = trend > 1 ? TrendingUp : trend < -1 ? TrendingDown : Minus;
  return (
    <li>
      <Link
        to={`/app/produtos/${product.productId}`}
        className={`flex min-h-[48px] items-center gap-3 rounded-lg px-2 py-1.5 no-underline transition hover:bg-[var(--surface-soft)] ${FOCUS}`}
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
          <ProductImage src={product.imageUrl} alt="" className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{product.name}</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{formatMoney(product.revenue)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold" style={{ color: trend > 1 ? 'var(--brand-700)' : trend < -1 ? '#b91c1c' : 'var(--text-muted)' }}>
          <Trend className="h-3.5 w-3.5" aria-hidden="true" />
          {signedPercent(trend)}
        </span>
      </Link>
    </li>
  );
};

const WeekChart: React.FC<{ days: Array<{ label?: string; revenue?: number | null }> }> = ({ days }) => {
  const max = Math.max(...days.map((d) => Number(d.revenue || 0)), 1);
  const best = days.reduce((a, b) => (Number(b.revenue || 0) > Number(a.revenue || 0) ? b : a), days[0]);
  return (
    <div>
      <div className="grid grid-cols-7 items-end gap-1.5" style={{ height: 120 }} aria-hidden="true">
        {days.map((d) => {
          const pct = (Number(d.revenue || 0) / max) * 100;
          const isBest = d === best;
          return (
            <div key={d.label} className="flex h-full flex-col items-center justify-end gap-1">
              <div className="w-full max-w-[28px] rounded-t-md" style={{ height: `${Math.max(pct, 4)}%`, background: isBest ? 'var(--brand-700)' : 'var(--brand-500)', opacity: isBest ? 1 : 0.55 }} />
              <span className="text-[11px] font-medium capitalize" style={{ color: 'var(--text-muted)' }}>{(d.label || '').slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      {best ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Seu melhor dia é <strong style={{ color: 'var(--text-primary)' }}>{(best.label || '').toLowerCase()}</strong>: bom dia para ter o estoque cheio e a promoção na vitrine.
        </p>
      ) : null}
    </div>
  );
};

// ── Tela ────────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { name, marketId } = useAuth();
  const activation = useActivation();
  const { dashboard, loading: salesLoading } = useMarketData();
  const feedEnabled = !activation.loading && !activation.showChecklist;
  const feed = useTodayFeed(marketId, feedEnabled);
  const { deciding, feedback, setFeedback, error: decisionError, decide } =
    useRecommendationDecision(marketId, feed.recommendations, feed.reload);

  const today = useMemo(() => todayVsLastWeek(dashboard?.salesTrend || []), [dashboard?.salesTrend]);
  const week = useMemo(() => last7VsPrevious7(dashboard?.salesTrend || []), [dashboard?.salesTrend]);
  const pendingImpact = useMemo(
    () => feed.recommendations.reduce((sum, r) => sum + Number(r.expectedImpactValue || 0), 0),
    [feed.recommendations],
  );
  const results = useMemo(() => {
    let measured = 0;
    let worked = 0;
    Object.values(feed.outcomes?.porTipoDeAcao || {}).forEach((byVerdict) => {
      Object.entries(byVerdict).forEach(([verdict, count]) => {
        if (verdict === 'SEM_DADOS') return;
        measured += Number(count || 0);
        if (verdict === 'ACERTOU') worked += Number(count || 0);
      });
    });
    return { measured, worked };
  }, [feed.outcomes]);

  const header = (
    <div>
      <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {greeting()}, {name || 'gestor'}!
      </h1>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{todayLabel()}</p>
    </div>
  );

  if (activation.loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center" role="status">
          <div className="text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>Carregando o dia...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Loja ainda sem a primeira análise: o checklist ocupa o lugar do feed (UX-C04).
  if (activation.showChecklist && activation.status) {
    return (
      <Layout>
        <div className="flex flex-col gap-5">
          <UsageBanner />
          {header}
          <ActivationChecklist status={activation.status} />
        </div>
      </Layout>
    );
  }

  const top = feed.recommendations.slice(0, TOP_DECISIONS);
  const more = feed.recommendations.length - top.length;
  const topProducts = (dashboard?.topProducts || []).slice(0, 5);
  const slowMovers = (dashboard?.slowMovers || []).slice(0, 5);
  const weekdays = dashboard?.weekdaySeasonality || [];

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <UsageBanner />
        {header}

        {activation.collecting && activation.status && (
          <CollectingBanner salesDays={activation.status.invoices.salesDays} targetDays={activation.status.invoices.targetDays} />
        )}

        <DailyBriefCard marketId={marketId} />

        {/* Números do dia: dois de venda, dois de ação. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Vendas hoje"
            value={salesLoading ? '…' : formatMoney(today.value)}
            change={today.change}
            changeLabel={`vs ${lastSameWeekday()}`}
            note={salesLoading ? undefined : 'sem venda no mesmo dia da semana passada'}
          />
          <Stat
            label="Últimos 7 dias"
            value={salesLoading ? '…' : formatMoney(week.value)}
            change={week.change}
            changeLabel="vs 7 dias anteriores"
            note={salesLoading ? undefined : 'sem vendas nos 7 dias anteriores'}
          />
          <Stat
            label="Para decidir"
            value={feed.loading ? '…' : String(feed.recommendations.length)}
            note={pendingImpact > 0 ? `${formatMoney(pendingImpact)} de impacto estimado` : 'nada pendente'}
            to="#fazer-agora"
            tone={feed.recommendations.length > 0 ? 'attention' : 'default'}
          />
          <Stat
            label="Pedidos para enviar"
            value={feed.loading ? '…' : String(feed.drafts.length)}
            note={feed.drafts.length > 0 ? 'em rascunho, prontos para o fornecedor' : 'nenhum rascunho aberto'}
            to="/app/lista-compras"
            tone={feed.drafts.length > 0 ? 'attention' : 'default'}
          />
        </div>

        {feedback && marketId ? (
          <DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={feed.reload} />
        ) : null}
        {decisionError ? (
          <p role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{decisionError}</p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Coluna principal: decidir. */}
          <div className="flex min-w-0 flex-col gap-5">
            <Panel
              id="fazer-agora"
              title="O que decidir agora"
              icon={Sparkles}
              action={feed.recommendations.length > 0 ? (
                <Link to="/app/inteligencia" className={`shrink-0 text-sm font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
                  Ver todas
                </Link>
              ) : undefined}
            >
              {feed.loading ? (
                <div className="flex flex-col gap-3" aria-hidden="true">
                  {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} />)}
                </div>
              ) : top.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl px-4 py-8 text-center" style={{ background: 'var(--surface-soft)' }}>
                  <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--brand-500)' }} aria-hidden="true" />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activation.collecting ? 'Ainda coletando vendas' : 'Nada para decidir agora'}
                  </p>
                  <p className="max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
                    A análise roda toda madrugada com as vendas do dia. Quando algo pedir sua decisão, aparece aqui, do maior impacto para o menor.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Ordenadas pelo impacto em reais. Aceitar uma compra já coloca o produto no pedido do fornecedor.
                  </p>
                  <div className="flex flex-col gap-3">
                    {top.map((rec) => (
                      <RecommendationCard key={rec.id} rec={rec} onDecide={decide} deciding={deciding === rec.id} />
                    ))}
                  </div>
                  {more > 0 ? (
                    <Link
                      to="/app/inteligencia"
                      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold no-underline ${FOCUS}`}
                      style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
                    >
                      Ver mais {more} {more === 1 ? 'decisão' : 'decisões'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </>
              )}
            </Panel>

            <Panel title="Como a loja está vendendo" icon={Activity}>
              {weekdays.length > 0 ? (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Faturamento por dia da semana · últimos 90 dias</p>
                  <WeekChart days={weekdays} />
                </>
              ) : (
                <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Ainda sem vendas suficientes para mostrar o padrão da semana.</p>
              )}
            </Panel>
          </div>

          {/* Coluna lateral: o que já está andando. */}
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Pedidos para enviar" icon={ClipboardList}>
              {feed.drafts.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhum pedido em rascunho. Ao aceitar uma compra, o pedido do fornecedor aparece aqui.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {feed.drafts.slice(0, 4).map((order) => (
                    <li key={order.id}>
                      <Link
                        to={`/app/lista-compras?pedido=${order.id}`}
                        className={`flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 no-underline transition hover:shadow-sm ${FOCUS}`}
                        style={{ border: '1px solid var(--border-soft)' }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {order.supplierFantasia || order.supplierName}
                          </span>
                          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                            {order.orderNumber} · {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · {formatMoney(order.totalValue)}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>
                          <Send className="h-4 w-4" aria-hidden="true" /> Enviar
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Acompanhando"
              icon={Eye}
              action={(
                <Link to="/app/inteligencia" className={`shrink-0 text-sm font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>
                  Detalhes
                </Link>
              )}
            >
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                  <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>Em andamento</dt>
                  <dd className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{feed.tracking.length}</dd>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-soft)' }}>
                  <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>Deu certo</dt>
                  <dd className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {results.measured > 0 ? `${results.worked} de ${results.measured}` : '—'}
                  </dd>
                </div>
              </dl>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {results.measured > 0
                  ? 'Cada decisão aceita é medida 30 dias depois, contra a situação do dia da escolha.'
                  : 'As decisões aceitas são medidas 30 dias depois. O resultado aparece aqui.'}
              </p>
            </Panel>

            <Panel
              title="Mais vendidos"
              icon={TrendingUp}
              action={<Link to="/app/produtos" className={`shrink-0 text-sm font-semibold no-underline ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>Produtos</Link>}
            >
              {topProducts.length === 0
                ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem vendas no período.</p>
                : <ul className="flex flex-col">{topProducts.map((p) => <ProductLine key={p.productId} product={p} />)}</ul>}
            </Panel>

            <Panel title="Vendendo menos" icon={AlertTriangle}>
              {slowMovers.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {/* Com poucos dias de venda, "em dia" seria uma conclusão sem base. */}
                  {activation.collecting ? 'Ainda coletando vendas.' : 'Nenhum produto com queda relevante.'}
                </p>
              ) : (
                <ul className="flex flex-col">{slowMovers.map((p) => <ProductLine key={p.productId} product={p} />)}</ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
