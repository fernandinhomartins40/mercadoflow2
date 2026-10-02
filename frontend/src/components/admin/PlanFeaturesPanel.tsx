import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * O que cada plano dá, numa tabela: a mesma que a vitrine mostra e o sistema
 * consulta. Mudar aqui vale na hora para todos os assinantes do plano.
 * Também os preços dos adicionais e por que as contas saíram.
 */

interface FeatureView { key: string; label: string; kind: 'BOOL' | 'NUMBER'; unit?: string | null; group: string; enabled: boolean; amount?: number | null }
interface Matrix { definitions: { key: string; label: string; kind: string; unit?: string; group: string }[]; plans: Record<string, FeatureView[]>; changes: Record<string, any>[] }
interface AddonRow { code: string; name: string; monthly_price_cents: number; active: boolean }
interface ExitRow { reason: string; comment?: string; outcome: string; created_at: string; market_name: string }

const PLANS: { code: string; name: string }[] = [
  { code: 'FREE', name: 'Grátis' }, { code: 'ESSENCIAL', name: 'Essencial' }, { code: 'PROFISSIONAL', name: 'Profissional' }, { code: 'REDE', name: 'Rede' },
];
const REASONS: Record<string, string> = {
  PRECO: 'Preço', POUCO_USO: 'Pouco uso', FALTOU_RECURSO: 'Faltou recurso', SAZONAL: 'Temporada fraca', FECHOU_LOJA: 'Fechou a loja', OUTRO: 'Outro',
};
const BOX = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)' };

const PlanFeaturesPanel: React.FC = () => {
  const [m, setM] = useState<Matrix | null>(null);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [exits, setExits] = useState<ExitRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [f, a, e] = await Promise.all([
      api.get<Matrix>('/v1/super-admin/billing/features'),
      api.get<AddonRow[]>('/v1/super-admin/billing/addons'),
      api.get<ExitRow[]>('/v1/super-admin/billing/exits'),
    ]);
    setM(f.data);
    setAddons(a.data);
    setExits(e.data);
  };

  useEffect(() => {
    load().catch(() => setMessage('Não foi possível carregar os recursos dos planos.'));
  }, []);

  const save = async (plan: string, key: string, body: { enabled?: boolean; amount?: number }, label: string) => {
    setMessage(null);
    // A caixa responde na hora; o servidor confirma em seguida.
    setM((cur) => cur && ({
      ...cur,
      plans: { ...cur.plans, [plan]: cur.plans[plan].map((f) => (f.key === key ? { ...f, ...body } : f)) },
    }));
    try {
      await api.put(`/v1/super-admin/billing/features/${plan}/${key}`, body);
      await load();
      setMessage(`${label} salvo para o plano ${PLANS.find((p) => p.code === plan)?.name}.`);
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível salvar.');
    }
  };

  const saveAddon = async (code: string, reais: string) => {
    const cents = Math.round(Number(reais.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setMessage('Preço inválido.');
      return;
    }
    try {
      const { data } = await api.put<AddonRow[]>(`/v1/super-admin/billing/addons/${code}`, { monthlyPriceCents: cents });
      setAddons(data);
      setMessage('Preço do adicional salvo.');
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível salvar o adicional.');
    }
  };

  if (!m) return message ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p> : null;

  return (
    <section className="flex flex-col gap-4 rounded-xl p-4" style={BOX} data-testid="plan-features">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>O que cada plano dá</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          A vitrine de planos e o sistema leem esta tabela. Mudou aqui, vale na hora para todos os assinantes do plano.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="py-2 text-left font-semibold">Recurso</th>
              {PLANS.map((p) => <th key={p.code} className="px-2 py-2 text-center font-semibold">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.definitions.map((d) => (
              <tr key={d.key} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                <td className="py-2 pr-2" style={{ color: 'var(--text-primary)' }}>
                  {d.label}
                  <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.group}</span>
                </td>
                {PLANS.map((p) => {
                  const f = m.plans[p.code]?.find((x) => x.key === d.key);
                  return (
                    <td key={p.code} className="px-2 py-2 text-center">
                      {d.kind === 'BOOL' ? (
                        <input type="checkbox" aria-label={`${d.label} no plano ${p.name}`} checked={!!f?.enabled}
                          onChange={(e) => save(p.code, d.key, { enabled: e.target.checked }, d.label)} />
                      ) : (
                        <input type="number" min={0} aria-label={`${d.label} no plano ${p.name}`} defaultValue={f?.amount ?? ''}
                          key={`${p.code}-${d.key}-${f?.amount}`}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (e.target.value !== '' && v !== f?.amount) void save(p.code, d.key, { amount: v, enabled: true }, d.label);
                          }}
                          className="w-20 rounded-md px-2 py-1 text-right text-sm"
                          style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Adicionais</h3>
        <div className="flex flex-wrap gap-3">
          {addons.map((a) => (
            <label key={a.code} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              {a.name} R$
              <input aria-label={`Preço mensal de ${a.name}`} defaultValue={(a.monthly_price_cents / 100).toFixed(2).replace('.', ',')}
                key={`${a.code}-${a.monthly_price_cents}`}
                onBlur={(e) => {
                  if (Math.round(Number(e.target.value.replace(',', '.')) * 100) !== a.monthly_price_cents) void saveAddon(a.code, e.target.value);
                }}
                className="w-24 rounded-md px-2 py-1 text-right text-sm"
                style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }} />
              /mês
            </label>
          ))}
        </div>
      </div>

      {message && <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Por que saíram</h3>
        {exits.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum cancelamento ou pausa ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-primary)' }}>
            {exits.slice(0, 20).map((x, i) => (
              <li key={i}>
                {new Date(x.created_at).toLocaleDateString('pt-BR')} · {x.market_name} · {x.outcome === 'PAUSED' ? 'pausou' : 'cancelou'} ·{' '}
                {REASONS[x.reason] || x.reason}{x.comment ? ` — "${x.comment}"` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default PlanFeaturesPanel;
