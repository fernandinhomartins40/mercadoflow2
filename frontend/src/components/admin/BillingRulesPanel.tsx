import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Regras do ciclo das assinaturas: dias de teste grátis, carência depois de um
 * pagamento falhar e quanto tempo a conta fica só para consulta antes de voltar
 * ao Grátis. O ciclo roda todo dia às 8h15; "Rodar agora" adianta.
 */

interface Rules {
  trialDays: number;
  graceDays: number;
  restrictedDays: number;
}

interface LifecycleResult {
  trialsEnded: number;
  trialReminders: number;
  restricted: number;
  backToFree: number;
  canceledAtEnd: number;
}

const FIELDS: { key: keyof Rules; label: string; hint: string; min: number; max: number }[] = [
  { key: 'trialDays', label: 'Teste grátis (dias)', hint: 'Sem cartão, uma vez por conta. 0 desliga o teste.', min: 0, max: 60 },
  { key: 'graceDays', label: 'Carência (dias)', hint: 'Pagamento em atraso com tudo funcionando.', min: 0, max: 60 },
  { key: 'restrictedDays', label: 'Só consulta (dias)', hint: 'Depois disso, a conta volta ao Grátis.', min: 1, max: 365 },
];

const BillingRulesPanel: React.FC = () => {
  const [rules, setRules] = useState<Rules | null>(null);
  const [draft, setDraft] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<Rules>('/v1/super-admin/billing/settings').then(({ data }) => {
      setRules(data);
      setDraft(data);
    }).catch(() => setMessage('Não foi possível carregar as regras do ciclo.'));
  }, []);

  const changed = !!rules && !!draft && FIELDS.some((f) => rules[f.key] !== draft[f.key]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await api.put<Rules>('/v1/super-admin/billing/settings', draft);
      setRules(data);
      setDraft(data);
      setMessage('Regras salvas.');
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível salvar as regras.');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const { data } = await api.post<LifecycleResult>('/v1/super-admin/billing/lifecycle/run');
      setMessage(`Ciclo rodado: ${data.trialsEnded} teste(s) encerrado(s), ${data.trialReminders} lembrete(s), `
        + `${data.restricted} conta(s) restrita(s), ${data.backToFree} de volta ao Grátis, ${data.canceledAtEnd} cancelada(s).`);
    } catch {
      setMessage('Não foi possível rodar o ciclo agora.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
      data-testid="billing-rules"
    >
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Ciclo das assinaturas</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Quem não paga nunca perde a conta: passa pela carência, fica só para consulta e volta ao plano Grátis.
        </p>
      </div>
      {draft && (
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
              />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{f.hint}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!changed || saving}
          onClick={save}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
        >
          {saving ? 'Salvando...' : 'Salvar regras'}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={runNow}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}
        >
          {running ? 'Rodando...' : 'Rodar o ciclo agora'}
        </button>
        {message && <span role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</span>}
      </div>
    </section>
  );
};

export default BillingRulesPanel;
