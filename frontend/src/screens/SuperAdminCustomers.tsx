import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import CustomerProfileDrawer from '../components/admin/CustomerProfileDrawer';
import crmService, { CustomerSummary, HealthBand } from '../services/crm.service';
import { formatPrice } from '../services/subscription.service';
import {
  AlertTriangle,
  Download,
  HeartPulse,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';

/**
 * Base de clientes do CRM.
 *
 * Ordenada por saúde: a conta em maior risco aparece primeiro, porque é a fila
 * em que o time comercial deve trabalhar.
 */

const fmtNumber = (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0));

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const HEALTH: Record<HealthBand, { label: string; bg: string; color: string }> = {
  SAUDAVEL: { label: 'Saudável', bg: '#dcfce7', color: '#15803d' },
  ATENCAO: { label: 'Atenção', bg: '#fef3c7', color: '#92400e' },
  RISCO: { label: 'Risco', bg: '#fee2e2', color: '#b91c1c' },
};

const HealthBadge: React.FC<{ band: HealthBand; score: number }> = ({ band, score }) => {
  const meta = HEALTH[band] ?? HEALTH.ATENCAO;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: meta.bg, color: meta.color }}
      title={`Saúde ${score}/100`}
    >
      <HeartPulse size={10} />
      {meta.label} {score}
    </span>
  );
};

const SuperAdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<'ALL' | HealthBand>('ALL');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await crmService.listCustomers());
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar a base de clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshHealth = async () => {
    setLoading(true);
    try {
      await crmService.refreshHealth();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao recalcular a saúde.');
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (bandFilter !== 'ALL' && c.healthBand !== bandFilter) return false;
      if (!term) return true;
      return (
        c.name?.toLowerCase().includes(term)
        || c.cnpj?.toLowerCase().includes(term)
        || c.contactEmail?.toLowerCase().includes(term)
        || c.accountOwnerEmail?.toLowerCase().includes(term)
      );
    });
  }, [customers, search, bandFilter]);

  const stats = useMemo(() => {
    const risco = customers.filter((c) => c.healthBand === 'RISCO').length;
    const atencao = customers.filter((c) => c.healthBand === 'ATENCAO').length;
    const overdue = customers.reduce((sum, c) => sum + c.overdueCents, 0);
    const mrr = customers
      .filter((c) => c.active && c.billingStatus === 'ACTIVE')
      .reduce((sum, c) => sum + c.monthlyPriceCents, 0);
    return { risco, atencao, overdue, mrr };
  }, [customers]);

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Clientes
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {fmtNumber(customers.length)} contas · ordenadas por risco
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => crmService.downloadExport('customers')}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            >
              <Download size={14} />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={refreshHealth}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Recalcular saúde
            </button>
          </div>
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

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Receita recorrente', value: formatPrice(stats.mrr), tone: '#15803d', icon: <Users size={13} /> },
            { label: 'Em risco', value: fmtNumber(stats.risco), tone: '#b91c1c', icon: <AlertTriangle size={13} /> },
            { label: 'Requer atenção', value: fmtNumber(stats.atencao), tone: '#b45309', icon: <HeartPulse size={13} /> },
            { label: 'Vencido', value: formatPrice(stats.overdue), tone: stats.overdue > 0 ? '#b91c1c' : 'var(--text-primary)', icon: <AlertTriangle size={13} /> },
          ].map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col gap-1 rounded-xl p-4"
              style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
            >
              <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {tile.icon}
                {tile.label}
              </div>
              <div className="text-xl font-bold" style={{ color: tile.tone }}>
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1" style={{ minWidth: '240px' }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CNPJ, e-mail ou responsável"
              className="w-full rounded-lg py-2 pl-9 pr-3 text-sm"
              style={{
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-base)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          {(['ALL', 'RISCO', 'ATENCAO', 'SAUDAVEL'] as const).map((band) => (
            <button
              key={band}
              type="button"
              onClick={() => setBandFilter(band)}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={
                bandFilter === band
                  ? { background: 'var(--brand-500, #22c55e)', color: '#fff' }
                  : { border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }
              }
            >
              {band === 'ALL' ? 'Todos' : HEALTH[band].label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        {loading && customers.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            Carregando clientes...
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-xl"
            style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
          >
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Saúde</th>
                  <th className="px-3 py-2 font-semibold">Plano</th>
                  <th className="px-3 py-2 font-semibold">Mensalidade</th>
                  <th className="px-3 py-2 font-semibold">Uso</th>
                  <th className="px-3 py-2 font-semibold">Estrutura</th>
                  <th className="px-3 py-2 font-semibold">Vencido</th>
                  <th className="px-3 py-2 font-semibold">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                      Nenhum cliente encontrado com estes filtros.
                    </td>
                  </tr>
                )}
                {rows.map((c) => (
                  <tr
                    key={c.marketId}
                    onClick={() => setSelected(c.marketId)}
                    className="cursor-pointer"
                    style={{ borderTop: '1px solid var(--border-soft)' }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {c.name}
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {c.contactEmail || c.cnpj || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <HealthBadge band={c.healthBand} score={c.healthScore} />
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {c.planName}
                      {!c.active && (
                        <div className="text-[10px]" style={{ color: '#b91c1c' }}>
                          inativo
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {c.monthlyPriceCents > 0 ? formatPrice(c.monthlyPriceCents) : '—'}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {fmtNumber(c.invoicesUsed)} notas
                      {c.usagePercent >= 0 && (
                        <div className="text-[10px]">{c.usagePercent}% do plano</div>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {c.branchCount} loja(s) · {c.pdvCount} PDV(s)
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: c.overdueCents > 0 ? '#b91c1c' : 'var(--text-muted)' }}>
                      {c.overdueCents > 0 ? formatPrice(c.overdueCents) : '—'}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {c.accountOwnerEmail || <span style={{ opacity: 0.5 }}>sem responsável</span>}
                      <div className="text-[10px]">cliente desde {fmtDate(c.createdAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <CustomerProfileDrawer
          marketId={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </SuperAdminLayout>
  );
};

export default SuperAdminCustomers;
