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
import { ActionHub, Forest, PanelTitle, StepTrack, Thumb } from '../flow/Flow';
import { CalendarPlus, MessageCircleQuestion, Newspaper } from 'lucide-react';

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
  const [selected, setSelected] = useState<string | null>(null);
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
        <PanelTitle icon={Sparkles} title="Tino está analisando" sub="Histórico de preços, cestas e sazonalidade da loja" />
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
  const current = [...traction, ...clearance].find((c) => `${c.objective}-${c.productId}` === selected) ?? traction[0] ?? clearance[0] ?? null;
  const nothingToShow = traction.length === 0 && clearance.length === 0 && driverRows.length === 0;

  if (nothingToShow) {
    return (
      <Forest>
        <PanelTitle icon={Sparkles} title="Tino está aprendendo a sua loja" sub="Ainda não há variação de preço suficiente para medir promoções." />
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
        <div className="fx-split">
          <div className="fx-card fx-card-pad flex flex-col gap-5">
            {([['TRACAO', 'Puxam a loja', 'Em promoção, levam outros produtos junto', traction], ['LIQUIDACAO', 'Liberam capital', 'Estoque parado que trava na prateleira', clearance]] as const)
              .filter(([, , , list]) => list.length > 0)
              .map(([key, title, hint, list]) => (
                <section key={key} aria-label={title}>
                  <SectionHeader icon={key === 'TRACAO' ? <Magnet size={18} /> : <Snowflake size={18} />} title={title} hint={hint} />
                  <ul className="fx-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
                    {list.slice(0, 12).map((c) => {
                      const on = current?.productId === c.productId && current?.objective === c.objective;
                      return (
                        <li key={`${c.objective}-${c.productId}`}>
                          <button type="button" className={`fx-row ${on ? 'selected' : ''}`} aria-current={on || undefined}
                            onClick={() => {
                              setSelected(`${c.objective}-${c.productId}`);
                              if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('promo-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                            }}>
                            <Thumb name={c.name} src={c.imageUrl} size={46} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <b style={{ display: 'block', fontSize: 15.5 }}>{c.name}</b>
                              <span className="fx-muted" style={{ fontSize: 13 }}>
                                {c.suggestedDiscountPercent != null ? `−${fmtNumber(c.suggestedDiscountPercent, 0)}% sugerido` : c.category || ''}
                                {c.topTargets.length > 0 ? ` · puxa ${c.topTargets.length} ${c.topTargets.length === 1 ? 'produto' : 'produtos'}` : ''}
                              </span>
                            </span>
                            {c.expectedIncrementalRevenue ? <b className="fx-num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>+{fmtMoney(c.expectedIncrementalRevenue)}</b>
                              : c.capitalAtRisk ? <b className="fx-num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{fmtMoney(c.capitalAtRisk)}</b> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <UpgradeNotice gated={key === 'TRACAO' ? recommendations?.traction : recommendations?.clearance} />
                </section>
              ))}
          </div>

          {current && (
            <div id="promo-panel" style={{ minWidth: 0, scrollMarginTop: 80 }}>
              <Forest as="aside" aria-label={`Promoção de ${current.name}`}>
                <PanelTitle icon={Sparkles} title="Depois da análise" sub={current.objective === 'TRACAO' ? 'Promover para puxar a loja' : 'Promover para liberar capital'} />
                <div className="flex items-center gap-4" style={{ marginTop: 20 }}>
                  <Thumb name={current.name} src={current.imageUrl} size={84} />
                  <div className="min-w-0">
                    <span className="fx-chip lime">{current.objective === 'TRACAO' ? 'Traciona a cesta' : 'Libera capital'}</span>
                    <h3 style={{ margin: '6px 0 0', fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.12 }}>{current.name}</h3>
                  </div>
                </div>
                <p className="fx-desk-lead">{current.reason}</p>
                {current.currentPrice != null && current.suggestedDiscountPercent != null && (
                  <div className="fx-white" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      <small>Preço de oferta sugerido</small>
                      <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 4 }}>
                        <s style={{ color: 'var(--fx-muted)', fontSize: 16 }}>{fmtMoney(current.currentPrice)}</s>
                        <span className="fx-money" style={{ fontSize: 26 }}>{fmtMoney(current.currentPrice * (1 - current.suggestedDiscountPercent / 100))}</span>
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <small>Desconto</small>
                      <b style={{ display: 'block', fontSize: 22 }}>−{fmtNumber(current.suggestedDiscountPercent, 1)}%</b>
                    </span>
                  </div>
                )}
                <div className="fx-kpis" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                  {current.marginPercent != null && <div className="fx-kpi"><span>Margem hoje</span><b style={{ fontSize: 22 }}>{fmtNumber(current.marginPercent, 1)}%</b></div>}
                  {current.dailyVelocity != null && <div className="fx-kpi"><span>Vende por dia</span><b style={{ fontSize: 22 }}>{fmtNumber(current.dailyVelocity, 1)}</b></div>}
                  {current.coverageDays != null && <div className="fx-kpi"><span>Estoque para</span><b style={{ fontSize: 22 }}>{fmtNumber(current.coverageDays, 0)} dias</b></div>}
                </div>
                {current.topTargets.length > 0 && (
                  <div className="fx-white" style={{ marginTop: 12 }}>
                    <small>Puxa a venda de</small>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {current.topTargets.map((t) => (
                        <span key={t.productId} className="fx-chip gray">{t.name} <b style={{ color: 'var(--fx-green)' }}>+{fmtNumber(t.liftPercent, 0)}%</b></span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 20 }}>
                  <ActionHub icon={Sparkles} onForest label="O que fazer com esta oportunidade" actions={[
                    ...(onCreateCampaign ? [{ label: 'Criar promoção', icon: CalendarPlus, onClick: () => onCreateCampaign(current) }] : []),
                    { label: 'Montar encarte', icon: Newspaper, to: '/app/encartes' },
                    { label: 'Perguntar ao Tino', icon: MessageCircleQuestion, to: `/app/perguntar?q=${encodeURIComponent(`Vale promover ${current.name}?`)}` },
                  ]} />
                </div>
              </Forest>
            </div>
          )}
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
