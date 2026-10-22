import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ChartSkeleton } from '../components/charts/chartKit';

// Recharts só carrega quando o gráfico aparece.
const BarsChart = lazy(() => import('../components/charts/BarsChart'));
import { Link } from 'react-router-dom';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Download, Loader2, Newspaper, PackageSearch, ShoppingCart, Sparkles, Store, Users, X,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import UsageBanner from '../components/billing/UsageBanner';
import ActivationChecklist from '../components/activation/ActivationChecklist';
import CollectingBanner from '../components/activation/CollectingBanner';
import { Card, Chip, Forest, PageHero, PanelTitle, PillTabs, Row, Thumb } from '../components/flow/Flow';
import DailyBriefCard from '../components/intelligence/DailyBriefCard';
import CostCoverageCard from '../components/intelligence/CostCoverageCard';
import { useActivation } from '../hooks/useActivation';
import { useAuth } from '../context/AuthContext';
import { operationService, type OperationMetric, type OperationPanel, type OperationPeriod, type OperationProduct } from '../services/operation.service';
import { networkService, weeklyDigestService, type WeeklyDigest } from '../services/network.service';
import { customerService, exportService } from '../services/advanced.service';
import { formatDecimal, formatMoney } from '../utils/formatters';
import { GROUP_LABEL, useDecisionQueue } from './decidir/queue';
import { useCached } from '../hooks/useCached';
import { tractionService, type ProductTraction } from '../services/traction.service';
import workingCapitalService, { type CapitalScoreboard as ScoreData, type GiroSummary } from '../services/workingCapital.service';
import CapitalScoreboard from '../components/capital/CapitalScoreboard';
import { marketService, type OutcomesSummary } from '../services/market.service';
import { paceLabel, plainDates, rankLabel } from '../utils/plain';

/**
 * Início: onde o capital rende. Abre com quem PUXA a venda (tração medida no
 * cupom) e com o GIRO (o que vende mais rápido e o que está perdendo ritmo);
 * as decisões que mais valem; e, por último, como a loja vendeu no período,
 * como contexto. Tocar num número abre o porquê.
 */

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const pct = (v: number | null | undefined) => (v == null ? null : `${v > 0 ? '+' : ''}${formatDecimal(v, Math.abs(v) < 10 ? 1 : 0)}%`);

const METRIC: Record<OperationMetric['key'], { label: string; hint: string; fmt: (v: number) => string }> = {
  vendas: { label: 'Vendas', hint: 'faturamento', fmt: (v) => formatMoney(v) },
  clientes: { label: 'Clientes', hint: 'compras no caixa', fmt: (v) => Math.round(v).toLocaleString('pt-BR') },
  ticket: { label: 'Gasto médio por cliente', hint: 'por compra', fmt: (v) => formatMoney(v) },
  itens: { label: 'Produtos por compra', hint: 'em cada compra', fmt: (v) => formatDecimal(v, 1) },
};


const Delta: React.FC<{ change: number | null }> = ({ change }) => {
  if (change == null) return <small className="fx-muted">sem base de comparação</small>;
  const up = change >= 0.5;
  const down = change <= -0.5;
  const I = up ? ArrowUpRight : down ? ArrowDownRight : null;
  return (
    <small style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: up ? 'var(--fx-green)' : down ? 'var(--fx-red)' : 'var(--fx-muted)' }}>
      {I && <I size={15} aria-hidden="true" />}{pct(change)}
    </small>
  );
};

// ── Vendas por hora (ou por dia) ────────────────────────────────────────────

const SalesChart: React.FC<{ panel: OperationPanel }> = ({ panel }) => {
  const points = panel.series;
  if (points.length === 0) return <p className="fx-muted" style={{ margin: '14px 0 0' }}>Ainda sem vendas neste período.</p>;
  return (
    <div style={{ marginTop: 12 }}>
      <Suspense fallback={<ChartSkeleton height={220} />}>
        <BarsChart
          data={points.map((p) => ({ label: p.label, value: Number(p.current), reference: Number(p.reference) }))}
          name={panel.today && panel.period === 'dia' ? 'Hoje' : 'Período'}
          referenceName={panel.seriesReferenceLabel}
        />
      </Suspense>
    </div>
  );
};

// ── Por que mudou (gaveta) ──────────────────────────────────────────────────

const ProductMoveRow: React.FC<{ p: OperationProduct }> = ({ p }) => (
  <li>
    <Row to={`/app/produtos/${p.productId}`}>
      <Thumb name={p.name} src={p.imageUrl} size={42} productId={p.productId} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</b>
        <span className="fx-muted" style={{ fontSize: 13 }}>{formatMoney(p.revenue)} · antes {formatMoney(p.previous)}</span>
      </span>
      <Delta change={p.change} />
    </Row>
  </li>
);

const WhyDrawer: React.FC<{ panel: OperationPanel; metric: OperationMetric; onClose: () => void }> = ({ panel, metric, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const m = METRIC[metric.key];
  const deps = [...panel.departments].sort((a, b) => Math.abs(Number(b.revenue) - Number(b.previous)) - Math.abs(Number(a.revenue) - Number(a.previous))).slice(0, 5);
  return (
    <>
      <div className="fx-shade" onClick={onClose} aria-hidden="true" />
      <aside className="fx-drawer" role="dialog" aria-modal="true" aria-labelledby="porque-titulo">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 id="porque-titulo" className="fx-drawer-title">{m.label}: {m.fmt(Number(metric.value))}</h2>
            <p className="fx-muted" style={{ margin: '4px 0 0' }}>{pct(metric.change) ?? 'Sem base'} {panel.comparisonLabel} (antes {m.fmt(Number(metric.previous))})</p>
          </div>
          <button type="button" className="fx-btn ghost small" onClick={onClose} aria-label="Fechar"><X aria-hidden="true" /></button>
        </div>

        <Card style={{ marginTop: 18 }}>
          <PanelTitle title="Departamentos que mais mudaram" />
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
            {deps.map((d) => (
              <li key={d.name} className="fx-datarow" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--fx-line)' }}>
                <span>{d.name}</span>
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><b className="fx-num">{formatMoney(d.revenue)}</b><Delta change={d.change} /></span>
              </li>
            ))}
          </ul>
        </Card>

        {panel.rising.length > 0 && (
          <Card style={{ marginTop: 14 }}>
            <PanelTitle title="Puxaram para cima" />
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, gap: 8 }}>
              {panel.rising.map((p) => <ProductMoveRow key={p.productId} p={p} />)}
            </ul>
          </Card>
        )}
        {panel.falling.length > 0 && (
          <Card style={{ marginTop: 14 }}>
            <PanelTitle title="Puxaram para baixo" />
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, gap: 8 }}>
              {panel.falling.map((p) => <ProductMoveRow key={p.productId} p={p} />)}
            </ul>
          </Card>
        )}
        <Link to={`/app/perguntar?q=${encodeURIComponent(`Por que ${m.label.toLowerCase()} ${metric.change != null && metric.change < 0 ? 'caiu' : 'mudou'} ${panel.comparisonLabel}?`)}`}
          className="fx-btn ghost" style={{ marginTop: 16, width: '100%' }}>
          <Sparkles aria-hidden="true" />Perguntar ao Tino por quê
        </Link>
      </aside>
    </>
  );
};

// ── Quem puxa a venda (tração) e giro: o centro da decisão ──────────────────────────────────────

const money2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TractionCard: React.FC<{ items: ProductTraction[] | undefined; failed?: boolean; onRetry?: () => void }> = ({ items, failed, onRetry }) => (
  <Card>
    <PanelTitle title="Quem puxa a venda"
      sub="Cupons com estes produtos levam mais em OUTROS itens do que cupons do mesmo tamanho sem eles (90 dias, só dias completos)" />
    {!items && failed ? (
      <p className="fx-muted" role="alert" style={{ margin: '14px 0 0' }}>Não foi possível carregar agora. <button type="button" className="fx-btn ghost small" onClick={onRetry}>Tentar de novo</button></p>
    ) : !items ? <Loader2 className="animate-spin" aria-label="Carregando" style={{ marginTop: 16 }} /> : items.length === 0 ? (
      <p className="fx-muted" style={{ margin: '14px 0 0' }}>Ainda sem o cálculo de quem puxa a venda. Ele roda de madrugada e precisa de pelo menos 3 semanas de histórico completo.</p>
    ) : (
      <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>
        {items.slice(0, 5).map((t) => (
          <li key={t.productId}>
            <Row to={`/app/produtos/${t.productId}`}>
              <Thumb name={t.name} src={t.imageUrl} size={42} productId={t.productId} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</b>
                <span className="fx-muted" style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.baskets.toLocaleString('pt-BR')} cupons{t.partners.length > 0 ? ` · vem com ${t.partners.slice(0, 2).map((x) => x.name).join(', ')}` : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <b className="fx-num" style={{ display: 'block', color: 'var(--fx-green)' }}>+{money2(t.liftPerBasket)}</b>
                <small className="fx-muted">por cupom</small>
              </span>
            </Row>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

const GiroCard: React.FC<{ portfolio: GiroSummary | undefined; failed?: boolean; onRetry?: () => void }> = ({ portfolio, failed, onRetry }) => {
  const [view, setView] = useState<'rapido' | 'perdendo'>('rapido');
  const list = portfolio ? portfolio[view] : [];
  const noStock = portfolio?.noStock ?? true;
  return (
    <Forest as="aside" aria-label="Giro">
      <PanelTitle title="Giro" sub={noStock ? 'Pela venda por dia. Sem compras registradas, o estoque e o dinheiro parado ainda não aparecem.' : 'Pela venda por dia e pelo estoque registrado'}
        right={<PillTabs<'rapido' | 'perdendo'> label="Giro" value={view} onChange={setView} tabs={[{ key: 'rapido', label: 'Vale reforçar' }, { key: 'perdendo', label: 'Perdendo giro' }]} />} />
      {!portfolio && failed ? (
        <p role="alert" style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>Não foi possível carregar agora. <button type="button" className="fx-btn ghost small" onClick={onRetry}>Tentar de novo</button></p>
      ) : !portfolio ? <Loader2 className="animate-spin" aria-label="Carregando" style={{ marginTop: 16 }} /> : list.length === 0 ? (
        <p style={{ margin: '14px 0 0', color: 'var(--fx-on-forest)' }}>Nenhum produto neste grupo agora.</p>
      ) : (
        <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>
          {list.map((m) => (
            <li key={m.productId}>
              <Row to={`/app/produtos/${m.productId}`}>
                <Thumb name={m.name} src={m.imageUrl} size={40} productId={m.productId} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</b>
                  <span className="fx-muted" style={{ fontSize: 12.5 }}>{rankLabel(m.abcClass)} · {paceLabel(m.momentumScore != null ? Number(m.momentumScore) : null)}</span>
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <b className="fx-num" style={{ display: 'block' }}>{formatDecimal(Number(m.dailyVelocity), 1)}</b>
                  <small className="fx-muted">por dia</small>
                </span>
              </Row>
            </li>
          ))}
        </ul>
      )}
    </Forest>
  );
};

// ── Extras do rodapé: semana, rede, clientes, planilha ──────────────────────

/** Mudam devagar: guardados por 10 minutos entre uma visita e outra. */
const useExtras = (marketId: string | null) => {
  const { data } = useCached(marketId ? `inicio-extras:${marketId}` : null, async () => {
    const [weekly, net, cust, exp] = await Promise.allSettled([
      weeklyDigestService.list(marketId!),
      networkService.status(marketId!),
      customerService.overview(marketId!),
      exportService.status(marketId!),
    ]);
    const c = cust.status === 'fulfilled' ? cust.value : null;
    return {
      digest: (weekly.status === 'fulfilled' ? weekly.value[0] : null) ?? null as WeeklyDigest | null,
      network: net.status === 'fulfilled' && !!net.value.rede,
      recurring: c && !c.bloqueadoPorPlano && c.resumo && c.resumo.totalCustomers > 0 ? c.resumo.recurringSharePercent ?? null : null,
      exportable: exp.status === 'fulfilled' && exp.value.disponivel,
    };
  }, 10 * 60_000);
  return data ?? { digest: null, network: false, recurring: null, exportable: false };
};

// ── Tela ────────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { name, marketId } = useAuth();
  const activation = useActivation();
  const ready = !activation.loading && !activation.showChecklist;
  const [period, setPeriod] = useState<OperationPeriod>('dia');
  const [why, setWhy] = useState<OperationMetric | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const queue = useDecisionQueue(marketId, ready);
  const traction = useCached<ProductTraction[]>(marketId && ready ? `tracao:${marketId}` : null,
    () => tractionService.list(marketId!, true, 50), 10 * 60_000);
  // Placar do capital (F2): o número principal do Início é o dinheiro da loja.
  const score = useCached<ScoreData>(marketId && ready ? `placar:${marketId}` : null,
    () => workingCapitalService.getScoreboard(marketId!), 10 * 60_000);
  const results = useCached<OutcomesSummary>(marketId && ready ? `resultado30:${marketId}` : null,
    () => marketService.getOutcomesSummary(marketId!, 30), 10 * 60_000);
  const portfolio = useCached<GiroSummary>(marketId && ready ? `giro2:${marketId}` : null,
    () => workingCapitalService.getGiro(marketId!), 10 * 60_000);
  const extras = useExtras(ready ? marketId ?? null : null);

  // O número do dia muda a cada nota: fresco por 1 minuto, depois atualiza em segundo plano.
  const op = useCached<OperationPanel>(marketId && ready ? `operacao:${marketId}:${period}` : null,
    () => operationService.get(marketId!, period), 60_000);
  const panel = op.data ?? null;
  const panelError = !!op.error && !panel;

  const sales = panel?.metrics.find((m) => m.key === 'vendas');
  const first = (name || 'gestor').split(' ')[0];
  const n = queue.items.length;
  const top = queue.items.slice(0, 3);

  const pulling = traction.data ?? [];
  const sc = score.data;
  const today = useMemo(() => {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, []);

  const baixar = async (arquivo: string) => {
    if (!marketId) return;
    setDownloading(arquivo);
    try { await exportService.download(marketId, arquivo); } finally { setDownloading(null); }
  };

  if (activation.loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center" role="status">
          <p className="fx-muted">Carregando a loja...</p>
        </div>
      </Layout>
    );
  }

  // Loja ainda sem a primeira análise: o checklist ocupa o lugar do painel (UX-C04).
  if (activation.showChecklist && activation.status) {
    return (
      <Layout>
        <UsageBanner />
        <PageHero title={<>{greeting()}, {first}. Vamos <mark>ligar a loja.</mark></>} />
        <ActivationChecklist status={activation.status} />
      </Layout>
    );
  }

  const margin = panel?.margin?.percent;
  const stockMeasured = !!sc?.stockMeasured;

  return (
    <Layout>
      <UsageBanner />
      <PageHero title={today} />

      {activation.collecting && activation.status && (
        <CollectingBanner salesDays={activation.status.invoices.salesDays} targetDays={activation.status.invoices.targetDays} />
      )}

      {/* 1. Como a loja vendeu, com o dia escrito: número parado não se passa por "hoje". */}
      <div className="fx-section-head">
        <h2 className="fx-section-title">
          {panel && period === 'dia' && !panel.today
            ? <>Como a loja vendeu em {dayLabel(panel.referenceDate).toLowerCase()} <span className="fx-muted" style={{ fontWeight: 500 }}>(último dia que chegou)</span></>
            : 'Como a loja vendeu'}
        </h2>
        <PillTabs<OperationPeriod> label="Período" value={period} onChange={setPeriod} tabs={[
          { key: 'dia', label: panel && !panel.today && period === 'dia' ? 'Último dia' : 'Hoje' },
          { key: 'semana', label: 'Semana' },
          { key: 'mes', label: 'Mês' },
        ]} />
      </div>

      {/* Os números do período: tocar abre o porquê. */}
      {panelError ? (
        <Card><p className="fx-muted" style={{ margin: 0 }}>Não foi possível carregar os números agora. <button type="button" className="fx-btn ghost small" onClick={() => { void op.refresh(); }}>Tentar de novo</button></p></Card>
      ) : !panel ? (
        <div className="fx-kpis" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="fx-kpi animate-pulse" style={{ height: 112 }} />)}
        </div>
      ) : (
        <div className="fx-kpis" role="list" aria-label="Números do período">
          {panel.metrics.map((m) => {
            const meta = METRIC[m.key];
            return (
              <button key={m.key} type="button" role="listitem" className="fx-kpi" onClick={() => setWhy(m)}
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} aria-label={`${meta.label}: ${meta.fmt(Number(m.value))}. Ver por que mudou`}>
                <span>{meta.label}</span>
                <b className="fx-num">{meta.fmt(Number(m.value))}</b>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                  <Delta change={m.change} />
                  <small className="fx-muted">{meta.hint}</small>
                </span>
              </button>
            );
          })}
          {margin != null && (
            <div className="fx-kpi" role="listitem">
              <span>Margem estimada</span>
              <b className="fx-num">{formatDecimal(margin, 1)}%</b>
              <small>pelo último custo de compra de {Math.round((panel.margin.coverage) * 100)}% do vendido</small>
            </div>
          )}
        </div>
      )}

      {/* 2. O que fazer hoje e os atalhos do dia a dia. */}
      <div className="fx-split wide-left">
        <DecideNow n={n} loading={queue.loading} top={top} />
        <Shortcuts />
      </div>

      {/* O Tino traz o aviso de dados e o "Aprovar o que preparou". */}
      <DailyBriefCard marketId={marketId} />

      {/* 3. O resto fica recolhido: quem quer mais detalhe abre. */}
      <details className="fx-more">
        <summary>Mais números da loja<small>Vendas por hora, departamentos, giro e dinheiro na prateleira</small></summary>
        <div className="fx-stack" style={{ gap: 'clamp(14px, 1.6vw, 22px)', marginTop: 16 }}>
          {stockMeasured && <CapitalScoreboard score={sc} loading={score.loading} results={results.data} />}

          {panel && (
            <Card>
              <PanelTitle title={panel.period === 'dia' ? 'Vendas por hora' : 'Vendas por dia'}
                sub={panel.period === 'dia' ? `${dayLabel(panel.referenceDate)}, contra a ${panel.seriesReferenceLabel}` : `Cada dia contra o mesmo dia da ${panel.seriesReferenceLabel}`} />
              <SalesChart panel={panel} />
            </Card>
          )}

          <DepartmentsCard panel={panel} failed={panelError} onRetry={() => { void op.refresh(); }} />

          {/* Lado a lado com a mesma altura. */}
          <div className="fx-split even">
            <TractionCard items={traction.data} failed={!!traction.error} onRetry={() => { void traction.refresh(); }} />
            <GiroCard portfolio={portfolio.data} failed={!!portfolio.error} onRetry={() => { void portfolio.refresh(); }} />
          </div>

          {!stockMeasured && <CapitalScoreboard score={sc} loading={score.loading} results={results.data} hideActions />}

          <CostCoverageCard marketId={marketId} withCount={!stockMeasured} />

          {/* Uma linha para cada coisa que antes era uma página inteira. */}
          <div className="fx-stack" style={{ gap: 10 }}>
            {period !== 'dia' && extras.digest && (
              <Row to="/app/rede">
                <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><CalendarDays aria-hidden="true" /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 15.5 }}>Resumo da semana do Tino</b>
                  <span className="fx-muted" style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extras.digest.resumo}</span>
                </span>
              </Row>
            )}
            {extras.network && (
              <Row to="/app/rede">
                <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><Store aria-hidden="true" /></span>
                <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 15.5 }}>Comparar suas lojas</b><span className="fx-muted" style={{ fontSize: 13.5 }}>Faturamento, transferências e preços entre filiais</span></span>
              </Row>
            )}
            {extras.recurring != null && (
              <Row to="/app/clientes">
                <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><Users aria-hidden="true" /></span>
                <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 15.5 }}>{formatDecimal(extras.recurring, 0)}% dos clientes identificados voltam</b><span className="fx-muted" style={{ fontSize: 13.5 }}>Quem volta e o que traz o cliente de volta</span></span>
              </Row>
            )}
            {extras.exportable && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="fx-muted" style={{ fontSize: 14 }}>Baixar planilha:</span>
                {[['capital.csv', 'Dinheiro parado'], ['oportunidades.csv', 'Oportunidades'], ['decisoes.csv', 'Decisões']].map(([arquivo, label]) => (
                  <button key={arquivo} type="button" className="fx-btn ghost small" onClick={() => baixar(arquivo)} disabled={downloading === arquivo}>
                    {downloading === arquivo ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </details>

      {why && panel && <WhyDrawer panel={panel} metric={why} onClose={() => setWhy(null)} />}
    </Layout>
  );
};

/** As três decisões que mais valem: uma frase, um valor e o caminho para decidir. */
const DecideNow: React.FC<{ n: number; loading: boolean; top: ReturnType<typeof useDecisionQueue>['items'] }> = ({ n, loading, top }) => (
  <Card as="section" aria-label="Faça hoje">
    <PanelTitle title="Faça hoje" sub={n > 0 ? 'As sugestões do Tino que mais valem. Nada muda sem o seu sim.' : 'Nada esperando você'} />
    {loading ? <Loader2 className="animate-spin" aria-label="Carregando" style={{ marginTop: 16 }} /> : top.length === 0 ? (
      <p className="fx-muted" style={{ margin: '14px 0 0' }}>A análise roda de madrugada e a cada lote de notas. Quando algo pedir sua decisão, aparece aqui.</p>
    ) : (
      <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
        {top.map((it) => (
          <li key={it.key}>
            <Link to={`/app/decidir?item=${encodeURIComponent(it.key)}`} className="fx-row">
              {it.image ? <Thumb name={it.name} src={it.image} size={44} /> : <span className="fx-icon-tile" style={{ width: 44, height: 44 }}><Sparkles aria-hidden="true" /></span>}
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 16, lineHeight: 1.3 }}>{plainDates(it.title)}</b>
                <span className="fx-muted" style={{ fontSize: 14 }}>{it.title.startsWith(GROUP_LABEL[it.group]) ? 'Sugestão do Tino' : GROUP_LABEL[it.group]}</span>
              </span>
              {it.value != null && <b className="fx-num" style={{ whiteSpace: 'nowrap' }}>{formatMoney(it.value)}</b>}
            </Link>
          </li>
        ))}
      </ul>
    )}
    {n > top.length && <Link to="/app/decidir" className="fx-more-link">Ver todas as {n} sugestões<ArrowRight aria-hidden="true" /></Link>}
  </Card>
);

/** O que o dono faz todo dia, a um toque do Início. */
const SHORTCUTS = [
  { to: '/app/lista-compras', label: 'Fazer pedido', icon: ShoppingCart },
  { to: '/app/contar', label: 'Contar estoque', icon: ClipboardList },
  { to: '/app/encartes', label: 'Montar encarte', icon: Newspaper },
  { to: '/app/produtos', label: 'Ver um produto', icon: PackageSearch },
];

const Shortcuts: React.FC = () => (
  <Card as="section" aria-label="Atalhos">
    <PanelTitle title="Atalhos" sub="O que você mais faz no dia a dia" />
    <div className="fx-shortcuts">
      {SHORTCUTS.map(({ to, label, icon: I }) => <Link key={to} to={to}><I aria-hidden="true" />{label}</Link>)}
    </div>
  </Card>
);

/** Departamentos e mais vendidos no mesmo cartão: duas leituras da mesma venda. */
const DepartmentsCard: React.FC<{ panel: OperationPanel | null; failed?: boolean; onRetry?: () => void }> = ({ panel, failed, onRetry }) => {
  const [view, setView] = useState<'dep' | 'prod'>('dep');
  return (
    <Card>
      <PanelTitle title="Onde a loja vendeu" sub={panel?.comparisonLabel ? `Variação ${panel.comparisonLabel}` : undefined}
        right={<PillTabs<'dep' | 'prod'> label="Ver por" value={view} onChange={setView} tabs={[{ key: 'dep', label: 'Departamentos' }, { key: 'prod', label: 'Produtos' }]} />} />
      {!panel && failed ? (
        <p className="fx-muted" role="alert" style={{ margin: '14px 0 0' }}>Não foi possível carregar agora. <button type="button" className="fx-btn ghost small" onClick={onRetry}>Tentar de novo</button></p>
      ) : !panel ? <Loader2 className="animate-spin" aria-label="Carregando" style={{ marginTop: 16 }} /> : view === 'dep' ? (
        panel.departments.length === 0 ? <p className="fx-muted" style={{ margin: '14px 0 0' }}>Ainda sem vendas neste período.</p> : (
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {panel.departments.map((d) => (
              <li key={d.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', whiteSpace: 'nowrap' }}><b className="fx-num">{formatMoney(d.revenue)}</b><Delta change={d.change} /></span>
                </div>
                <div aria-hidden="true" style={{ height: 6, borderRadius: 6, background: 'var(--fx-ground-2)', marginTop: 5 }}>
                  <div style={{ width: `${Math.max(d.share * 100, 1)}%`, height: '100%', borderRadius: 6, background: 'var(--fx-green)' }} />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        panel.topProducts.length === 0 ? <p className="fx-muted" style={{ margin: '14px 0 0' }}>Ainda sem vendas neste período.</p> : (
          <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>
            {panel.topProducts.map((p) => <ProductMoveRow key={p.productId} p={p} />)}
          </ul>
        )
      )}
    </Card>
  );
};

export default Dashboard;
