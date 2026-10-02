import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Ficha da conta no superadmin: pagamentos, avisos enviados, saídas e
 * exceções, com ações rápidas (prorrogar teste, cortesia, créditos, trocar de
 * plano sem cobrar). Tudo fica no histórico com quem fez.
 */

interface Sheet {
  subscription: { status: string; planCode: string; trialEndsAt?: string; currentPeriodEnd?: string; bannerMessage?: string };
  wallet: { available?: number; balance: number };
  payments: { provider: string; kind: string; value_cents: number; method?: string; paid_at: string }[];
  notices: { kind: string; title: string; created_at: string; emailed_at?: string; whatsapp_at?: string; read_at?: string }[];
  exits: { reason: string; comment?: string; outcome: string; created_at: string }[];
  exceptions: { id: number; kind: string; detail: string; status: string }[];
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const day = (s?: string) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
const REASONS: Record<string, string> = {
  PRECO: 'preço', POUCO_USO: 'pouco uso', FALTOU_RECURSO: 'faltou recurso', SAZONAL: 'temporada fraca', FECHOU_LOJA: 'fechou a loja', OUTRO: 'outro motivo',
};
const INPUT_STYLE = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const AccountSheet: React.FC<{ marketId: string; onChanged?: () => void }> = ({ marketId, onChanged }) => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [form, setForm] = useState({ action: 'EXTEND_TRIAL', days: 7, plan: 'ESSENCIAL', credits: 100, reason: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Sheet>(`/v1/super-admin/billing/accounts/${marketId}`).then(({ data }) => setSheet(data)).catch(() => setSheet(null));
  }, [marketId]);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await api.post<Sheet>(`/v1/super-admin/billing/accounts/${marketId}/actions`, form);
      setSheet(data);
      setMessage('Feito. Ficou registrado no histórico.');
      onChanged?.();
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  if (!sheet) return null;

  return (
    <div className="mt-4 flex flex-col gap-3" data-testid="account-sheet">
      <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
        <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Ações rápidas</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="Ação" className="rounded-md px-2 py-1.5 text-xs" style={INPUT_STYLE} value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="EXTEND_TRIAL">Prorrogar o teste</option>
            <option value="COURTESY">Cortesia de um plano por X dias</option>
            <option value="CREDITS">Conceder créditos de IA</option>
            <option value="CHANGE_PLAN">Trocar de plano sem cobrar</option>
          </select>
          {(form.action === 'EXTEND_TRIAL' || form.action === 'COURTESY') && (
            <input aria-label="Dias" type="number" min={1} className="rounded-md px-2 py-1.5 text-xs" style={INPUT_STYLE} value={form.days}
              onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} />
          )}
          {(form.action === 'COURTESY' || form.action === 'CHANGE_PLAN') && (
            <select aria-label="Plano" className="rounded-md px-2 py-1.5 text-xs" style={INPUT_STYLE} value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {form.action === 'CHANGE_PLAN' && <option value="FREE">Grátis</option>}
              <option value="ESSENCIAL">Essencial</option>
              <option value="PROFISSIONAL">Profissional</option>
              <option value="REDE">Rede</option>
            </select>
          )}
          {form.action === 'CREDITS' && (
            <input aria-label="Créditos" type="number" min={1} className="rounded-md px-2 py-1.5 text-xs" style={INPUT_STYLE} value={form.credits}
              onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
          )}
          <input aria-label="Motivo" placeholder="Motivo (fica no histórico)" className="rounded-md px-2 py-1.5 text-xs sm:col-span-2" style={INPUT_STYLE}
            value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <button type="button" disabled={busy} onClick={run} className="mt-2 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}>
          {busy ? 'Aplicando...' : 'Aplicar'}
        </button>
        {message && <p role="status" className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>}
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Assinatura: {sheet.subscription.status} · {sheet.subscription.planCode} · {sheet.wallet.available ?? sheet.wallet.balance} créditos de IA
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Pagamentos</p>
        {sheet.payments.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nenhum pagamento.</p> : (
          <ul className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {sheet.payments.slice(0, 10).map((p, i) => (
              <li key={i}>{day(p.paid_at)} · {brl(p.value_cents)} · {p.kind === 'SUBSCRIPTION' ? 'assinatura' : p.kind === 'AI' ? 'créditos de IA' : 'Confere'}{p.method ? ` · ${p.method}` : ''}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Avisos enviados</p>
        {sheet.notices.length === 0 ? <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nenhum aviso.</p> : (
          <ul className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {sheet.notices.slice(0, 10).map((n, i) => (
              <li key={i}>{day(n.created_at)} · {n.title}{n.emailed_at ? ' · e-mail' : ''}{n.whatsapp_at ? ' · WhatsApp' : ''}{n.read_at ? ' · lido' : ''}</li>
            ))}
          </ul>
        )}
      </div>
      {sheet.exits.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Saídas</p>
          <ul className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {sheet.exits.map((x, i) => <li key={i}>{day(x.created_at)} · {x.outcome === 'PAUSED' ? 'pausou' : 'cancelou'} · {REASONS[x.reason] || x.reason}{x.comment ? ` — "${x.comment}"` : ''}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AccountSheet;
