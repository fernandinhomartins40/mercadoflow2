import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

/**
 * Cobrança brasileira (Asaas): situação da chave, aviso de pagamento que
 * confirma Pix e boleto sozinho, e a nota fiscal de serviço emitida a cada
 * pagamento da assinatura.
 */

interface AsaasStatus {
  configured: boolean;
  webhookRegistered: boolean;
  webhookAt?: string | null;
  webhookUrl: string;
  nfseEnabled: boolean;
  nfseServiceCode?: string | null;
  nfseServiceName?: string | null;
  nfseIssRate?: number | null;
  nfseObservations?: string | null;
}

const BOX = { background: 'var(--surface-base)', border: '1px solid var(--border-soft)' };
const INPUT = 'rounded-lg px-3 py-2 text-sm';
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const AsaasBillingPanel: React.FC = () => {
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [draft, setDraft] = useState<AsaasStatus | null>(null);
  const [busy, setBusy] = useState<'webhook' | 'nfse' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api.get<AsaasStatus>('/v1/super-admin/billing/asaas').then(({ data }) => {
    setStatus(data);
    setDraft(data);
  }).catch(() => setMessage('Não foi possível carregar a cobrança brasileira.'));

  useEffect(() => {
    void load();
  }, []);

  const registerWebhook = async () => {
    setBusy('webhook');
    setMessage(null);
    try {
      await api.post('/v1/super-admin/billing/asaas/webhook', {});
      await load();
      setMessage('Avisos de pagamento conectados.');
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível conectar os avisos.');
    } finally {
      setBusy(null);
    }
  };

  const saveNfse = async () => {
    if (!draft) return;
    setBusy('nfse');
    setMessage(null);
    try {
      const { data } = await api.put<AsaasStatus>('/v1/super-admin/billing/invoice-settings', {
        nfseEnabled: draft.nfseEnabled,
        nfseServiceCode: draft.nfseServiceCode,
        nfseServiceName: draft.nfseServiceName,
        nfseIssRate: draft.nfseIssRate,
        nfseObservations: draft.nfseObservations,
      });
      setStatus(data);
      setDraft(data);
      setMessage('Nota fiscal salva. Vale para as próximas assinaturas.');
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível salvar a nota fiscal.');
    } finally {
      setBusy(null);
    }
  };

  if (!status || !draft) {
    return message ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p> : null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl p-4" style={BOX} data-testid="asaas-panel">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Pix e boleto (Asaas)</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          O lojista escolhe Pix, boleto ou cartão ao assinar. Pix e boleto confirmam sozinhos pelo aviso do Asaas;
          o cartão segue no Stripe.
        </p>
      </div>

      {!status.configured ? (
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          Cadastre e ligue a chave do Asaas em{' '}
          <Link to="/super-admin/ia" className="font-semibold text-green-700 hover:underline">IA e APIs → Chaves e canais</Link>.
          Até lá, só o cartão aparece no checkout.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {status.webhookRegistered
              ? `Avisos de pagamento conectados${status.webhookAt ? ` em ${new Date(status.webhookAt).toLocaleString('pt-BR')}` : ''}.`
              : 'Falta conectar os avisos de pagamento: sem eles, Pix e boleto não confirmam sozinhos.'}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={registerWebhook}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={status.webhookRegistered
              ? { border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }
              : { background: 'var(--brand-500, #22c55e)', color: '#fff' }}
          >
            {busy === 'webhook' ? 'Conectando...' : status.webhookRegistered ? 'Reconectar avisos' : 'Conectar avisos de pagamento'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
        <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <input
            type="checkbox"
            checked={draft.nfseEnabled}
            onChange={(e) => setDraft({ ...draft, nfseEnabled: e.target.checked })}
          />
          Emitir nota fiscal de serviço a cada pagamento (Pix e boleto)
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Código do serviço municipal</span>
            <input className={INPUT} style={INPUT_STYLE} value={draft.nfseServiceCode ?? ''}
              onChange={(e) => setDraft({ ...draft, nfseServiceCode: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Descrição do serviço</span>
            <input className={INPUT} style={INPUT_STYLE} value={draft.nfseServiceName ?? ''}
              onChange={(e) => setDraft({ ...draft, nfseServiceName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>ISS (%)</span>
            <input className={INPUT} style={INPUT_STYLE} inputMode="decimal" value={draft.nfseIssRate ?? ''}
              onChange={(e) => setDraft({ ...draft, nfseIssRate: e.target.value as unknown as number })} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Observações na nota</span>
            <input className={INPUT} style={INPUT_STYLE} value={draft.nfseObservations ?? ''}
              onChange={(e) => setDraft({ ...draft, nfseObservations: e.target.value })} />
          </label>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          A emissão usa a configuração fiscal da conta no Asaas (prefeitura e certificado). Confira o código com a sua contabilidade.
        </p>
        <div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={saveNfse}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
          >
            {busy === 'nfse' ? 'Salvando...' : 'Salvar nota fiscal'}
          </button>
        </div>
      </div>

      {message && <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>}
    </section>
  );
};

export default AsaasBillingPanel;
