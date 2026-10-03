import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Magnet,
  RefreshCw,
  Snowflake,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import ProductImage from '../product/ProductImage';
import workingCapitalService, {
  GatedPromoRecommendations,
  PromoCandidate,
  SeasonalIndex,
  TrafficDriver,
} from '../../services/workingCapital.service';
import type { GatedList } from '../../services/subscription.service';
import { Forest, PanelTitle, StepTrack, Thumb } from '../flow/Flow';

/**
 * Inteligência de promoções: o que descontar, por quê, e quando.
 *
 * Separa dois objetivos que pedem produtos diferentes — tracionar a cesta
 * (descontar quem puxa a venda de outros) e liquidar capital parado.
 */

const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const fmtNumber = (v?: number | null, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(v || 0));

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
}> = ({ icon, title, hint }) => (
  <header className="mb-3 flex items-center gap-3">
    <span className="fx-icon-tile" style={{ width: 42, height: 42 }}>{icon}</span>
    <span className="min-w-0">
      <h2 className="fx-section-title" style={{ fontSize: 18 }}>{title}</h2>
      {hint && <span className="block text-[13.5px]" style={{ color: 'var(--fx-muted)' }}>{hint}</span>}
    </span>
  </header>
);

const CandidateCard: React.FC<{
  candidate: PromoCandidate;
  onCreateCampaign?: (candidate: PromoCandidate) => void;
}> = ({ candidate, onCreateCampaign }) => {
  const isTraction = candidate.objective === 'TRACAO';
  const accent = isTraction ? '#15803d' : '#b45309';
  const accentBg = isTraction ? '#dcfce7' : '#fef3c7';

  return (
    <div className="fx-row" style={{ alignItems: 'flex-start', cursor: 'default' }}>
      <Thumb name={candidate.name} src={candidate.imageUrl} size={52} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {candidate.name}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: accentBg, color: accent }}
          >
            {isTraction ? 'Traciona a cesta' : 'Libera capital'}
          </span>
          {candidate.suggestedDiscountPercent != null && (
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-bold"
              style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}
              title="Desconto sugerido, limitado pela margem disponível"
            >
              −{fmtNumber(candidate.suggestedDiscountPercent, 1)}%
            </span>
          )}
        </div>

        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {candidate.reason}
        </p>

        {candidate.topTargets.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Puxa a venda de:
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {candidate.topTargets.map((target) => (
                <span
                  key={target.productId}
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
                  title={`+${fmtNumber(target.liftPercent, 0)}% de venda · ${fmtMoney(
                    target.incrementalRevenue,
                  )} de receita adicional`}
                >
                  {target.name} <strong style={{ color: '#15803d' }}>+{fmtNumber(target.liftPercent, 0)}%</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {candidate.currentPrice != null && <span>Preço atual {fmtMoney(candidate.currentPrice)}</span>}
          {candidate.marginPercent != null && <span>Margem {fmtNumber(candidate.marginPercent, 1)}%</span>}
          {candidate.dailyVelocity != null && <span>{fmtNumber(candidate.dailyVelocity, 2)} un./dia</span>}
          {candidate.coverageDays != null && <span>{fmtNumber(candidate.coverageDays, 0)} dias de estoque</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Prioridade
          </div>
          <div className="text-sm font-bold" style={{ color: accent }}>
            {fmtNumber(candidate.score, 0)}
          </div>
        </div>
        {onCreateCampaign && (
          <button
            type="button"
            onClick={() => onCreateCampaign(candidate)}
            className="fx-btn dark small"
          >
            Criar promoção
          </button>
        )}
      </div>
    </div>
  );
};

/** Barra simples de índice sazonal: 1.0 é a média do produto. */
const SeasonalBar: React.FC<{ point: SeasonalIndex }> = ({ point }) => {
  const value = Number(point.seasonalIndex || 1);
  // 0.5 → 0%, 1.0 → 50%, 1.5+ → 100%
  const width = Math.max(4, Math.min(100, ((value - 0.5) / 1.0) * 100));
  const above = value >= 1;

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {point.periodLabel}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-soft)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: above ? 'var(--brand-500, #22c55e)' : '#cbd5e1',
            opacity: point.reliable ? 1 : 0.45,
          }}
        />
      </div>
      <span
        className="w-14 shrink-0 text-right text-[11px] font-semibold"
        style={{ color: above ? '#15803d' : 'var(--text-muted)' }}
        title={point.reliable ? undefined : 'Poucas observações — indicativo'}
      >
        {value >= 1 ? '+' : ''}
        {fmtNumber((value - 1) * 100, 0)}%
      </span>
    </div>
  );
};


/** Aviso de recorte por plano: mostra o que está sendo ocultado. */
const UpgradeNotice: React.FC<{ gated?: { truncated: boolean; upgradeMessage?: string | null } | null }> = ({
  gated,
}) => {
  if (!gated?.truncated || !gated.upgradeMessage) return null;
  return (
    <a
      href="/app/planos"
      className="mt-2 flex items-center gap-2 rounded-lg p-2 text-xs"
      style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
    >
      <Sparkles size={13} />
      {gated.upgradeMessage}
    </a>
  );
};

interface PromoIntelligenceTabProps {
  marketId: string;
  onCreateCampaign?: (candidate: PromoCandidate) => void;
}

const PromoIntelligenceTab: React.FC<PromoIntelligenceTabProps> = ({ marketId, onCreateCampaign }) => {
  const [recommendations, setRecommendations] = useState<GatedPromoRecommendations | null>(null);
  const [drivers, setDrivers] = useState<GatedList<TrafficDriver> | null>(null);
  const [seasonality, setSeasonality] = useState<SeasonalIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, drv, seas] = await Promise.all([
        workingCapitalService.getPromoRecommendations(marketId),
        workingCapitalService.getTrafficDrivers(marketId),
        workingCapitalService.getSeasonality(marketId, null),
      ]);
      setRecommendations(recs);
      setDrivers(drv);
      setSeasonality(seas);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar a análise de promoções.');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Forest aria-busy="true">
        <PanelTitle icon={Sparkles} title="Jev está analisando" sub="Histórico de preços, cestas e sazonalidade da loja" />
        <div className="fx-white" style={{ marginTop: 18 }}>
          <StepTrack steps={[
            { label: 'Preços', hint: 'Quando cada um mudou', state: 'done' },
            { label: 'Cestas', hint: 'O que sai junto', state: 'now' },
            { label: 'Sazonalidade', hint: 'Dias e meses fortes', state: 'next' },
          ]} />
        </div>
        <p className="fx-muted" style={{ margin: '14px 0 0', display: 'flex', gap: 8, alignItems: 'center' }}><RefreshCw size={16} className="animate-spin" aria-hidden="true" />Leva alguns segundos.</p>
      </Forest>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl p-4"
        style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
      >
        <AlertTriangle size={18} style={{ color: '#b91c1c' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#991b1b' }}>
            {error}
          </p>
          <button type="button" onClick={load} className="mt-2 text-xs font-semibold underline" style={{ color: '#b91c1c' }}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const traction = recommendations?.traction.items ?? [];
  const clearance = recommendations?.clearance.items ?? [];
  const driverRows = drivers?.items ?? [];
  const dowPoints = seasonality.filter((s) => s.periodType === 'DOW');
  const monthPoints = seasonality.filter((s) => s.periodType === 'MONTH');

  const best = [...traction, ...clearance].sort((x, y) => Number(y.score || 0) - Number(x.score || 0))[0];
  const nothingToShow = traction.length === 0 && clearance.length === 0 && driverRows.length === 0;

  if (nothingToShow) {
    return (
      <Forest>
        <PanelTitle icon={Sparkles} title="Jev está aprendendo a sua loja" sub="Ainda não há variação de preço suficiente para medir promoções." />
        <div className="fx-white" style={{ marginTop: 18 }}>
          <StepTrack steps={[
            { label: 'Notas chegando', hint: 'Cada venda do caixa', state: 'done' },
            { label: 'Preços variando', hint: 'Antes, durante e depois', state: 'now' },
            { label: 'O que vale descontar', hint: 'Aparece aqui', state: 'next' },
          ]} />
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 14.5, color: 'var(--fx-on-forest-muted)' }}>
          Conforme as notas chegarem, esta tela mostra o que promover para puxar a loja e o que liquidar para liberar capital.
        </p>
      </Forest>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {(traction.length > 0 || clearance.length > 0) && (
        <div className="fx-split wide-left">
          <div className="fx-card fx-card-pad flex flex-col gap-6">
      {/* Candidatos a tração */}
      {traction.length > 0 && (
        <section>
          <SectionHeader
            icon={<Magnet size={16} style={{ color: '#15803d' }} />}
            title="Promova para tracionar a loja"
            hint="produtos que puxam a venda de outros quando estão em promoção"
          />
          <div className="flex flex-col gap-2">
            {traction.slice(0, 12).map((candidate) => (
              <CandidateCard key={candidate.productId} candidate={candidate} onCreateCampaign={onCreateCampaign} />
            ))}
          </div>
          <UpgradeNotice gated={recommendations?.traction} />
        </section>
      )}

      {/* Candidatos a liquidação */}
      {clearance.length > 0 && (
        <section>
          <SectionHeader
            icon={<Snowflake size={16} style={{ color: '#b45309' }} />}
            title="Promova para liberar capital"
            hint="estoque parado dando sinais de travar na prateleira"
          />
          <div className="flex flex-col gap-2">
            {clearance.slice(0, 12).map((candidate) => (
              <CandidateCard key={candidate.productId} candidate={candidate} onCreateCampaign={onCreateCampaign} />
            ))}
          </div>
          <UpgradeNotice gated={recommendations?.clearance} />
        </section>
      )}

          </div>
          <Forest as="aside" aria-label="Depois da análise" style={{ position: 'sticky', top: 84 }}>
            <PanelTitle icon={Sparkles} title="Depois da análise" sub="O que o Jev encontrou nas suas vendas" />
            <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: '1fr 1fr' }}>
              <div className="fx-kpi"><span>Puxam a loja</span><b>{traction.length}</b><small>produtos</small></div>
              <div className="fx-kpi"><span>Liberam capital</span><b>{clearance.length}</b><small>produtos</small></div>
            </div>
            {best && (
              <div className="fx-white" style={{ marginTop: 14 }}>
                <small>Maior prioridade agora</small>
                <div className="flex items-center gap-3" style={{ marginTop: 8 }}>
                  <Thumb name={best.name} src={best.imageUrl} size={52} />
                  <span className="min-w-0">
                    <b className="block" style={{ fontSize: 16 }}>{best.name}</b>
                    <small>{best.suggestedDiscountPercent != null ? `Desconto sugerido de ${fmtNumber(best.suggestedDiscountPercent, 1)}%` : best.reason}</small>
                  </span>
                </div>
                {onCreateCampaign && (
                  <button type="button" className="fx-btn dark" style={{ width: '100%', marginTop: 14 }} onClick={() => onCreateCampaign(best)}>
                    <Sparkles aria-hidden="true" />Criar promoção
                  </button>
                )}
              </div>
            )}
            <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--fx-on-forest-muted)' }}>
              Descontar num pico natural costuma ser margem desperdiçada. O Jev considera a margem e os dias fortes antes de sugerir.
            </p>
          </Forest>
        </div>
      )}

      {/* Ranking de tração medida */}
      {driverRows.length > 0 && (
        <section>
          <SectionHeader
            icon={<TrendingUp size={16} style={{ color: 'var(--brand-600, #16a34a)' }} />}
            title="Efeito medido nas promoções passadas"
            hint="receita adicional gerada nos demais produtos"
          />
          <div
            className="table-shell"
          >
            <table className="table">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 font-semibold">Produto em promoção</th>
                  <th className="px-3 py-2 font-semibold">Itens puxados</th>
                  <th className="px-3 py-2 font-semibold">Lift médio</th>
                  <th className="px-3 py-2 font-semibold">Receita adicional</th>
                </tr>
              </thead>
              <tbody>
                {driverRows.slice(0, 15).map((driver) => (
                  <tr key={driver.productId} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                      {driver.driverName}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {driver.affectedProducts}
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: '#15803d' }}>
                      +{fmtNumber(driver.averageLiftPercent, 0)}%
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(driver.totalIncrementalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sazonalidade */}
      {(dowPoints.length > 0 || monthPoints.length > 0) && (
        <section>
          <SectionHeader
            icon={<CalendarDays size={16} style={{ color: 'var(--text-muted)' }} />}
            title="Quando sua loja vende mais"
            hint="descontar num pico natural costuma ser margem desperdiçada"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {dowPoints.length > 0 && (
              <div
                className="fx-card fx-card-pad"
              >
                <p className="mb-3 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Por dia da semana
                </p>
                <div className="flex flex-col gap-2">
                  {dowPoints.map((point) => (
                    <SeasonalBar key={`dow-${point.periodIndex}`} point={point} />
                  ))}
                </div>
              </div>
            )}

            {monthPoints.length > 0 && (
              <div
                className="fx-card fx-card-pad"
              >
                <p className="mb-3 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Por mês
                </p>
                <div className="flex flex-col gap-2">
                  {monthPoints.map((point) => (
                    <SeasonalBar key={`month-${point.periodIndex}`} point={point} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <Sparkles size={11} />
            Barras mais claras têm poucas observações e servem apenas como indicativo.
          </p>
        </section>
      )}
    </div>
  );
};

export default PromoIntelligenceTab;
