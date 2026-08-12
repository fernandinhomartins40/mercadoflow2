import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageHeader from '../components/layout/PageHeader';
import ProductImage from '../components/product/ProductImage';
import { Section, Empty, StatGrid, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { OpportunityItem, OutcomesResponse, RecommendationItem } from '../types/analytics.types';
import {
  AlertTriangle, TrendingDown, TrendingUp, Package, Tag as TagIcon,
  RefreshCw, Sparkles, ArrowRight, Check, X, ChevronDown, DollarSign,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmt = {
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0)),
  int: (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0)),
  date: (v?: string | null) => {
    if (!v) return '--';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
  },
};

/* ─── Vocabulário do supermercadista ─── */
const TYPE_CONFIG: Record<string, { label: string; icon: React.FC<any>; tone: string }> = {
  OPORTUNIDADE_DE_COMPRA:   { label: 'Comprar',            icon: Package,       tone: 'green' },
  RISCO_DE_RUPTURA:         { label: 'Risco de ruptura',   icon: AlertTriangle, tone: 'amber' },
  QUEDA_DE_VENDAS:          { label: 'Queda de vendas',    icon: TrendingDown,  tone: 'red' },
  CRESCIMENTO_DE_VENDAS:    { label: 'Crescimento',        icon: TrendingUp,    tone: 'green' },
  PRODUTO_EM_DECLINIO:      { label: 'Em declínio',        icon: TrendingDown,  tone: 'red' },
  CAPITAL_PARADO:           { label: 'Capital parado',     icon: DollarSign,    tone: 'red' },
  EXCESSO_DE_ESTOQUE:       { label: 'Excesso de estoque', icon: Package,       tone: 'amber' },
  PRODUTO_TRACIONADOR:      { label: 'Tracionador',        icon: Sparkles,      tone: 'green' },
  OPORTUNIDADE_DE_PROMOCAO: { label: 'Promoção',           icon: TagIcon,       tone: 'blue' },
  OPORTUNIDADE_DE_COMBO:    { label: 'Combo',              icon: Sparkles,      tone: 'blue' },
  PRECO_ACIMA_DO_MERCADO:   { label: 'Preço alto',         icon: DollarSign,    tone: 'amber' },
  ANOMALIA_DE_VENDAS:       { label: 'Anomalia',           icon: AlertTriangle, tone: 'amber' },
  ATENCAO:                  { label: 'Atenção',            icon: AlertTriangle, tone: 'slate' },
};

const ACTION_LABEL: Record<string, string> = {
  COMPRAR: 'Comprar',
  PROMOVER: 'Promover',
  LIQUIDAR: 'Liquidar',
  AJUSTAR_PRECO: 'Ajustar preço',
  REPOSICIONAR: 'Reposicionar',
  INVESTIGAR: 'Investigar',
};

const TONE: Record<string, { bg: string; border: string; text: string }> = {
  red:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  amber: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  green: { bg: 'var(--surface-success)', border: 'var(--border-success)', text: 'var(--brand-700)' },
  blue:  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  slate: { bg: 'var(--surface-muted)', border: 'var(--border-soft)', text: 'var(--text-primary)' },
};

const typeConfig = (type: string) => TYPE_CONFIG[type] ?? TYPE_CONFIG.ATENCAO;
const toneOf = (type: string) => TONE[typeConfig(type).tone] ?? TONE.slate;

/* ─── Card de recomendação: o que fazer, por quê e com que confiança ─── */
const RecommendationCard: React.FC<{
  rec: RecommendationItem;
  onDecide: (id: string, decision: 'ACEITA' | 'REJEITADA') => void;
  deciding: boolean;
}> = ({ rec, onDecide, deciding }) => {
  const [showTrace, setShowTrace] = useState(false);
  const tone = TONE.blue;

  return (
    <article
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
    >
      <div className="flex items-start gap-3">
        {rec.productImage ? (
          <ProductImage
            src={rec.productImage}
            alt={rec.productName || ''}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className="w-fit rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
          >
            {ACTION_LABEL[rec.actionType] || rec.actionType}
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {rec.title}
          </p>
          {rec.rationale ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
              {rec.rationale}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-soft)' }}>
        {rec.expectedImpactValue ? (
          <span>Impacto estimado: <strong style={{ color: tone.text }}>{fmt.money(rec.expectedImpactValue)}</strong></span>
        ) : null}
        {rec.confidence != null ? (
          <span>Confiança: <strong>{(Number(rec.confidence) * 100).toFixed(0)}%</strong></span>
        ) : null}
      </div>

      {/* O cálculo aberto é o que permite discordar com fundamento. */}
      {rec.calculationTrace ? (
        <div>
          <button
            type="button"
            onClick={() => setShowTrace((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--brand-700)' }}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: showTrace ? 'rotate(180deg)' : 'none' }}
            />
            Como chegamos nesse número
          </button>
          {showTrace ? (
            <pre
              className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-[0.7rem] leading-relaxed"
              style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
            >
              {rec.calculationTrace}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(rec.id, 'ACEITA')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--brand-500)', color: '#fff' }}
        >
          <Check className="h-3.5 w-3.5" /> Aceitar
        </button>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(rec.id, 'REJEITADA')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-soft)' }}
        >
          <X className="h-3.5 w-3.5" /> Não faz sentido
        </button>
      </div>
    </article>
  );
};

/* ─── O que o plano não destrava ─── */
const LockedCard: React.FC<{
  locked: { porTipo: Record<string, number>; total: number; impacto: number | null };
}> = ({ locked }) => (
  <Link
    to="/app/planos"
    className="flex flex-col gap-2 rounded-xl p-4 transition hover:opacity-90"
    style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-muted)' }}
  >
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {locked.total === 1
          ? '1 oportunidade que antecipa o que vem'
          : `${fmt.int(locked.total)} oportunidades que antecipam o que vem`}
      </p>
    </div>

    {/* Por tipo: dizer QUAL análise falta é mais concreto que um total. */}
    <div className="flex flex-wrap gap-2">
      {Object.entries(locked.porTipo).map(([type, count]) => (
        <span
          key={type}
          className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium"
          style={{
            background: 'var(--surface-base)',
            border: '1px solid var(--border-soft)',
            color: 'var(--text-soft)',
          }}
        >
          {count}× {typeConfig(type).label}
        </span>
      ))}
    </div>

    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
      Risco de ruptura, sugestão de compra por previsão e produtos que puxam a
      venda de outros fazem parte dos planos pagos.
      {locked.impacto ? (
        <> O impacto estimado do que está aqui é de <strong>{fmt.money(locked.impacto)}</strong>.</>
      ) : null}
    </p>

    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>
      Ver planos <ArrowRight className="h-3.5 w-3.5" />
    </span>
  </Link>
);

/* ─── Card de oportunidade ─── */
const OpportunityCard: React.FC<{
  opp: OpportunityItem;
  onDismiss: (id: string) => void;
}> = ({ opp, onDismiss }) => {
  const cfg = typeConfig(opp.type);
  const tone = toneOf(opp.type);
  const Icon = cfg.icon;

  return (
    <article
      className="flex gap-4 rounded-xl p-4"
      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
    >
      {opp.productImage ? (
        <ProductImage
          src={opp.productImage}
          alt={opp.productName || ''}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
          style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
        >
          <Icon className="h-6 w-6" style={{ color: tone.text }} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
          >
            {cfg.label}
          </span>
          {opp.status === 'EM_ACAO' ? (
            <span className="text-[0.68rem] font-medium" style={{ color: 'var(--brand-700)' }}>
              Em acompanhamento
            </span>
          ) : null}
          {/* Persistência é sinal: o que volta toda semana pesa mais. */}
          {opp.detectionCount > 3 ? (
            <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
              detectada {opp.detectionCount}× desde {fmt.date(opp.firstDetectedAt)}
            </span>
          ) : null}
        </div>

        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {opp.title}
        </p>
        {opp.description ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
            {opp.description}
          </p>
        ) : null}
        {/*
          Leitura da IA que o mercado configurou. Vem marcada porque o usuário
          tem direito de distinguir o que um modelo escreveu do que o sistema
          calculou — e só aparece quando existe: sem chave, o card fica
          exatamente como era antes.
        */}
        {opp.aiInsight ? (
          <div
            className="flex gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand-500)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {opp.aiInsight}
            </p>
          </div>
        ) : null}
        {opp.expectedImpactValue ? (
          <p className="text-xs font-medium" style={{ color: tone.text }}>
            Impacto estimado: {fmt.money(opp.expectedImpactValue)}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => onDismiss(opp.id)}
          title="Descartar — não é relevante"
          className="rounded-lg p-1.5"
          style={{ color: 'var(--text-soft)' }}
        >
          <X className="h-4 w-4" />
        </button>
        {opp.productId ? (
          <Link to={`/app/produtos/${opp.productId}`} style={{ color: 'var(--text-soft)' }}>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </article>
  );
};

/* ─── Tela ─── */
type Tab = 'recomendacoes' | 'oportunidades' | 'historico' | 'resultados';

const IntelligenceCenter: React.FC = () => {
  const { marketId } = useAuth();

  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  /**
   * O que o plano não deixa ver, contado por tipo.
   *
   * Mostrado, não escondido: "3 riscos de ruptura detectados" é um argumento
   * concreto sobre a loja do usuário. Um recurso oculto não gera desejo porque
   * ele nem sabe que existe.
   */
  const [locked, setLocked] = useState<{
    porTipo: Record<string, number>;
    total: number;
    impacto: number | null;
  }>({ porTipo: {}, total: 0, impacto: null });
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [history, setHistory] = useState<RecommendationItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('recomendacoes');

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    setError(null);
    try {
      const [opps, recs, hist, outc] = await Promise.all([
        marketService.getOpportunities(marketId),
        marketService.getPendingRecommendations(marketId),
        marketService.getDecisionHistory(marketId),
        marketService.getOutcomes(marketId).catch(() => null),
      ]);
      setOpportunities(opps?.oportunidades || []);
      setLocked({
        porTipo: opps?.bloqueadasPorTipo || {},
        total: opps?.totalBloqueadas || 0,
        impacto: opps?.impactoBloqueado ?? null,
      });
      setRecommendations(recs || []);
      setHistory(hist || []);
      setOutcomes(outc);

      // Marca como vistas as que estavam NOVA — o sistema passa a saber o que
      // o usuário já conhece, e o feed para de repetir novidade velha.
      const novas = (opps?.oportunidades || []).filter((o: OpportunityItem) => o.status === 'NOVA');
      if (novas.length > 0) {
        marketService
          .markOpportunitiesSeen(marketId, novas.map((o: OpportunityItem) => o.id))
          .catch(() => undefined);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível carregar as oportunidades.');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const handleDetect = async () => {
    if (!marketId) return;
    setDetecting(true);
    try {
      await marketService.detectOpportunitiesNow(marketId);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível atualizar agora.');
    } finally {
      setDetecting(false);
    }
  };

  const handleDecide = async (id: string, decision: 'ACEITA' | 'REJEITADA') => {
    if (!marketId) return;
    setDeciding(id);
    try {
      await marketService.decideRecommendation(marketId, id, decision);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível registrar a decisão.');
    } finally {
      setDeciding(null);
    }
  };

  const handleDismiss = async (id: string) => {
    if (!marketId) return;
    try {
      await marketService.dismissOpportunity(marketId, id);
      await load();
    } catch {
      setError('Não foi possível descartar.');
    }
  };

  const totalImpact = useMemo(
    () => recommendations.reduce((sum, r) => sum + Number(r.expectedImpactValue || 0), 0),
    [recommendations],
  );

  const accepted = useMemo(
    () => history.filter((r) => r.status === 'ACEITA' || r.status === 'EXECUTADA').length,
    [history],
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'recomendacoes', label: 'O que fazer', count: recommendations.length },
    { key: 'oportunidades', label: 'O que está acontecendo', count: opportunities.length },
    { key: 'historico', label: 'Decisões tomadas', count: history.length },
    { key: 'resultados', label: 'No que deu', count: outcomes?.resultados?.length || 0 },
  ];

  return (
    <Layout>
      <PageHeader
        title="Central de Inteligência"
        subtitle="O que está acontecendo na sua loja e o que fazer a respeito."
        actions={
          <button
            type="button"
            onClick={handleDetect}
            disabled={detecting || loading}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${detecting ? 'animate-spin' : ''}`} />
            {detecting ? 'Analisando...' : 'Analisar agora'}
          </button>
        }
      />

      <div className="flex flex-col gap-6">
        <StatGrid>
          <Stat label="Aguardando sua decisão" value={fmt.int(recommendations.length)} />
          <Stat
            label="Impacto estimado"
            value={fmt.money(totalImpact)}
            sub="Soma das recomendações pendentes"
          />
          <Stat label="Oportunidades abertas" value={fmt.int(opportunities.length)} />
          <Stat label="Decisões tomadas" value={fmt.int(accepted)} sub={`${history.length} no total`} />
        </StatGrid>

        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                tab === t.key
                  ? { background: 'var(--brand-500)', color: '#fff' }
                  : { background: 'var(--surface-muted)', color: 'var(--text-soft)' }
              }
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {error ? (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
          >
            {error}
          </div>
        ) : null}

        {tab === 'recomendacoes' ? (
          <Section
            kicker="Recomendações"
            title="O que fazer agora"
            subtitle="Cada sugestão mostra o cálculo por trás. Aceitar ou recusar ensina o sistema."
          >
            {loading ? (
              <Empty>Carregando...</Empty>
            ) : recommendations.length === 0 ? (
              <Empty>
                Nenhuma recomendação pendente. Use "Analisar agora" para procurar oportunidades
                com os dados mais recentes.
              </Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {recommendations.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={r}
                    onDecide={handleDecide}
                    deciding={deciding === r.id}
                  />
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {tab === 'oportunidades' ? (
          <Section
            kicker="Feed priorizado"
            title="O que merece sua atenção"
            subtitle="Alertas, capital de giro, promoções e sinais de venda reunidos e ordenados."
          >
            {loading ? (
              <Empty>Carregando...</Empty>
            ) : opportunities.length === 0 ? (
              <Empty>
                Nenhuma oportunidade aberta. Isso pode significar que está tudo em ordem — ou que
                ainda não há vendas suficientes registradas para gerar análise.
              </Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {opportunities.map((o) => (
                  <OpportunityCard key={o.id} opp={o} onDismiss={handleDismiss} />
                ))}
              </div>
            )}

            {/* O que o plano não deixa ver, contado. Mostrar é mais eficaz que
                esconder: o número é sobre a loja dele, não sobre o produto. */}
            {locked.total > 0 ? <LockedCard locked={locked} /> : null}
          </Section>
        ) : null}

        {tab === 'resultados' ? (
          <div className="flex flex-col gap-6">
            {/* A acurácia do modelo importa mesmo sem decisão nenhuma: se a
                previsão erra, toda sugestão de compra erra junto. */}
            {outcomes?.acuraciaPrevisao ? (
              <Section
                kicker="Previsão de demanda"
                title="O modelo está acertando?"
                subtitle="Comparação entre o que foi previsto e o que de fato vendeu."
              >
                <StatGrid cols={3}>
                  <Stat
                    label="Erro médio (MAPE)"
                    value={
                      outcomes.acuraciaPrevisao.mape != null
                        ? `${Number(outcomes.acuraciaPrevisao.mape).toFixed(0)}%`
                        : '--'
                    }
                    variant={
                      outcomes.acuraciaPrevisao.mape == null ? 'default'
                        : Number(outcomes.acuraciaPrevisao.mape) < 35 ? 'success'
                        : Number(outcomes.acuraciaPrevisao.mape) < 60 ? 'warning' : 'danger'
                    }
                  />
                  <Stat
                    label="Previsões aferidas"
                    value={fmt.int(outcomes.acuraciaPrevisao.observations)}
                    sub={`${fmt.int(outcomes.acuraciaPrevisao.products)} produtos`}
                  />
                  <Stat
                    label="Dentro do intervalo"
                    value={
                      outcomes.acuraciaPrevisao.confidenceIntervalCoverage != null
                        ? `${Number(outcomes.acuraciaPrevisao.confidenceIntervalCoverage).toFixed(0)}%`
                        : '--'
                    }
                    sub="Ideal próximo de 90%"
                  />
                </StatGrid>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                  {outcomes.acuraciaPrevisao.interpretation}
                </p>
              </Section>
            ) : null}

            <Section
              kicker="Resultado das decisões"
              title="No que deu o que você decidiu"
              subtitle="Cada decisão aceita é medida 30 dias depois, contra a situação congelada no dia da escolha."
            >
              {loading ? (
                <Empty>Carregando...</Empty>
              ) : !outcomes?.resultados?.length ? (
                <Empty>
                  Nenhum resultado medido ainda. As decisões aceitas são avaliadas 30 dias
                  depois — é o tempo necessário para o efeito aparecer nas vendas.
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {outcomes.resultados.map((o) => {
                    const tone = o.verdict === 'ACERTOU' ? TONE.green
                      : o.verdict === 'ERROU' ? TONE.red
                      : o.verdict === 'PARCIAL' ? TONE.amber : TONE.slate;
                    return (
                      <article
                        key={o.id}
                        className="flex flex-col gap-2 rounded-xl p-4"
                        style={{ border: '1px solid var(--border-soft)' }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
                            style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
                          >
                            {o.verdict === 'ACERTOU' ? 'Funcionou'
                              : o.verdict === 'PARCIAL' ? 'Parcial'
                              : o.verdict === 'ERROU' ? 'Não funcionou'
                              : 'Sem dados'}
                          </span>
                          <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
                            {ACTION_LABEL[o.actionType] || o.actionType} · medido em {fmt.date(o.measuredAt)}
                          </span>
                        </div>

                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {o.recommendationTitle}
                        </p>
                        {o.notes ? (
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                            {o.notes}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'historico' ? (
          <Section
            kicker="Histórico"
            title="Decisões que você tomou"
            subtitle="O registro do que foi aceito e recusado — base para medir o que funcionou."
          >
            {loading ? (
              <Empty>Carregando...</Empty>
            ) : history.length === 0 ? (
              <Empty>Nenhuma decisão registrada ainda.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((r) => {
                  const aceita = r.status === 'ACEITA' || r.status === 'EXECUTADA';
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-lg px-4 py-3"
                      style={{ border: '1px solid var(--border-soft)' }}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: aceita ? TONE.green.bg : TONE.slate.bg }}
                      >
                        {aceita
                          ? <Check className="h-4 w-4" style={{ color: TONE.green.text }} />
                          : <X className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {r.title}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-soft)' }}>
                          {aceita ? 'Aceita' : 'Recusada'} em {fmt.date(r.decidedAt)}
                          {r.decidedBy ? ` por ${r.decidedBy}` : ''}
                        </p>
                      </div>
                      {r.expectedImpactValue ? (
                        <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--text-soft)' }}>
                          {fmt.money(r.expectedImpactValue)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        ) : null}
      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
