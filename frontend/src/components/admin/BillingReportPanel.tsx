import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Clock, DollarSign, RefreshCw, TrendingUp, Users } from 'lucide-react';
import subscriptionService, { BillingReport, formatPrice } from '../../services/subscription.service';

/**
 * Relatório de faturamento do SaaS.
 *
 * As métricas vêm do banco, sincronizado por webhook — não da API do Stripe a
 * cada abertura, o que seria lento e sujeito a rate limit.
 */

const fmtNumber = (v?: number | null) => new Intl.NumberFormat('pt-BR').format(Number(v || 0));

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const Tile: React.FC<{
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

const BillingReportPanel: React.FC = () => {
  const [report, setReport] = useState<BillingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await subscriptionService.getBillingReport());
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin" />
        Calculando faturamento...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl p-4 text-sm"
        style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
      >
        <AlertTriangle size={16} />
        {error || 'Relatório indisponível.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<DollarSign size={13} />}
          label="Receita recorrente (MRR)"
          value={formatPrice(report.mrrCents)}
          hint={`${fmtNumber(report.payingAccounts)} contas pagantes`}
          tone="good"
        />
        <Tile
          icon={<TrendingUp size={13} />}
          label="Projeção anual (ARR)"
          value={formatPrice(report.arrCents)}
          hint="MRR × 12"
        />
        <Tile
          icon={<Users size={13} />}
          label="Ticket médio"
          value={formatPrice(report.averageTicketCents)}
          hint={`${fmtNumber(report.freeAccounts)} no gratuito`}
        />
        <Tile
          icon={<AlertTriangle size={13} />}
          label="Em atraso"
          value={formatPrice(report.pastDueCents)}
          hint={`${fmtNumber(report.pastDueAccounts)} conta(s)`}
          tone={report.pastDueAccounts > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {(report.cancelingAccounts > 0 || report.unbilledAccounts > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {report.cancelingAccounts > 0 && (
            <div
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
            >
              <Clock size={16} style={{ color: '#b45309' }} />
              <span className="text-sm" style={{ color: '#92400e' }}>
                <strong>{fmtNumber(report.cancelingAccounts)}</strong> assinatura(s) com cancelamento
                agendado para o fim do período
              </span>
            </div>
          )}
          {report.unbilledAccounts > 0 && (
            <div
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
            >
              <Ban size={16} style={{ color: '#b91c1c' }} />
              <span className="text-sm" style={{ color: '#991b1b' }}>
                <strong>{fmtNumber(report.unbilledAccounts)}</strong> conta(s) em plano pago sem
                assinatura no Stripe — receita não está entrando
              </span>
            </div>
          )}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Receita por plano
        </h3>
        <div
          className="overflow-x-auto rounded-xl"
          style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="px-3 py-2 font-semibold">Plano</th>
                <th className="px-3 py-2 font-semibold">Contas</th>
                <th className="px-3 py-2 font-semibold">MRR</th>
                <th className="px-3 py-2 font-semibold">Participação</th>
              </tr>
            </thead>
            <tbody>
              {report.byPlan.map((row) => {
                const share = report.mrrCents > 0 ? (row.mrrCents / report.mrrCents) * 100 : 0;
                return (
                  <tr key={row.planCode} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.planName}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{fmtNumber(row.accounts)}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatPrice(row.mrrCents)}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                      {share.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {report.unbilled.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: '#b91c1c' }}>
            <Ban size={15} />
            Contas pagas sem cobrança ativa
          </h3>
          <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Liberadas manualmente ou com a assinatura perdida no Stripe.
          </p>
          <div
            className="overflow-x-auto rounded-xl"
            style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
          >
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="px-3 py-2 font-semibold">Mercado</th>
                  <th className="px-3 py-2 font-semibold">Plano</th>
                  <th className="px-3 py-2 font-semibold">Valor não cobrado</th>
                  <th className="px-3 py-2 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {report.unbilled.slice(0, 20).map((row) => (
                  <tr key={row.marketId} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.marketName}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{row.planName}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: '#b91c1c' }}>
                      {formatPrice(row.monthlyPriceCents)}/mês
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Maiores contas
        </h3>
        <div
          className="overflow-x-auto rounded-xl"
          style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="px-3 py-2 font-semibold">Mercado</th>
                <th className="px-3 py-2 font-semibold">Plano</th>
                <th className="px-3 py-2 font-semibold">Mensalidade</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Renova em</th>
              </tr>
            </thead>
            <tbody>
              {report.topAccounts.slice(0, 20).map((row) => (
                <tr key={row.marketId} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{row.marketName}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{row.planName}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(row.monthlyPriceCents)}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {row.cancelAtPeriodEnd ? 'cancelando' : row.billingStatus || '—'}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(row.currentPeriodEnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default BillingReportPanel;
