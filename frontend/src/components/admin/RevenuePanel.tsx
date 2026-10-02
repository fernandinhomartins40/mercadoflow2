import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Receita sem planilha: MRR por plano e adicional, créditos, recebido no mês
 * e previsão, churn, conversão do teste e inadimplência por idade. E a fila de
 * exceções: só o que o automático não resolveu.
 */

interface Revenue {
  mrrCents: number;
  mrrByPlan: { plan_code: string; accounts: number; cents: number }[];
  mrrByAddon: { code: string; name: string; quantity: number; cents: number }[];
  creditsLast30Cents: number;
  receivedThisMonthCents: number;
  receivedSubscriptionsThisMonthCents: number;
  receivedCreditsThisMonthCents: number;
  forecastMonthCents: number;
  payingAccounts: number;
  churned30: number;
  churnRate30: number;
  trialsFinished: number;
  trialsConverted: number;
  trialsRunning: number;
  trialConversionRate: number;
  delinquency: { bucket: string; accounts: number; cents: number }[];
  openExceptions: number;
}

interface ExceptionRow {
  id: number; kind: string; market_name?: string; provider_ref?: string; detail: string; status: string;
  resolution?: string; resolved_by?: string; created_at: string;
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
const PLAN: Record<string, string> = { FREE: 'Grátis', ESSENCIAL: 'Essencial', PROFISSIONAL: 'Profissional', REDE: 'Rede' };
const KIND: Record<string, string> = {
  PAYMENT_REFUNDED: 'Estorno', PAYMENT_CHARGEBACK_REQUESTED: 'Contestação', PAYMENT_CHARGEBACK_DISPUTE: 'Disputa de contestação',
  NFSE_ERROR: 'Nota fiscal recusada', NFSE_CONFIG: 'Nota fiscal não configurada', UNKNOWN_SUBSCRIPTION: 'Pagamento sem assinatura',
};
const BOX = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)' };

const Kpi: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl p-4" style={{ background: 'var(--surface-soft)' }}>
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
    <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
    {hint && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
  </div>
);

const RevenuePanel: React.FC = () => {
  const [r, setR] = useState<Revenue | null>(null);
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [rev, ex] = await Promise.all([
      api.get<Revenue>('/v1/super-admin/billing/revenue'),
      api.get<ExceptionRow[]>('/v1/super-admin/billing/exceptions', { params: { status: showResolved ? undefined : 'OPEN' } }),
    ]);
    setR(rev.data);
    setRows(ex.data);
  };

  useEffect(() => {
    load().catch(() => setMessage('Não foi possível carregar a receita.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResolved]);

  const resolve = async (id: number) => {
    try {
      await api.post(`/v1/super-admin/billing/exceptions/${id}/resolve`, { resolution: notes[id] || '' });
      await load();
      setMessage('Exceção resolvida.');
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível resolver.');
    }
  };

  if (!r) return message ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p> : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-xl p-4" style={BOX} data-testid="revenue">
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Receita</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Receita recorrente (MRR)" value={brl(r.mrrCents)} hint={`${r.payingAccounts} conta(s) pagante(s)`} />
          <Kpi label="Recebido neste mês" value={brl(r.receivedThisMonthCents)}
            hint={`${brl(r.receivedSubscriptionsThisMonthCents)} assinaturas · ${brl(r.receivedCreditsThisMonthCents)} créditos`} />
          <Kpi label="Previsão do mês" value={brl(r.forecastMonthCents)} hint="recebido + renovações até o fim do mês" />
          <Kpi label="Créditos (30 dias)" value={brl(r.creditsLast30Cents)} hint="IA e Confere" />
          <Kpi label="Churn (30 dias)" value={`${String(r.churnRate30).replace('.', ',')}%`} hint={`${r.churned30} conta(s) saíram do plano pago`} />
          <Kpi label="Teste → pago" value={`${String(r.trialConversionRate).replace('.', ',')}%`}
            hint={`${r.trialsConverted} de ${r.trialsFinished} testes encerrados · ${r.trialsRunning} em teste`} />
          <Kpi label="Exceções em aberto" value={String(r.openExceptions)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>MRR por plano</h3>
            {r.mrrByPlan.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhuma conta pagante.</p> : (
              <ul className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {r.mrrByPlan.map((p) => <li key={p.plan_code} className="flex justify-between"><span>{PLAN[p.plan_code] || p.plan_code} ({p.accounts})</span><span className="tabular-nums">{brl(p.cents)}</span></li>)}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>MRR por adicional</h3>
            {r.mrrByAddon.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum adicional contratado.</p> : (
              <ul className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {r.mrrByAddon.map((a) => <li key={a.code} className="flex justify-between"><span>{a.name} ({a.quantity})</span><span className="tabular-nums">{brl(a.cents)}</span></li>)}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Inadimplência por idade</h3>
            {r.delinquency.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ninguém em atraso.</p> : (
              <ul className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {r.delinquency.map((d) => <li key={d.bucket} className="flex justify-between"><span>{d.bucket} ({d.accounts})</span><span className="tabular-nums">{brl(d.cents)}</span></li>)}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl p-4" style={BOX} data-testid="exceptions">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Fila de exceções</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Só o que o automático não resolveu: estorno, contestação, nota recusada, pagamento sem assinatura.</p>
          </div>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Mostrar resolvidas
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nada para resolver.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-primary)' }}>
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{KIND[x.kind] || x.kind}{x.market_name ? ` · ${x.market_name}` : ''}</strong>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(x.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-xs">{x.detail}</p>
                {x.status === 'OPEN' ? (
                  <div className="flex flex-wrap gap-2">
                    <input aria-label={`Como foi resolvida a exceção ${x.id}`} placeholder="Como foi resolvido (opcional)"
                      className="min-w-0 flex-1 rounded-md px-2 py-1 text-xs" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
                      value={notes[x.id] || ''} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
                    <button type="button" onClick={() => resolve(x.id)} className="rounded-md px-3 py-1 text-xs font-semibold"
                      style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}>Resolver</button>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Resolvida por {x.resolved_by}{x.resolution ? `: ${x.resolution}` : ''}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {message && <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>}
      </section>
    </div>
  );
};

export default RevenuePanel;
