import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import PlanCatalogPanel from '../components/admin/PlanCatalogPanel';
import BillingReportPanel from '../components/admin/BillingReportPanel';
import subscriptionService, {
  PlanCode,
  SubscriptionEvent,
  SubscriptionOverview,
  SubscriptionRow,
  SuspectedNetwork,
  formatLimit,
  formatPrice,
  isUnlimited,
} from '../services/subscription.service';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Gauge,
  Network,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';

/**
 * Gestão de assinaturas do SaaS.
 *
 * O painel do super admin cuidava só de conteúdo e CRUD; faltava a operação
 * comercial: quem está em qual plano, quanto consome, e — o mais útil — quem
 * está batendo no teto do gratuito e é candidato imediato a upgrade.
 */

const fmtNumber = (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0));

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const PLAN_STYLE: Record<PlanCode, { bg: string; color: string }> = {
  FREE: { bg: '#f1f5f9', color: '#475569' },
  ESSENCIAL: { bg: '#dcfce7', color: '#15803d' },
  PROFISSIONAL: { bg: '#dbeafe', color: '#1d4ed8' },
  REDE: { bg: '#ede9fe', color: '#6d28d9' },
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  TRIAL: 'Trial',
  PENDING: 'Pendente',
  PAST_DUE: 'Em atraso',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn';
}> = ({ icon, label, value, hint, tone = 'neutral' }) => {
  const color = tone === 'good' ? '#15803d' : tone === 'warn' ? '#b45309' : 'var(--text-primary)';
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
    >
      <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  );
};

const UsageBar: React.FC<{ percent: number; reached: boolean }> = ({ percent, reached }) => {
  if (percent < 0) {
    return (
      <span className="text-[11px] font-medium" style={{ color: '#6d28d9' }}>
        Ilimitado
      </span>
    );
  }
  const color = reached ? '#dc2626' : percent >= 80 ? '#d97706' : '#16a34a';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'var(--surface-soft)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, percent)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
};

const SuperAdminSubscriptions: React.FC = () => {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'ALL' | PlanCode>('ALL');
  const [onlyCandidates, setOnlyCandidates] = useState(false);

  const [tab, setTab] = useState<'contas' | 'planos' | 'faturamento'>('contas');
  const [suspected, setSuspected] = useState<SuspectedNetwork[]>([]);
  const [showSuspected, setShowSuspected] = useState(false);
  const [detail, setDetail] = useState<SubscriptionRow | null>(null);
  const [history, setHistory] = useState<SubscriptionEvent[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, networks] = await Promise.all([
        subscriptionService.getOverview(),
        subscriptionService.getSuspectedNetworks().catch(() => [] as SuspectedNetwork[]),
      ]);
      setOverview(data);
      setSuspected(networks);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as assinaturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: SubscriptionRow) => {
    setDetail(row);
    setHistory([]);
    try {
      setHistory(await subscriptionService.getHistory(row.marketId));
    } catch {
      // histórico é complementar; a ficha continua utilizável sem ele
    }
  };

  const applyPlan = async (row: SubscriptionRow, plan: PlanCode) => {
    setSaving(true);
    try {
      await subscriptionService.changePlan(row.marketId, plan, 'Alterado pelo super admin');
      await load();
      setDetail(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar o plano.');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (row: SubscriptionRow, status: string) => {
    setSaving(true);
    try {
      await subscriptionService.changeStatus(row.marketId, status, 'Alterado pelo super admin');
      await load();
      setDetail(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar o status.');
    } finally {
      setSaving(false);
    }
  };

  const linkBranch = async (parentMarketId: string, branchMarketId: string) => {
    setSaving(true);
    try {
      await subscriptionService.attachBranch(parentMarketId, branchMarketId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao vincular a filial.');
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    if (!overview) return [];
    const base = onlyCandidates ? overview.upgradeCandidates : overview.subscriptions;
    const term = search.trim().toLowerCase();
    return base.filter((row) => {
      if (planFilter !== 'ALL' && row.planCode !== planFilter) return false;
      if (!term) return true;
      return (
        row.marketName?.toLowerCase().includes(term)
        || row.contactEmail?.toLowerCase().includes(term)
        || row.cnpj?.toLowerCase().includes(term)
      );
    });
  }, [overview, search, planFilter, onlyCandidates]);

  const metrics = overview?.metrics;

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Assinaturas
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Planos, consumo e oportunidades de upgrade
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-xl p-3 text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Abas */}
        <div
          className="flex w-fit gap-1 rounded-xl p-1"
          style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}
        >
          {([
            { key: 'contas', label: 'Contas', icon: <Users size={14} /> },
            { key: 'planos', label: 'Planos e preços', icon: <Package size={14} /> },
            { key: 'faturamento', label: 'Faturamento', icon: <DollarSign size={14} /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={
                tab === t.key
                  ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'planos' && <PlanCatalogPanel />}
        {tab === 'faturamento' && <BillingReportPanel />}

        {tab === 'contas' && (loading && !overview ? (
          <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            Carregando assinaturas...
          </div>
        ) : (
          <>
            {/* Métricas */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatTile
                icon={<Users size={13} />}
                label="Contas"
                value={fmtNumber(metrics?.totalMarkets)}
                hint={`${fmtNumber(metrics?.activeMarkets)} ativas`}
              />
              <StatTile
                icon={<CreditCard size={13} />}
                label="Pagantes"
                value={fmtNumber((metrics?.essencialMarkets || 0) + (metrics?.profissionalMarkets || 0) + (metrics?.redeMarkets || 0))}
                hint={`${fmtNumber(metrics?.freeMarkets)} no gratuito`}
                tone="good"
              />
              <StatTile
                icon={<TrendingUp size={13} />}
                label="Conversão"
                value={`${Number(metrics?.conversionRatePercent || 0).toFixed(1)}%`}
                hint="pagantes / total"
              />
              <StatTile
                icon={<AlertTriangle size={13} />}
                label="No limite"
                value={fmtNumber(metrics?.marketsAtLimit)}
                hint={`${fmtNumber(metrics?.marketsNearLimit)} acima de 80%`}
                tone="warn"
              />
              <StatTile
                icon={<Gauge size={13} />}
                label="Notas no ciclo"
                value={fmtNumber(metrics?.invoicesThisCycle)}
                hint={`${fmtNumber(metrics?.invoicesRejectedThisCycle)} recusadas`}
              />
            </div>

            {/* Planos */}
            <div className="grid gap-3 lg:grid-cols-3">
              {overview?.plans.map((plan) => (
                <div
                  key={plan.code}
                  className="rounded-xl p-4"
                  style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={PLAN_STYLE[plan.code]}
                    >
                      {plan.name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {fmtNumber(plan.marketCount)} conta(s)
                    </span>
                  </div>
                  <div className="mt-1 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(plan.monthlyPriceCents)}
                    {plan.monthlyPriceCents > 0 && (
                      <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                        {' '}/mês
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatLimit(plan.monthlyInvoices)}</strong>{' '}
                      notas/mês
                    </span>
                    <span>
                      {formatLimit(plan.branches)} loja(s) · {formatLimit(plan.pdvsPerBranch)} PDV(s) por loja
                      {' '}({formatLimit(plan.pdvs)} no total)
                    </span>
                    <span>{formatLimit(plan.seats)} usuário(s)</span>
                    <span>
                      {isUnlimited(plan.historyDays)
                        ? 'Histórico completo'
                        : `${fmtNumber(plan.historyDays)} dias de histórico`}
                    </span>
                    <span>{plan.fullInsights ? 'Inteligência completa' : 'Prévia da inteligência'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Redes fatiadas */}
            {suspected.length > 0 && (
              <div
                className="rounded-xl p-4"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
              >
                <button
                  type="button"
                  onClick={() => setShowSuspected((v) => !v)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <Network size={16} style={{ color: '#b45309' }} />
                  <span className="text-sm font-bold" style={{ color: '#92400e' }}>
                    {suspected.length} empresa(s) com contas separadas
                  </span>
                  <span className="text-xs" style={{ color: '#92400e', opacity: 0.85 }}>
                    mesmo CNPJ raiz, sem vínculo de rede — cada uma é uma conversa comercial
                  </span>
                  <span className="ml-auto text-xs font-semibold" style={{ color: '#92400e' }}>
                    {showSuspected ? 'Ocultar' : 'Ver'}
                  </span>
                </button>

                {showSuspected && (
                  <div className="mt-3 flex flex-col gap-3">
                    {suspected.map((network) => {
                      const headquarters = network.accounts[0];
                      return (
                        <div
                          key={network.cnpjRoot}
                          className="rounded-lg p-3"
                          style={{ background: 'var(--surface-base)' }}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <strong style={{ color: 'var(--text-primary)' }}>
                              CNPJ raiz {network.cnpjRoot}
                            </strong>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {network.accountCount} contas · {network.totalPdvs} PDV(s) no total
                            </span>
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                            {network.accounts.map((account) => (
                              <div
                                key={account.marketId}
                                className="flex flex-wrap items-center gap-2 text-xs"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <span style={{ color: 'var(--text-primary)' }}>{account.name}</span>
                                <span>{account.cnpj}</span>
                                <span>{account.pdvCount} PDV(s)</span>
                                {account.marketId !== headquarters.marketId && (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => linkBranch(headquarters.marketId, account.marketId)}
                                    className="rounded px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                                    style={{ background: '#fef3c7', color: '#92400e' }}
                                    title={`Vincular como filial de ${headquarters.name}`}
                                  >
                                    Vincular como filial
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1" style={{ minWidth: '220px' }}>
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por mercado, e-mail ou CNPJ"
                  className="w-full rounded-lg py-2 pl-9 pr-3 text-sm"
                  style={{
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              {(['ALL', 'FREE', 'ESSENCIAL', 'PROFISSIONAL', 'REDE'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPlanFilter(code)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold"
                  style={
                    planFilter === code
                      ? { background: 'var(--brand-500, #22c55e)', color: '#fff' }
                      : { border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }
                  }
                >
                  {code === 'ALL' ? 'Todos' : code}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOnlyCandidates((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={
                  onlyCandidates
                    ? { background: '#b45309', color: '#fff' }
                    : { border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }
                }
                title="Contas gratuitas no limite ou acima de 80% — prontas para abordagem"
              >
                <ArrowUpRight size={13} />
                Candidatos a upgrade
              </button>
            </div>

            {/* Tabela */}
            <div
              className="overflow-x-auto rounded-xl"
              style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
            >
              <table className="w-full text-left text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="px-3 py-2 font-semibold">Mercado</th>
                    <th className="px-3 py-2 font-semibold">Plano</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Consumo do ciclo</th>
                    <th className="px-3 py-2 font-semibold">Rede</th>
                    <th className="px-3 py-2 font-semibold">Usuários</th>
                    <th className="px-3 py-2 font-semibold">Última nota</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                        Nenhuma assinatura encontrada com estes filtros.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.marketId} style={{ borderTop: '1px solid var(--border-soft)' }}>
                      <td className="px-3 py-2">
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {row.marketName}
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>{row.contactEmail || '—'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={PLAN_STYLE[row.planCode]}
                        >
                          {row.planName}
                        </span>
                        {row.unlimited && (
                          <span className="ml-1 text-[10px]" style={{ color: '#6d28d9' }}>
                            sem teto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: row.active ? '#15803d' : '#b91c1c' }}
                        >
                          {row.active ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                          {STATUS_LABEL[row.billingStatus || ''] || row.billingStatus || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <span style={{ color: 'var(--text-primary)' }}>
                            {fmtNumber(row.invoicesUsed)} / {formatLimit(row.invoiceLimit)}
                          </span>
                          <UsageBar percent={row.usagePercent} reached={row.limitReached} />
                          {row.invoicesRejected > 0 && (
                            <span className="text-[10px]" style={{ color: '#b91c1c' }}>
                              {fmtNumber(row.invoicesRejected)} recusadas
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {row.parentMarketName ? (
                          <span title={`Filial de ${row.parentMarketName}`}>
                            filial de {row.parentMarketName}
                          </span>
                        ) : (
                          <>
                            {row.branchCount} / {formatLimit(row.branchLimit)} loja(s)
                            <div className="text-[10px]">
                              {row.pdvCount} / {formatLimit(row.pdvLimit)} PDV(s)
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {row.seatCount} / {formatLimit(row.seatLimit)}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {fmtDate(row.lastIngestAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(row)}
                          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
                        >
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
      </div>

      {/* Ficha do cliente */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            style={{ background: 'var(--surface-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              {detail.marketName}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {detail.contactEmail} · cliente desde {fmtDate(detail.createdAt)}
            </p>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Plano
              </p>
              <div className="flex flex-wrap gap-2">
                {(['FREE', 'ESSENCIAL', 'PROFISSIONAL', 'REDE'] as PlanCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={saving || detail.planCode === code}
                    onClick={() => applyPlan(detail, code)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={
                      detail.planCode === code
                        ? PLAN_STYLE[code]
                        : { border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }
                    }
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Status da assinatura
              </p>
              <div className="flex flex-wrap gap-2">
                {['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={saving || detail.billingStatus === status}
                    onClick={() => applyStatus(detail, status)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
                  >
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Histórico
              </p>
              {history.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Nenhum evento registrado.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.slice(0, 15).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg p-2 text-[11px]"
                      style={{ background: 'var(--surface-soft)' }}
                    >
                      <div className="flex justify-between">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {event.eventType}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmtDate(event.createdAt)}</span>
                      </div>
                      {event.reason && <p style={{ color: 'var(--text-muted)' }}>{event.reason}</p>}
                      {event.actorEmail && (
                        <p style={{ color: 'var(--text-muted)' }}>por {event.actorEmail}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDetail(null)}
              className="mt-5 w-full rounded-lg py-2 text-sm font-semibold"
              style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
};

export default SuperAdminSubscriptions;
