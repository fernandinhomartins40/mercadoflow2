import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, ClipboardList, Eye, MessageCircleQuestion, Minus,
  PackageSearch, Send, ShoppingCart, Sparkles, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import UsageBanner from '../components/billing/UsageBanner';
import ActivationChecklist from '../components/activation/ActivationChecklist';
import CollectingBanner from '../components/activation/CollectingBanner';
import { ACTION_LABEL, goesToOrder } from '../components/intelligence/RecommendationCard';
import { ActionHub, Card, Chip, ExplainStrip, Forest, PageHero, PanelTitle, Row, Thumb } from '../components/flow/Flow';
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

const Delta: React.FC<{ change?: number | null; label: string }> = ({ change, label }) => {
  if (change == null) return null;
  const up = change > 0.05;
  const down = change < -0.05;
  return (
    <small>
      <b style={{ display: 'inline', fontSize: 'inherit', color: up ? 'var(--fx-green)' : down ? 'var(--fx-red)' : 'var(--fx-muted)' }}>{signedPercent(change)}</b> {label}
    </small>
  );
};

const ProductLine: React.FC<{ product: ProductPerformance }> = ({ product }) => {
  const trend = Number(product.revenueTrendPercentage || 0);
  const Trend = trend > 1 ? TrendingUp : trend < -1 ? TrendingDown : Minus;
  return (
    <li>
      <Row to={`/app/produtos/${product.productId}`}>
        <Thumb name={product.name || ''} src={product.imageUrl} size={44} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</b>
          <span className="fx-muted" style={{ fontSize: 13.5 }}>{formatMoney(product.revenue)}</span>
        </span>
        <Chip tone={trend > 1 ? 'green' : trend < -1 ? 'red' : 'gray'} icon={Trend}>{signedPercent(trend)}</Chip>
      </Row>
    </li>
  );
};

const WeekChart: React.FC<{ days: Array<{ label?: string; revenue?: number | null }> }> = ({ days }) => {
  const max = Math.max(...days.map((d) => Number(d.revenue || 0)), 1);
  const best = days.reduce((a, b) => (Number(b.revenue || 0) > Number(a.revenue || 0) ? b : a), days[0]);
  return (
    <div>
      <div className="grid grid-cols-7 items-end gap-2" style={{ height: 150 }} aria-hidden="true">
        {days.map((d) => {
          const pct = (Number(d.revenue || 0) / max) * 100;
          const isBest = d === best;
          return (
            <div key={d.label} className="flex h-full flex-col items-center justify-end gap-1.5">
              <div className="w-full max-w-[44px]" style={{ height: `${Math.max(pct, 4)}%`, borderRadius: 12, background: isBest ? 'var(--fx-lime)' : 'var(--fx-ground-2)', border: isBest ? '1px solid var(--fx-lime-strong)' : '1px solid var(--fx-line)' }} />
              <span className="text-[12px] font-semibold capitalize" style={{ color: isBest ? 'var(--fx-ink)' : 'var(--fx-muted)' }}>{(d.label || '').slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      {best ? (
        <p className="fx-muted" style={{ margin: '14px 0 0', fontSize: 14.5 }}>
          Seu melhor dia é <b style={{ color: 'var(--fx-ink)' }}>{(best.label || '').toLowerCase()}</b>: bom dia para ter o estoque cheio e a promoção na vitrine.
        </p>
      ) : null}
    </div>
  );
};

/** A decisão aberta no painel floresta: o porquê, o número e o sim ou não. */
const DecisionPanel: React.FC<{
  rec: RecommendationItem;
  deciding: boolean;
  onDecide: (id: string, decision: 'ACEITA' | 'REJEITADA') => void;
}> = ({ rec, deciding, onDecide }) => {
  const [trace, setTrace] = useState(false);
  return (
    <Forest as="aside" aria-label="Decisão selecionada">
      <PanelTitle icon={Sparkles} title="Por trás da decisão" sub="O que o Jev viu nas suas vendas" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '20px 0 0' }}>
        <Thumb name={rec.productName || rec.title} src={rec.productImage} size={64} />
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Chip tone="lime">{ACTION_LABEL[rec.actionType] || rec.actionType}</Chip>
            {rec.confidence != null && <Chip tone="ghost">Certeza {Math.round(Number(rec.confidence) * 100)}%</Chip>}
          </span>
          <h3 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 26px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15 }}>{rec.title}</h3>
        </div>
      </div>
      {rec.rationale && <p style={{ margin: '16px 0 0', fontSize: 15.5, lineHeight: 1.55, color: 'var(--fx-on-forest)' }}>{rec.rationale}</p>}
      <div className="fx-white" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            <small>Impacto estimado</small>
            <span style={{ display: 'block', marginTop: 4 }}><span className="fx-money" style={{ fontSize: 26 }}>{formatMoney(rec.expectedImpactValue)}</span></span>
          </span>
          {goesToOrder(rec) && <small style={{ maxWidth: 220 }}>Aceitar já coloca {rec.parameters?.quantidade} un. no pedido do fornecedor.</small>}
        </div>
        {rec.calculationTrace && (
          <>
            <button type="button" className="fx-btn ghost small" style={{ marginTop: 14 }} aria-expanded={trace} onClick={() => setTrace((v) => !v)}>
              <ChevronDown aria-hidden="true" style={{ transform: trace ? 'rotate(180deg)' : 'none' }} />Como chegamos nesse número
            </button>
            {trace && <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, background: 'var(--fx-card-2)', borderRadius: 12, padding: 12, color: 'var(--fx-ink-2)' }}>{rec.calculationTrace}</pre>}
          </>
        )}
        <div className="fx-actions" style={{ marginTop: 16 }}>
          <button type="button" className="fx-btn dark" disabled={deciding} onClick={() => onDecide(rec.id, 'ACEITA')}>
            <Check aria-hidden="true" />{goesToOrder(rec) ? 'Aceitar e pôr no pedido' : 'Aceitar'}
          </button>
          <button type="button" className="fx-btn ghost" disabled={deciding} onClick={() => onDecide(rec.id, 'REJEITADA')}>
            <X aria-hidden="true" />Não faz sentido
          </button>
        </div>
      </div>
    </Forest>
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
  const [selected, setSelected] = useState<string | null>(null);

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

  const first = (name || 'gestor').split(' ')[0];
  const hub = (
    <ActionHub icon={Bot} label="Atalhos do dia" actions={[
      { label: 'Abrir o Copiloto', icon: Sparkles, to: '/app/copiloto' },
      { label: 'Revisar pedidos', icon: ShoppingCart, to: '/app/lista-compras' },
      { label: 'Perguntar aos dados', icon: MessageCircleQuestion, to: '/app/perguntar' },
    ]} />
  );

  if (activation.loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center" role="status">
          <p className="fx-muted">Carregando o dia...</p>
        </div>
      </Layout>
    );
  }

  // Loja ainda sem a primeira análise: o checklist ocupa o lugar do feed (UX-C04).
  if (activation.showChecklist && activation.status) {
    return (
      <Layout>
        <UsageBanner />
        <PageHero title={<>{greeting()}, {first}. Vamos <mark>ligar a loja.</mark></>} subtitle={todayLabel()} />
        <ActivationChecklist status={activation.status} />
      </Layout>
    );
  }

  const top = feed.recommendations.slice(0, TOP_DECISIONS);
  const more = feed.recommendations.length - top.length;
  const current = top.find((r) => r.id === selected) ?? top[0] ?? null;
  const topProducts = (dashboard?.topProducts || []).slice(0, 5);
  const slowMovers = (dashboard?.slowMovers || []).slice(0, 5);
  const weekdays = dashboard?.weekdaySeasonality || [];
  const n = feed.recommendations.length;

  return (
    <Layout>
      <UsageBanner />
      <PageHero
        title={feed.loading ? <>{greeting()}, {first}.</>
          : n === 0 ? <>{greeting()}, {first}. A loja está <mark>em dia.</mark></>
            : <>{greeting()}, {first}. Hoje a loja pede <mark>{n} {n === 1 ? 'decisão' : 'decisões'}.</mark></>}
        subtitle={`${todayLabel()}${pendingImpact > 0 ? ` · ${formatMoney(pendingImpact)} de impacto esperando você` : ''}`}
        side={hub}
      />

      {activation.collecting && activation.status && (
        <CollectingBanner salesDays={activation.status.invoices.salesDays} targetDays={activation.status.invoices.targetDays} />
      )}

      <div className="fx-kpis" style={{ marginBottom: 18 }}>
        <div className="fx-kpi">
          <span>Vendas hoje</span>
          <b>{salesLoading ? '…' : formatMoney(today.value)}</b>
          {today.change != null ? <Delta change={today.change} label={`vs ${lastSameWeekday()}`} /> : !salesLoading && <small>sem venda no mesmo dia da semana passada</small>}
        </div>
        <div className="fx-kpi">
          <span>Últimos 7 dias</span>
          <b>{salesLoading ? '…' : formatMoney(week.value)}</b>
          {week.change != null ? <Delta change={week.change} label="vs 7 dias anteriores" /> : !salesLoading && <small>sem vendas nos 7 dias anteriores</small>}
        </div>
        <a className="fx-kpi" href="#fazer-agora" style={{ textDecoration: 'none', color: 'inherit', background: n > 0 ? 'var(--fx-lime-soft)' : undefined, borderColor: n > 0 ? 'var(--fx-lime-line)' : undefined }}
          onClick={(e) => { e.preventDefault(); document.getElementById('fazer-agora')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <span>Para decidir</span>
          <b>{feed.loading ? '…' : n}</b>
          <small>{pendingImpact > 0 ? `${formatMoney(pendingImpact)} de impacto estimado` : 'nada pendente'}</small>
        </a>
        <Link className="fx-kpi" to="/app/lista-compras" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>Pedidos para enviar</span>
          <b>{feed.loading ? '…' : feed.drafts.length}</b>
          <small>{feed.drafts.length > 0 ? 'em rascunho, prontos para o fornecedor' : 'nenhum rascunho aberto'}</small>
        </Link>
      </div>

      <DailyBriefCard marketId={marketId} />

      {feedback && marketId ? (
        <DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={feed.reload} />
      ) : null}
      {decisionError ? <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', padding: '10px 14px' }}>{decisionError}</p> : null}

      <div className="fx-split" style={{ marginTop: 18 }}>
        <Card id="fazer-agora" aria-labelledby="fazer-agora-title">
          <PanelTitle title={<span id="fazer-agora-title">Agora importa</span>} sub="Do maior impacto em reais para o menor"
            right={n > 0 ? <Link to="/app/inteligencia" className="fx-btn ghost small">Ver todas</Link> : undefined} />
          {feed.loading ? (
            <div className="fx-stack" style={{ marginTop: 16 }} aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse" style={{ borderRadius: 18, background: 'var(--fx-ground)' }} />)}
            </div>
          ) : top.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 12px' }}>
              <CheckCircle2 size={40} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
              <h3 className="fx-section-title" style={{ marginTop: 10 }}>{activation.collecting ? 'Ainda coletando vendas' : 'Nada para decidir agora'}</h3>
              <p className="fx-muted" style={{ maxWidth: 380, margin: '6px auto 0' }}>
                A análise roda toda madrugada com as vendas do dia. Quando algo pedir sua decisão, aparece aqui.
              </p>
            </div>
          ) : (
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
              {top.map((rec) => (
                <li key={rec.id}>
                  <Row selected={current?.id === rec.id} onClick={() => setSelected(rec.id)}>
                    <Thumb name={rec.productName || rec.title} src={rec.productImage} size={48} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 15.5 }}>{ACTION_LABEL[rec.actionType] || rec.actionType}</b>
                        {goesToOrder(rec) && <Chip tone="lime">vai ao pedido</Chip>}
                      </span>
                      <span className="fx-muted" style={{ display: 'block', fontSize: 14 }}>{rec.title}</span>
                    </span>
                    {rec.expectedImpactValue ? <b className="fx-num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{formatMoney(rec.expectedImpactValue)}</b> : null}
                  </Row>
                </li>
              ))}
              {more > 0 && (
                <li><Link to="/app/inteligencia" className="fx-btn ghost" style={{ width: '100%' }}>Ver mais {more} {more === 1 ? 'decisão' : 'decisões'}<ArrowRight aria-hidden="true" /></Link></li>
              )}
            </ul>
          )}
        </Card>

        {current ? <DecisionPanel key={current.id} rec={current} deciding={deciding === current.id} onDecide={decide} /> : (
          <Forest as="aside" aria-label="Pedidos para enviar">
            <PanelTitle icon={ClipboardList} title="Pedidos para enviar" sub="Rascunhos prontos para o fornecedor" />
            <DraftList drafts={feed.drafts} />
          </Forest>
        )}
      </div>

      <div className="fx-split wide-left" style={{ marginTop: 18 }}>
        <Card>
          <PanelTitle icon={Activity} title="Como a loja está vendendo" sub="Faturamento por dia da semana, últimos 90 dias" />
          <div style={{ marginTop: 18 }}>
            {weekdays.length > 0 ? <WeekChart days={weekdays} /> : <p className="fx-muted">Ainda sem vendas suficientes para mostrar o padrão da semana.</p>}
          </div>
        </Card>
        <div className="fx-stack" style={{ gap: 18 }}>
          {current && (
            <Card>
              <PanelTitle icon={ClipboardList} title="Pedidos para enviar" sub="Rascunhos prontos para o fornecedor" />
              <DraftList drafts={feed.drafts} />
            </Card>
          )}
          <Card>
            <PanelTitle icon={Eye} title="Acompanhando" right={<Link to="/app/inteligencia" className="fx-btn ghost small">Detalhes</Link>} />
            <div className="fx-kpis" style={{ marginTop: 14, gridTemplateColumns: '1fr 1fr' }}>
              <div className="fx-kpi" style={{ background: 'var(--fx-card-2)' }}><span>Em andamento</span><b>{feed.tracking.length}</b></div>
              <div className="fx-kpi" style={{ background: 'var(--fx-card-2)' }}><span>Deu certo</span><b>{results.measured > 0 ? `${results.worked}/${results.measured}` : '—'}</b></div>
            </div>
            <p className="fx-muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
              {results.measured > 0
                ? 'Cada decisão aceita é medida 30 dias depois, contra a situação do dia da escolha.'
                : 'As decisões aceitas são medidas 30 dias depois. O resultado aparece aqui.'}
            </p>
          </Card>
        </div>
      </div>

      <div className="fx-split" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card>
          <PanelTitle icon={TrendingUp} title="Mais vendidos" right={<Link to="/app/produtos" className="fx-btn ghost small">Produtos</Link>} />
          {topProducts.length === 0
            ? <p className="fx-muted">Sem vendas no período.</p>
            : <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>{topProducts.map((p) => <ProductLine key={p.productId} product={p} />)}</ul>}
        </Card>
        <Card>
          <PanelTitle icon={TrendingDown} title="Vendendo menos" sub="Produtos com queda relevante" />
          {slowMovers.length === 0 ? (
            <p className="fx-muted" style={{ marginTop: 14 }}>
              {/* Com poucos dias de venda, "em dia" seria uma conclusão sem base. */}
              {activation.collecting ? 'Ainda coletando vendas.' : 'Nenhum produto com queda relevante.'}
            </p>
          ) : (
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>{slowMovers.map((p) => <ProductLine key={p.productId} product={p} />)}</ul>
          )}
        </Card>
      </div>

      <ExplainStrip items={[
        { icon: PackageSearch, title: 'Jev lê cada venda', text: 'As notas do PDV chegam a cada poucos minutos.' },
        { icon: Sparkles, title: 'Você decide o que vale', text: 'Aceite, recuse ou ajuste as sugestões.' },
        { icon: Send, title: 'O pedido sai pronto', text: 'Nada vai ao fornecedor sem o seu sim.' },
      ]} />
    </Layout>
  );
};

const DraftList: React.FC<{ drafts: SupplierOrder[] }> = ({ drafts }) => (
  drafts.length === 0 ? (
    <p className="fx-muted" style={{ margin: '14px 0 0' }}>Nenhum pedido em rascunho. Ao aceitar uma compra, o pedido do fornecedor aparece aqui.</p>
  ) : (
    <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>
      {drafts.slice(0, 4).map((order) => (
        <li key={order.id}>
          <Link to={`/app/lista-compras?pedido=${order.id}`} className="fx-row" style={{ color: 'var(--fx-ink)' }}>
            <span className="fx-icon-tile" style={{ width: 42, height: 42 }}><ShoppingCart aria-hidden="true" /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.supplierFantasia || order.supplierName}</b>
              <span style={{ fontSize: 13, opacity: .75 }}>{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} · {formatMoney(order.totalValue)}</span>
            </span>
            <span className="fx-chip lime"><Send size={14} aria-hidden="true" />Enviar</span>
          </Link>
        </li>
      ))}
    </ul>
  )
);

export default Dashboard;
