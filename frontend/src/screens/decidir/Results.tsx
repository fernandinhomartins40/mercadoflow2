import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, Loader2, X } from 'lucide-react';
import { Card, Chip, Kpi, PanelTitle } from '../../components/flow/Flow';
import { ACTION_LABEL } from '../../components/intelligence/RecommendationCard';
import { marketService, type OutcomesSummary } from '../../services/market.service';
import { copilotAgentsService, type CopilotDecision } from '../../services/aiPlatform.service';
import { formatDecimal, formatMoney } from '../../utils/formatters';
import HistoryView from '../copilot/HistoryView';
import type { OpportunityItem, OutcomesResponse, RecommendationItem } from '../../types/analytics.types';

/**
 * "No que deu": o que está sendo acompanhado, o resultado medido 30 dias
 * depois de cada decisão aceita, o registro das recomendações e a memória do
 * que o Tino fez. Antes eram quatro lugares (Acompanhando, Decisões tomadas,
 * No que deu e o Histórico do Copiloto).
 */

const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

const VERDICT: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  ACERTOU: { label: 'Funcionou', tone: 'green' },
  PARCIAL: { label: 'Parcial', tone: 'amber' },
  ERROU: { label: 'Não funcionou', tone: 'red' },
};

const Results: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null);
  const [history, setHistory] = useState<RecommendationItem[]>([]);
  const [tracking, setTracking] = useState<OpportunityItem[]>([]);
  const [tino, setTino] = useState<CopilotDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OutcomesSummary | null>(null);

  const load = useCallback(async () => {
    marketService.getOutcomesSummary(marketId, 30).then(setSummary).catch(() => undefined);
    const [o, h, opp, dec, alone, mute] = await Promise.allSettled([
      marketService.getOutcomes(marketId),
      marketService.getDecisionHistory(marketId),
      marketService.getOpportunities(marketId),
      copilotAgentsService.inbox(marketId, 'decididas'),
      copilotAgentsService.inbox(marketId, 'sozinho'),
      copilotAgentsService.inbox(marketId, 'silenciadas'),
    ]);
    if (o.status === 'fulfilled') setOutcomes(o.value);
    if (h.status === 'fulfilled') setHistory(h.value || []);
    if (opp.status === 'fulfilled') setTracking((opp.value?.oportunidades || []).filter((x) => x.status === 'EM_ACAO'));
    const all = new Map<string, CopilotDecision>();
    [dec, alone, mute].forEach((r) => { if (r.status === 'fulfilled') r.value.decisoes.forEach((d) => all.set(d.id, d)); });
    setTino([...all.values()].sort((a, b) => new Date(b.decidedAt ?? b.createdAt).getTime() - new Date(a.decidedAt ?? a.createdAt).getTime()));
    setLoading(false);
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const score = useMemo(() => {
    let measured = 0;
    let worked = 0;
    Object.values(outcomes?.porTipoDeAcao || {}).forEach((byVerdict) => {
      Object.entries(byVerdict).forEach(([verdict, count]) => {
        if (verdict === 'SEM_DADOS') return;
        measured += Number(count || 0);
        if (verdict === 'ACERTOU') worked += Number(count || 0);
      });
    });
    return { measured, worked };
  }, [outcomes]);

  if (loading) return <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card>;

  const accepted = history.filter((r) => r.status === 'ACEITA' || r.status === 'EXECUTADA').length;
  const mape = outcomes?.acuraciaPrevisao?.mape;

  return (
    <div className="fx-stack" style={{ gap: 18 }}>
      {summary && (
        <Card>
          <PanelTitle title="Suas decisões nos últimos 30 dias" sub={summary.medidas > 0
            ? `${summary.acertos} de ${summary.medidas} funcionaram${summary.parciais ? `, ${summary.parciais} em parte` : ''}`
            : summary.aguardando > 0 ? `${summary.aguardando} ${summary.aguardando === 1 ? 'decisão aceita está' : 'decisões aceitas estão'} sendo acompanhadas${summary.proximaMedicao ? `; a primeira medição sai em ${date(summary.proximaMedicao)}` : ''}` : 'Aceite uma decisão em "Para decidir": 30 dias depois ela aparece aqui, em reais.'} />
          <div className="fx-kpis" style={{ marginTop: 14 }}>
            <Kpi label="Dinheiro de volta ao caixa" value={formatMoney(summary.dinheiroDeVolta)} hint="venda dos produtos que você liquidou" />
            <Kpi label="Venda a mais" value={formatMoney(summary.vendaAMais)} hint="promoções e preços que funcionaram" />
            <Kpi label="Venda garantida" value={formatMoney(summary.vendaGarantida)} hint="compras que escoaram sem sobrar" />
          </div>
        </Card>
      )}

      <div className="fx-kpis">
        <Kpi label="Em acompanhamento" value={tracking.length} hint="decisões aceitas esperando o efeito" icon={Eye} />
        <Kpi label="Deu certo" value={score.measured > 0 ? `${score.worked} de ${score.measured}` : '—'} hint="medido 30 dias depois" />
        <Kpi label="Aceitas" value={accepted} hint={`de ${history.length} recomendações decididas`} />
        {mape != null && <Kpi label="Acerto da previsão" value={`${formatDecimal(Math.max(0, 100 - Number(mape)), 0)}%`} hint={outcomes?.acuraciaPrevisao?.interpretation} />}
      </div>

      <Card>
        <PanelTitle title="Resultado das decisões" sub="Cada decisão aceita é medida 30 dias depois" />
        {outcomes?.historicoCompleto === false && (outcomes.decisoesMedidas || 0) > 0 ? (
          <p style={{ margin: '14px 0 0' }}>{outcomes.decisoesMedidas} decisões já medidas. {outcomes.mensagemUpgrade} <Link to="/app/assinatura">Ver planos</Link></p>
        ) : !outcomes?.resultados?.length ? (
          <p className="fx-muted" style={{ margin: '14px 0 0' }}>Nenhum resultado medido ainda.</p>
        ) : (
          <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 8 }}>
            {outcomes.resultados.map((o) => {
              const v = VERDICT[o.verdict ?? ""] ?? { label: 'Sem dados', tone: 'gray' as const };
              return (
                <li key={o.id} className="fx-row" style={{ cursor: 'default' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 15 }}>{o.recommendationTitle}</b>
                    <span className="fx-muted" style={{ fontSize: 13 }}>{ACTION_LABEL[o.actionType] || o.actionType} · medido em {date(o.measuredAt)}{o.notes ? ` · ${o.notes}` : ''}</span>
                  </span>
                  <Chip tone={v.tone}>{v.label}</Chip>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <PanelTitle title="Recomendações que você decidiu" />
          <ul className="fx-stack" style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, gap: 6 }}>
            {history.slice(0, 30).map((r) => {
              const ok = r.status === 'ACEITA' || r.status === 'EXECUTADA';
              return (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: '1px solid var(--fx-line)' }}>
                  <span className="fx-icon-tile" style={{ width: 32, height: 32, ...(ok ? {} : { background: 'var(--fx-ground-2)', color: 'var(--fx-muted)' }) }}>{ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</b>
                    <span className="fx-muted" style={{ fontSize: 13 }}>{ok ? 'Aceita' : 'Recusada'} em {date(r.decidedAt)}{r.decidedBy ? ` por ${r.decidedBy}` : ''}</span>
                  </span>
                  {r.expectedImpactValue ? <span className="fx-muted fx-num" style={{ fontSize: 13.5 }}>{formatMoney(r.expectedImpactValue)}</span> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tino.length > 0 && <HistoryView marketId={marketId} decisions={tino} onChanged={load} />}
    </div>
  );
};

export default Results;
