import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/**
 * Segurança da própria conta: verificação em duas etapas (dono e financeiro)
 * e o pedido de titularidade que chegou para esta pessoa.
 */

interface Setup { secret: string; otpauthUri: string; qrPng: string }
interface Transfer { id: string; from_name: string; market_name: string; expires_at: string }

const BTN = 'rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60';
const INPUT = 'rounded-lg px-3 py-2 text-sm';
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const SecurityCard: React.FC = () => {
  const { refresh } = useAuth();
  const [status, setStatus] = useState<{ enabled: boolean; available: boolean } | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/v1/me/2fa').then(({ data }) => setStatus(data)).catch(() => setStatus(null));
    api.get<Transfer[]>('/v1/me/ownership-transfers').then(({ data }) => setTransfers(data)).catch(() => setTransfers([]));
  };

  useEffect(load, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (err: any) {
      setMessage(err?.response?.data?.userMessage || 'Não foi possível concluir agora.');
    } finally {
      setBusy(false);
    }
  };

  if (!status && transfers.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }} data-testid="security-card">
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
        <KeyRound className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Segurança</p>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {transfers.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-lg p-3" style={{ background: '#eef2ff' }}>
            <p className="text-sm" style={{ color: '#3730a3' }}>
              {t.from_name} quer passar para você a titularidade de {t.market_name}. Como dono, você cuida da assinatura e da equipe.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className={BTN} style={{ background: '#4f46e5', color: '#fff' }}
                onClick={() => run(async () => { await api.post(`/v1/me/ownership-transfers/${t.id}/accept`); await refresh(); load(); setMessage('Agora você é o dono da conta.'); })}>
                Aceitar a titularidade
              </button>
              <button type="button" disabled={busy} className={BTN} style={{ color: '#3730a3' }}
                onClick={() => run(async () => { await api.post(`/v1/me/ownership-transfers/${t.id}/decline`); load(); setMessage('Pedido recusado.'); })}>
                Recusar
              </button>
            </div>
          </div>
        ))}

        {status?.available && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Verificação em duas etapas: {status.enabled ? 'ligada' : 'desligada'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Além da senha, o login pede um código do aplicativo autenticador do celular (Google Authenticator, Microsoft Authenticator ou Authy).
              </p>
            </div>

            {codes && (
              <div className="rounded-lg p-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }} data-testid="recovery-codes">
                <p className="text-sm font-semibold" style={{ color: '#92400e' }}>Guarde estes códigos de recuperação</p>
                <p className="text-xs" style={{ color: '#92400e' }}>Cada um entra uma vez, se você ficar sem o celular. Eles não aparecem de novo.</p>
                <p className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm" style={{ color: '#78350f' }}>
                  {codes.map((c) => <span key={c}>{c}</span>)}
                </p>
              </div>
            )}

            {!status.enabled && !setup && (
              <button type="button" disabled={busy} className={BTN} style={{ background: 'var(--brand-500, #22c55e)', color: '#fff', alignSelf: 'flex-start' }}
                onClick={() => run(async () => { const { data } = await api.post<Setup>('/v1/me/2fa/setup'); setSetup(data); })}>
                Ligar a verificação em duas etapas
              </button>
            )}

            {!status.enabled && setup && (
              <form className="flex flex-col gap-3" onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { data } = await api.post<{ recoveryCodes: string[] }>('/v1/me/2fa/enable', { code });
                  setCodes(data.recoveryCodes);
                  setSetup(null);
                  setCode('');
                  load();
                  await refresh();
                });
              }}>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>1. No aplicativo, leia o QR (ou digite a chave).</p>
                <img src={`data:image/png;base64,${setup.qrPng}`} alt="QR para o aplicativo autenticador" className="h-44 w-44" />
                <p className="break-all font-mono text-xs" style={{ color: 'var(--text-muted)' }} data-testid="totp-secret">{setup.secret}</p>
                <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                  2. Digite o código de 6 números que aparece
                  <input className={INPUT} style={INPUT_STYLE} inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
                <button type="submit" disabled={busy} className={BTN} style={{ background: 'var(--brand-500, #22c55e)', color: '#fff', alignSelf: 'flex-start' }}>
                  Confirmar e ligar
                </button>
              </form>
            )}

            {status.enabled && !disabling && (
              <button type="button" className={BTN} style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)', alignSelf: 'flex-start' }}
                onClick={() => setDisabling(true)}>
                Desligar
              </button>
            )}
            {status.enabled && disabling && (
              <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api.post('/v1/me/2fa/disable', { password, code });
                  setDisabling(false);
                  setPassword('');
                  setCode('');
                  setCodes(null);
                  load();
                  await refresh();
                });
              }}>
                <input className={INPUT} style={INPUT_STYLE} type="password" placeholder="Sua senha" aria-label="Sua senha" required value={password} onChange={(e) => setPassword(e.target.value)} />
                <input className={INPUT} style={INPUT_STYLE} inputMode="numeric" placeholder="Código do aplicativo" aria-label="Código do aplicativo" required value={code} onChange={(e) => setCode(e.target.value)} />
                <button type="submit" disabled={busy} className={BTN} style={{ color: '#b91c1c', border: '1px solid #fecaca' }}>Confirmar e desligar</button>
              </form>
            )}
          </div>
        )}

        {message && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default SecurityCard;
