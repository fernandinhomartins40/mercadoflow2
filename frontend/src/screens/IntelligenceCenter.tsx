import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageHeader from '../components/layout/PageHeader';
import ProductImage from '../components/product/ProductImage';
import { Section, Empty, StatGrid, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { marketService } from '../services/market.service';
import { IntelligenceFeed, Opportunity } from '../types/analytics.types';
import {
  AlertTriangle, TrendingDown, TrendingUp, Package,
  Tag as TagIcon, RefreshCw, Sparkles, ArrowRight,
} from 'lucide-react';

/* ─── Formatadores ─── */
const fmt = {
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0)),
  int: (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0)),
};

/* ─── Vocabulário de oportunidade ─── */
const TYPE_CONFIG: Record<string, { label: string; icon: React.FC<any>; tone: string }> = {
  RISCO_DE_RUPTURA:         { label: 'Risco de ruptura',     icon: AlertTriangle, tone: 'amber' },
  QUEDA_DE_VENDAS:          { label: 'Queda de vendas',      icon: TrendingDown,  tone: 'red' },
  CRESCIMENTO_DE_VENDAS:    { label: 'Crescimento',          icon: TrendingUp,    tone: 'green' },
  PRODUTO_EM_DECLINIO:      { label: 'Em declínio',          icon: TrendingDown,  tone: 'red' },
  CAPITAL_PARADO:           { label: 'Capital parado',       icon: Package,       tone: 'red' },
  EXCESSO_DE_ESTOQUE:       { label: 'Excesso de estoque',   icon: Package,       tone: 'amber' },
  PRODUTO_TRACIONADOR:      { label: 'Tracionador',          icon: Sparkles,      tone: 'green' },
  OPORTUNIDADE_DE_PROMOCAO: { label: 'Promoção',             icon: TagIcon,       tone: 'blue' },
  OPORTUNIDADE_DE_COMBO:    { label: 'Combo',                icon: Sparkles,      tone: 'blue' },
  ATENCAO:                  { label: 'Atenção',              icon: AlertTriangle, tone: 'slate' },
};

const SOURCE_LABEL: Record<string, string> = {
  ALERTA: 'Alerta',
  CAPITAL: 'Capital de giro',
  PROMOCAO: 'Promoções',
};

const TONE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  red:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  amber: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  green: { bg: 'var(--surface-success)', border: 'var(--border-success)', text: 'var(--brand-700)' },
  blue:  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  slate: { bg: 'var(--surface-muted)', border: 'var(--border-soft)', text: 'var(--text-primary)' },
};

const typeConfig = (type: string) => TYPE_CONFIG[type] ?? TYPE_CONFIG.ATENCAO;

/* ─── Card de oportunidade ─── */
const OpportunityCard: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
  const cfg = typeConfig(opportunity.type);
  const tone = TONE_STYLE[cfg.tone] ?? TONE_STYLE.slate;
  const Icon = cfg.icon;

  const body = (
    <article
      className="flex gap-4 rounded-xl p-4 transition-shadow hover:shadow-md"
      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
    >
      {opportunity.productImage ? (
        <ProductImage src={opportunity.productImage} alt={opportunity.productName || ''} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
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
          <span className="text-[0.68rem]" style={{ color: 'var(--text-soft)' }}>
            {SOURCE_LABEL[opportunity.source] || opportunity.source}
          </span>
        </div>

        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {opportunity.title}
        </p>

        {opportunity.description ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-soft)' }}>
            {opportunity.description}
          </p>
        ) : null}

        {opportunity.estimatedImpactValue ? (
          <p className="text-xs font-medium" style={{ color: tone.text }}>
            Impacto estimado: {fmt.money(opportunity.estimatedImpactValue)}
          </p>
        ) : null}
      </div>

      {opportunity.productId ? (
        <ArrowRight className="h-4 w-4 shrink-0 self-center" style={{ color: 'var(--text-soft)' }} />
      ) : null}
    </article>
  );

  return opportunity.productId
    ? <Link to={`/app/produtos/${opportunity.productId}`} className="block">{body}</Link>
    : body;
};

/* ─── Tela ─── */
const IntelligenceCenter: React.FC = () => {
  const { marketId } = useAuth();

  const [feed, setFeed] = useState<IntelligenceFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('TODAS');

  const load = React.useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await marketService.getIntelligenceFeed(marketId, 50);
      setFeed(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível carregar as oportunidades.');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const opportunities = feed?.opportunities || [];

  const sources = useMemo(() => {
    const present = Array.from(new Set(opportunities.map((o) => o.source)));
    return ['TODAS', ...present];
  }, [opportunities]);

  const visible = useMemo(
    () => (sourceFilter === 'TODAS'
      ? opportunities
      : opportunities.filter((o) => o.source === sourceFilter)),
    [opportunities, sourceFilter]
  );

  return (
    <Layout>
      <PageHeader
        title="Central de Inteligência"
        subtitle="O que está acontecendo na sua loja e o que fazer a respeito."
        actions={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      />

      <div className="flex flex-col gap-6">
        {feed?.summary ? (
          <StatGrid>
            <Stat label="Oportunidades abertas" value={fmt.int(feed.summary.total)} />
            <Stat
              label="Impacto estimado"
              value={fmt.money(feed.summary.totalEstimatedImpact)}
              sub="Soma das oportunidades com valor calculado"
            />
            <Stat label="Alertas" value={fmt.int(feed.summary.bySource?.ALERTA || 0)} />
            <Stat label="Capital de giro" value={fmt.int(feed.summary.bySource?.CAPITAL || 0)} />
          </StatGrid>
        ) : null}

        <Section
          kicker="Feed priorizado"
          title="O que merece sua atenção agora"
          subtitle="Alertas, capital de giro e candidatos a promoção reunidos e ordenados por prioridade."
          action={
            sources.length > 2 ? (
              <div className="flex flex-wrap gap-1.5">
                {sources.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSourceFilter(s)}
                    className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                    style={
                      sourceFilter === s
                        ? { background: 'var(--brand-500)', color: '#fff' }
                        : { background: 'var(--surface-muted)', color: 'var(--text-soft)' }
                    }
                  >
                    {s === 'TODAS' ? 'Todas' : SOURCE_LABEL[s] || s}
                  </button>
                ))}
              </div>
            ) : null
          }
        >
          {loading ? (
            <Empty>Carregando oportunidades...</Empty>
          ) : error ? (
            <Empty>{error}</Empty>
          ) : visible.length === 0 ? (
            <Empty>
              Nenhuma oportunidade aberta no momento. Isso pode significar que está tudo em ordem
              — ou que ainda não há vendas suficientes registradas para gerar análise.
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
