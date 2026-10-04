import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, Coins, Loader2, Sparkles } from 'lucide-react';
import api from '../../services/api';

/**
 * Liberar acesso sem a plataforma de pagamento: um plano pago por um período
 * (cortesia, volta sozinha ao Grátis no fim) e créditos de IA na carteira.
 * Usa as ações rápidas da ficha da conta; tudo fica no histórico com quem fez.
 */

interface Sheet {
  subscription: { status: string; planCode: string; currentPeriodEnd?: string; trialEndsAt?: string };
  wallet: { available?: number; balance: number };
}

const PLANS = [
  { code: 'ESSENCIAL', label: 'Essencial' },
  { code: 'PROFISSIONAL', label: 'Profissional' },
  { code: 'REDE', label: 'Rede' },
];
const DAYS = [7, 15, 30, 60, 90];
const CREDITS = [100, 500, 1000, 5000];
const PLAN_NAME: Record<string, string> = { FREE: 'Grátis', ESSENCIAL: 'Essencial', PROFISSIONAL: 'Profissional', REDE: 'Rede' };
const STATUS: Record<string, string> = {
  FREE: 'no Grátis', TRIAL: 'em teste', ACTIVE: 'ativa', PAST_DUE: 'com pagamento em aberto', RESTRICTED: 'só consulta', CANCELLED: 'cancelada', PAUSED: 'pausada',
};

const day = (d: Date) => d.toLocaleDateString('pt-BR');
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const chip = (on: boolean): React.CSSProperties => (on
  ? { background: 'var(--fx-forest, #0F3A29)', color: '#fff', border: '1px solid var(--fx-forest, #0F3A29)' }
  : { background: '#fff', color: 'var(--text-primary)', border: '1px solid var(--border-soft)' });

const GrantAccessPanel: React.FC<{ marketId: string; marketName?: string; onChanged?: () => void }> = ({ marketId, marketName, onChanged }) => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [plan, setPlan] = useState('PROFISSIONAL');
  const [days, setDays] = useState(30);
  const [credits, setCredits] = useState(500);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'plan' | 'credits' | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get<Sheet>(`/v1/super-admin/billing/accounts/${marketId}`).then(({ data }) => setSheet(data)).catch(() => setSheet(null));
  }, [marketId]);

  const run = async (kind: 'plan' | 'credits') => {
    setBusy(kind);
    setDone(null);
    try {
      const body = kind === 'plan'
        ? { action: 'COURTESY', plan, days, reason }
        : { action: 'CREDITS', credits, reason };
      const { data } = await api.post<Sheet>(`/v1/super-admin/billing/accounts/${marketId}/actions`, body);
      setSheet(data);
      setDone({
        ok: true,
        text: kind === 'plan'
          ? `Liberado: ${PLAN_NAME[plan]} por ${days} dias, até ${day(inDays(days))}. Depois volta sozinho ao Grátis.`
          : `${credits.toLocaleString('pt-BR')} créditos de IA na conta. Saldo agora: ${(data.wallet.available ?? data.wallet.balance).toLocaleString('pt-BR')}.`,
      });
      onChanged?.();
    } catch (err: any) {
      setDone({ ok: false, text: err?.response?.data?.userMessage || err?.response?.data?.message || 'Não foi possível concluir.' });
    } finally {
      setBusy(null);
    }
  };

  const balance = sheet ? (sheet.wallet.available ?? sheet.wallet.balance) : null;
  const sub = sheet?.subscription;
  const until = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;

  return (
    <section aria-label="Liberar acesso" data-testid="grant-access" className="flex flex-col gap-3">
      <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--fx-lime-soft, #F4FBDD)', border: '1px solid var(--fx-lime-line, #CFE57A)', color: 'var(--text-primary)' }}>
        {sub ? (
          <>Hoje {marketName ? <b>{marketName}</b> : 'a conta'} está no <b>{PLAN_NAME[sub.planCode] ?? sub.planCode}</b>, {STATUS[sub.status] ?? sub.status}
            {until ? `, até ${day(until)}` : ''}, com <b>{(balance ?? 0).toLocaleString('pt-BR')}</b> créditos de IA.</>
        ) : 'Carregando a situação da conta…'}
      </div>

      {/* Plano pago por um período */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <CalendarClock size={16} aria-hidden="true" /> Liberar plano pago por um período
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Sem cobrança. No fim do período a conta volta sozinha ao Grátis, sem perder dados.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Plano">
          {PLANS.map((p) => (
            <button key={p.code} type="button" aria-pressed={plan === p.code} onClick={() => setPlan(p.code)}
              className="rounded-full px-4 py-1.5 text-sm font-semibold" style={chip(plan === p.code)}>{p.label}</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Dias">
          {DAYS.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold" style={chip(days === d)}>{d} dias</button>
          ))}
          <label className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            ou
            <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              aria-label="Outro número de dias" className="w-20 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border-soft)' }} />
            dias
          </label>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => run('plan')}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60"
          style={{ background: 'var(--fx-forest, #0F3A29)', color: '#fff' }}>
          {busy === 'plan' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Liberar {PLAN_NAME[plan]} por {days} dias (até {day(inDays(days))})
        </button>
      </div>

      {/* Créditos de IA */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Coins size={16} aria-hidden="true" /> Pôr créditos de IA
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Entram na carteira da conta como cortesia e não vencem.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Créditos">
          {CREDITS.map((c) => (
            <button key={c} type="button" aria-pressed={credits === c} onClick={() => setCredits(c)}
              className="rounded-full px-3 py-1.5 text-sm font-semibold" style={chip(credits === c)}>{c.toLocaleString('pt-BR')}</button>
          ))}
          <label className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            ou
            <input type="number" min={1} max={100000} value={credits} onChange={(e) => setCredits(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))}
              aria-label="Outra quantidade de créditos" className="w-24 rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid var(--border-soft)' }} />
          </label>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => run('credits')}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60"
          style={{ background: 'var(--fx-forest, #0F3A29)', color: '#fff' }}>
          {busy === 'credits' ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />}
          Pôr {credits.toLocaleString('pt-BR')} créditos
        </button>
      </div>

      <input placeholder="Motivo (opcional, fica no histórico): ex. teste do cliente" value={reason} onChange={(e) => setReason(e.target.value)}
        aria-label="Motivo" className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }} />

      {done && (
        <p role="status" className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={done.ok ? { background: '#E2F3E7', color: '#0F6332' } : { background: '#FDE4E1', color: '#C2362B' }}>
          {done.ok && <Check size={16} className="mt-0.5 shrink-0" />}{done.text}
        </p>
      )}
    </section>
  );
};

export default GrantAccessPanel;
