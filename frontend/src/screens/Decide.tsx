import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, History, Inbox, Loader2, Lock, Pause, Play, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { ActionHub, Card, Chip, PageHero, PanelTitle, Pager, PillTabs, Thumb, usePaged } from '../components/flow/Flow';
import RecommendationDesk from '../components/intelligence/RecommendationDesk';
import CostCoverageCard from '../components/intelligence/CostCoverageCard';
import { goesToOrder } from '../components/intelligence/RecommendationCard';
import DecisionFeedback from '../components/intelligence/DecisionFeedback';
import CapitalPlanTab from '../components/capital/CapitalPlanTab';
import PromoIntelligenceTab from '../components/promo/PromoIntelligenceTab';
import { useAuth } from '../context/AuthContext';
import { useRecommendationDecision } from '../hooks/useRecommendationDecision';
import { useShoppingList } from '../hooks/useShoppingList';
import { marketService } from '../services/market.service';
import { copilotAgentsService, type CopilotDecision } from '../services/aiPlatform.service';
import { formatMoney } from '../utils/formatters';
import DecisionDesk from './copilot/DecisionDesk';
import { SuggestionsPanel } from './comprar/BuyDesk';
import HowItWorks from './copilot/HowItWorks';
import { agentOf } from './copilot/shared';
import { GROUP_LABEL, useDecisionQueue, type QueueGroup, type QueueItem } from './decidir/queue';
import OpportunityPanel, { SIGNAL_LABEL } from './decidir/OpportunityPanel';
import Results from './decidir/Results';
import type { OpportunityItem } from '../types/analytics.types';

/**
 * Decidir: uma fila só com tudo que pede uma decisão do dono, do que vale
 * mais para o que vale menos. Cada item em 3 passos: ver (a linha), entender
 * (o painel ao lado, com o cálculo) e agir (aceitar, ajustar ou recusar).
 * Substitui Copiloto, Todas as decisões, Comprar/Decidir agora, Produtos/
 * Pedem atenção e Promoções/O que promover.
 */

const ATTENTION_TYPES = new Set(['ANOMALIA_DE_VENDAS', 'VIZINHANCA_ABAIXO_DO_CUSTO', 'QUEDA_DE_VENDAS', 'RISCO_DE_RUPTURA']);

type Tab = 'decidir' | 'resultado';
type Filter = 'tudo' | QueueGroup;

const FILTER_ORDER: Filter[] = ['tudo', 'comprar', 'promover', 'capital', 'preco', 'entregas', 'outros'];

const Decide: React.FC = () => {
  const { marketId } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'resultado' ? 'resultado' : 'decidir';
  const filter = (FILTER_ORDER.includes(params.get('filtro') as Filter) ? params.get('filtro') : 'tudo') as Filter;
  const queue = useDecisionQueue(marketId);
  const [signals, setSignals] = useState<OpportunityItem[]>([]);
  const [locked, setLocked] = useState<{ total: number; impacto: number | null }>({ total: 0, impacto: null });
  const [selected, setSelected] = useState<string | null>(params.get('item'));
  const [config, setConfig] = useState(params.get('config') === '1');
  const [paused, setPaused] = useState(false);
  const [anyAlone, setAnyAlone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { addItem } = useShoppingList();

  const setParam = (key: string, value: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value == null) next.delete(key); else next.set(key, value);
    next.delete('item');
    return next;
  }, { replace: true });

  const loadSignals = useCallback(async () => {
    if (!marketId) return;
    const feed = await marketService.getOpportunities(marketId).catch(() => null);
    if (!feed) return;
    setSignals(feed.oportunidades || []);
    setLocked({ total: feed.totalBloqueadas || 0, impacto: feed.impactoBloqueado ?? null });
    const novas = (feed.oportunidades || []).filter((o) => o.status === 'NOVA');
    if (novas.length) marketService.markOpportunitiesSeen(marketId, novas.map((o) => o.id)).catch(() => undefined);
  }, [marketId]);

  useEffect(() => { loadSignals(); }, [loadSignals]);
  useEffect(() => {
    if (!marketId) return;
    copilotAgentsService.agents(marketId).then((r) => { setPaused(r.pausado); setAnyAlone(r.agentes.some((a) => a.level === 3)); }).catch(() => {});
  }, [marketId]);

  const reloadAll = useCallback(async () => { await Promise.all([queue.reload(), loadSignals()]); }, [queue, loadSignals]);
  const { deciding, feedback, setFeedback, error, decide } = useRecommendationDecision(marketId, queue.recs, reloadAll);

  // Sinais sem ação pronta (venda subindo, anomalia): entram como "Atenção".
  const withRec = useMemo(() => new Set(queue.recs.map((r) => r.opportunityId)), [queue.recs]);
  // Só alertas de verdade entram em "Atenção" (F0): queda de venda e vizinhança abaixo do custo.
  // Oportunidade de capital sem recomendação é dado insuficiente, não alerta.
  const attention: QueueItem[] = useMemo(() => signals
    .filter((o) => o.status !== 'EM_ACAO' && !withRec.has(o.id) && ATTENTION_TYPES.has(o.type)
      && !(o.type === 'ANOMALIA_DE_VENDAS' && Number(o.evidence?.desvioPercent ?? -1) > 0))
    .map((o) => ({
      key: `sinal:${o.id}`, source: 'rec' as const, group: 'outros' as const, action: SIGNAL_LABEL[o.type] ?? 'Atenção',
      title: o.title, value: o.expectedImpactValue ? Number(o.expectedImpactValue) : null, name: o.productName || o.title,
      image: o.productImage, urgent: false,
    })), [signals, withRec]);

  const all = useMemo(() => [...queue.items, ...attention], [queue.items, attention]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { tudo: all.length };
    all.forEach((i) => { c[i.group] = (c[i.group] ?? 0) + 1; });
    return c;
  }, [all]);
  // Em Comprar, a primeira linha põe todas as compras sugeridas no pedido de uma vez.
  const buySugs = useMemo(() => queue.recs.filter(goesToOrder), [queue.recs]);
  const batch: QueueItem | null = buySugs.length >= 2 ? {
    key: 'lote:comprar', source: 'rec', group: 'comprar', action: 'Comprar',
    title: `Pôr as ${buySugs.length} compras no pedido de uma vez`, name: 'Compras', urgent: false,
    value: buySugs.reduce((a, r) => a + Number(r.expectedImpactValue || 0), 0) || null,
  } : null;
  const list = filter === 'tudo' ? all : [...(filter === 'comprar' && batch ? [batch] : []), ...all.filter((i) => i.group === filter)];
  const current = list.find((i) => i.key === selected) ?? list[0] ?? null;
  // Fila longa em páginas: a lista não empurra o painel ao lado para fora da tela.
  // "Hoje": as 7 que mais valem; o resto fica em "Depois", recolhido (F3).
  const [showLater, setShowLater] = useState(false);
  useEffect(() => { setShowLater(false); }, [filter]);
  const TODAY = 7;
  const later = list.slice(TODAY);
  const paged = usePaged(later, 12, filter);
  // Celular: o detalhe abre numa folha por cima da lista.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const idx = selected ? list.findIndex((i) => i.key === selected) : -1;
    if (idx >= TODAY) {
      setShowLater(true);
      const i = idx - TODAY;
      if (Math.floor(i / paged.size) !== paged.page) paged.setPage(Math.floor(i / paged.size));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, list.length]);
  const goPage = (n: number) => {
    paged.setPage(n);
    document.getElementById('decidir-lista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const decisions = queue.items.length;

  // Quem chega do Início com ?item= abre direto naquele item, e a lista rola até ele no celular.
  useEffect(() => {
    const it = params.get('item');
    if (it) setSelected(it);
  }, [params]);

  const check = async () => {
    if (!marketId) return;
    setChecking(true);
    setNote(null);
    try {
      const [r] = await Promise.all([copilotAgentsService.run(marketId), marketService.detectOpportunitiesNow(marketId).catch(() => null)]);
      await reloadAll();
      setNote(r.created > 0 ? `${r.created} ${r.created === 1 ? 'novidade' : 'novidades'} para você.` : 'Nada novo agora.');
    } catch {
      setNote('Não foi possível verificar agora.');
    } finally {
      setChecking(false);
    }
  };

  const togglePause = async () => {
    if (!marketId) return;
    const r = await copilotAgentsService.pause(marketId, !paused);
    setPaused(r.pausado);
    setNote(r.pausado ? 'Pausado: o Tino não faz nada sozinho até você retomar.' : 'Retomado.');
  };

  const onTinoDecided = (d: CopilotDecision) => {
    queue.setTino((cur) => cur.map((x) => (x.id === d.id ? d : x)));
  };

  const dismiss = async (id: string) => {
    if (!marketId) return;
    await marketService.dismissOpportunity(marketId, id).catch(() => undefined);
    await loadSignals();
  };

  const pick = (key: string) => {
    setSelected(key);
    if (window.innerWidth < 1100) setSheet(true);
  };

  const renderRows = (items: QueueItem[]) => (
    <>
      {items.map((it) => {
                    const on = current?.key === it.key;
                    const Icon = it.decision ? agentOf(it.decision).icon : null;
                    return (
                      <li key={it.key}>
                        <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined} onClick={() => pick(it.key)}>
                          {it.key === 'lote:comprar' ? <span className="fx-icon-tile" style={{ width: 46, height: 46 }}><ClipboardList aria-hidden="true" /></span>
                            : Icon ? <span className="fx-icon-tile" style={{ width: 46, height: 46, ...(it.urgent ? { background: 'var(--fx-red-soft)', color: 'var(--fx-red)' } : {}) }}><Icon aria-hidden="true" /></span>
                            : <Thumb name={it.name} src={it.image} size={46} />}
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <b style={{ display: 'block', fontSize: 15, lineHeight: 1.3 }}>{it.title}</b>
                            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
                              <span className="fx-muted" style={{ fontSize: 13 }}>{[it.title.startsWith(GROUP_LABEL[it.group]) ? '' : GROUP_LABEL[it.group], it.rec && goesToOrder(it.rec) ? 'vai ao pedido' : ''].filter(Boolean).join(' · ')}</span>
                              {it.urgent && <Chip tone="red">Urgente</Chip>}
                              {it.source === 'tino' && <Chip tone="lime">Tino preparou</Chip>}
                            </span>
                          </span>
                          {it.value != null && <b className="fx-num" style={{ fontSize: 15.5, whiteSpace: 'nowrap' }}>{formatMoney(it.value)}</b>}
                        </button>
                      </li>
                    );
                  })}
    </>
  );

  const hub = (
    <ActionHub icon={Sparkles} label="Ações do Decidir" actions={[
      { label: checking ? 'Verificando…' : 'Verificar agora', icon: RefreshCw, onClick: check },
      { label: 'Como o Tino trabalha', icon: Settings2, onClick: () => setConfig(true) },
    ]} />
  );

  const detail = (it: QueueItem) => {
    if (!marketId) return null;
    if (it.key === 'lote:comprar') return <SuggestionsPanel key="lote" marketId={marketId} suggestions={buySugs} onChanged={reloadAll} />;
    if (it.decision) return <DecisionDesk key={it.key} marketId={marketId} decision={it.decision} onDecided={onTinoDecided} />;
    if (it.rec) return <RecommendationDesk key={it.key} rec={it.rec} marketId={marketId} deciding={deciding === it.rec.id} onDecide={decide} />;
    const opp = signals.find((o) => `sinal:${o.id}` === it.key);
    return opp ? <OpportunityPanel key={it.key} marketId={marketId} opp={opp} onDismiss={dismiss} /> : null;
  };

  return (
    <Layout>
      <PageHero
        title={tab === 'resultado' ? <>No que deu o que <mark>você decidiu.</mark></>
          : queue.loading ? <>Decidir.</>
            : decisions === 0 ? <>Nada esperando <mark>você.</mark></>
              : <>A loja pede <mark>{decisions} {decisions === 1 ? 'decisão.' : 'decisões.'}</mark></>}
        subtitle={tab === 'decidir' && queue.total > 0 ? `${formatMoney(queue.total)} de ganho possível. Nada acontece sem o seu sim.` : undefined}
        side={hub}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <PillTabs<Tab> label="Decidir" value={tab} onChange={(t) => setParam('aba', t === 'resultado' ? 'resultado' : null)}
          tabs={[{ key: 'decidir', label: 'Para decidir', icon: Inbox, count: decisions }, { key: 'resultado', label: 'No que deu', icon: History }]} />
        {anyAlone && (
          <button type="button" className={`fx-btn small ${paused ? 'dark' : 'ghost'}`} onClick={togglePause} aria-pressed={paused}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? 'Retomar o que o Tino faz sozinho' : 'Pausar o que o Tino faz sozinho'}
          </button>
        )}
      </div>
      {note && <p role="status" className="fx-muted" style={{ margin: 0 }}>{note}</p>}
      {error && <p role="alert" className="fx-chip red" style={{ whiteSpace: 'normal', padding: '10px 14px' }}>{error}</p>}
      {feedback && marketId && <DecisionFeedback feedback={feedback} marketId={marketId} onChange={setFeedback} onUndone={reloadAll} />}

      {tab === 'resultado' && marketId && <Results marketId={marketId} />}

      {tab === 'decidir' && (
        <>
          <div className="fx-filters" role="group" aria-label="Filtrar decisões">
            {FILTER_ORDER.filter((f) => f === 'tudo' || f === 'capital' || f === 'promover' || (counts[f] ?? 0) > 0).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setParam('filtro', f === 'tudo' ? null : f)}>
                {f === 'tudo' ? 'Tudo' : GROUP_LABEL[f]}{(counts[f] ?? 0) > 0 ? ` (${counts[f]})` : ''}
              </button>
            ))}
          </div>

          {(filter === 'tudo' || filter === 'promover' || filter === 'capital' || filter === 'comprar') && <CostCoverageCard marketId={marketId} compact />}

          {queue.loading ? <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card> : list.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 36 }}>
              <CheckCircle2 size={36} style={{ color: 'var(--fx-green)' }} aria-hidden="true" />
              <h2 className="fx-section-title" style={{ marginTop: 10 }}>
                {filter === 'capital' ? 'Nenhum produto encalhando entre os que têm estoque medido'
                  : `Nada para decidir ${filter === 'tudo' ? 'agora' : `em ${GROUP_LABEL[filter as QueueGroup].toLowerCase()}`}`}
              </h2>
              {filter === 'capital' && <p className="fx-muted" style={{ margin: '6px 0 0' }}>Produto sem estoque medido não entra aqui: <Link to="/app/contar">conte o estoque</Link> ou confira as notas no Confere.</p>}
            </Card>
          ) : (
            <div className="fx-split">
              <Card as="section" aria-label="Decisões" id="decidir-lista" style={{ scrollMarginTop: 80 }}>
                <ul className="fx-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
                  {renderRows(list.slice(0, TODAY))}
                </ul>
                {later.length > 0 && !showLater && (
                  <button type="button" className="fx-btn ghost small" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => setShowLater(true)}>
                    Ver as outras {later.length} {later.length === 1 ? 'decisão' : 'decisões'} (valem menos)
                  </button>
                )}
                {later.length > 0 && showLater && (
                  <>
                    <p className="fx-muted" style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700 }}>Depois</p>
                    <ul className="fx-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
                      {renderRows(paged.slice)}
                    </ul>
                    <Pager page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={goPage} label="decisões" />
                  </>
                )}
                {filter === 'tudo' && locked.total > 0 && (
                  <Link to="/app/assinatura" className="fx-row" style={{ marginTop: 10, color: 'var(--fx-ink)', borderStyle: 'dashed' }}>
                    <span className="fx-icon-tile" style={{ width: 40, height: 40 }}><Lock aria-hidden="true" /></span>
                    <span style={{ flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 14.5 }}>Mais {locked.total} {locked.total === 1 ? 'oportunidade' : 'oportunidades'} nos planos pagos</b>
                      <span className="fx-muted" style={{ fontSize: 13 }}>{locked.impacto ? `${formatMoney(locked.impacto)} de ganho possível · ` : ''}risco de faltar e previsão de compra</span>
                    </span>
                  </Link>
                )}
              </Card>
              {!narrow && <div id="decidir-painel" key={current?.key} className="fx-sticky" style={{ minWidth: 0, scrollMarginTop: 80 }}>{current && detail(current)}</div>}
            </div>
          )}

          {/* Ferramentas que respondem ao mesmo filtro: onde pôr o dinheiro e o que promover. */}
          {marketId && filter === 'capital' && (
            <Card>
              <PanelTitle title="Onde investir a próxima compra" sub="O que gira e o que está parado, para o dinheiro render mais" />
              <div style={{ marginTop: 14 }}>
                <CapitalPlanTab marketId={marketId} onAddToList={async (productId, units, reason) => {
                  await addItem({ productId, quantityTarget: Math.max(1, Math.round(units)), sourceTag: 'RESTOCK', reasonSummary: reason });
                  setNote('Foi para a lista de compras. Ela vira pedido em Comprar.');
                }} />
              </div>
            </Card>
          )}
          {marketId && filter === 'promover' && (
            <Card>
              <PanelTitle title="O que vale promover" sub="Pela venda e pelo preço de cada produto na sua loja" />
              <div style={{ marginTop: 14 }}>
                <PromoIntelligenceTab marketId={marketId} onCreateCampaign={() => navigate('/app/promocoes?nova=1')} />
              </div>
            </Card>
          )}
        </>
      )}

      {narrow && sheet && current && (
        <div className="fx-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Decisão" onClick={() => setSheet(false)}>
          <div className="fx-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fx-sheet-bar">
              <b style={{ fontSize: 15 }}>Decisão</b>
              <button type="button" className="fx-btn ghost small" onClick={() => setSheet(false)}>Fechar</button>
            </div>
            {detail(current)}
          </div>
        </div>
      )}

      {config && marketId && <HowItWorks marketId={marketId} onClose={() => { setConfig(false); setParam('config', null); }} onAloneChange={setAnyAlone} />}
    </Layout>
  );
};

export default Decide;
