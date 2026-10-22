import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { PageHero } from '../components/flow/Flow';
import { useAuth } from '../context/AuthContext';
import { privacyService, type ConsumerAnonymizationResult } from '../services/privacy.service';
import { apiError } from './copilot/shared';

/**
 * "Pedido de cliente (LGPD)" (S5): um cliente da loja pediu para apagar o CPF
 * dele. O dono ou o gerente digita o CPF, confirma e o sistema troca o CPF por
 * "***.***.***-NN" em todas as notas da loja e apaga o perfil desse cliente.
 */

const BTN = 'rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60';
const INPUT_STYLE = { background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-primary)' };

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
};

const PrivacyRequests: React.FC = () => {
  const { marketId, role, teamRole } = useAuth();
  const [cpf, setCpf] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConsumerAnonymizationResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Mesma regra do backend: só dono ou gerente.
  const allowed = teamRole ? teamRole === 'DONO' || teamRole === 'GERENTE'
    : role === 'MARKET_OWNER' || role === 'MARKET_MANAGER' || role === 'ADMIN';
  const digits = cpf.replace(/\D/g, '');

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setResult(null);
    if (digits.length !== 11) { setMessage('Digite os 11 números do CPF.'); return; }
    setConfirming(true);
  };

  const run = async () => {
    if (!marketId) return;
    setBusy(true);
    setMessage(null);
    try {
      setResult(await privacyService.anonymizeConsumer(marketId, digits));
      setCpf('');
      setConfirming(false);
    } catch (err) {
      setMessage(apiError(err, 'Não foi possível concluir agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="flex max-w-2xl flex-col gap-6">
        <PageHero name="Pedido de cliente (LGPD)"
          title="Um cliente pediu para apagar o CPF dele? Faça aqui." />

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
            <ShieldCheck className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Apagar o CPF de um cliente</p>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <p>A lei (LGPD) dá ao cliente o direito de pedir que a loja apague os dados dele. Quando você confirmar:</p>
              <ul className="list-disc pl-5" style={{ color: 'var(--text-muted)' }}>
                <li>o CPF some de todas as notas da sua loja e fica só com os 2 últimos números (***.***.***-12);</li>
                <li>o histórico de compras desse cliente na tela Clientes é apagado;</li>
                <li>as notas e os valores de venda continuam iguais. Nada muda no seu faturamento.</li>
              </ul>
              <p style={{ color: 'var(--text-muted)' }}>Não dá para desfazer. O MercadoFlow não guarda o CPF digitado aqui.</p>
            </div>

            {!allowed ? (
              <p className="text-sm" role="status" style={{ color: 'var(--text-muted)' }}>
                Só o dono ou o gerente da loja pode fazer isso. Peça a um deles.
              </p>
            ) : (
              <form onSubmit={ask} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  CPF do cliente
                  <input value={cpf} onChange={(e) => { setCpf(formatCpf(e.target.value)); setConfirming(false); }}
                    inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14}
                    className="rounded-lg px-3 py-2 text-sm font-normal" style={INPUT_STYLE} disabled={busy} />
                </label>
                {!confirming ? (
                  <button type="submit" className={BTN} style={{ background: 'var(--brand-500)', color: '#fff', alignSelf: 'flex-start' }}>
                    Continuar
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 rounded-lg p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-sm" style={{ color: '#991b1b' }}>
                      Confirma apagar o CPF {cpf} de todas as notas e o histórico desse cliente? Não dá para desfazer.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={BTN} style={{ background: '#dc2626', color: '#fff' }} disabled={busy} onClick={() => { void run(); }}>
                        {busy ? 'Apagando...' : 'Sim, apagar'}
                      </button>
                      <button type="button" className={BTN} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
                        disabled={busy} onClick={() => setConfirming(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {message && <p className="text-sm" role="alert" style={{ color: '#dc2626' }}>{message}</p>}
            {result && (
              <div className="rounded-lg p-4 text-sm" role="status" style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}>
                <p className="font-semibold">Pronto. Pedido atendido.</p>
                <p>
                  {result.notasAlteradas === 0
                    ? 'Nenhuma nota da loja tinha esse CPF em claro.'
                    : result.notasAlteradas === 1
                      ? '1 nota teve o CPF apagado.'
                      : `${result.notasAlteradas.toLocaleString('pt-BR')} notas tiveram o CPF apagado.`}
                  {' '}{result.perfilApagado ? 'O histórico do cliente também foi apagado.' : 'Não havia histórico desse cliente.'}
                </p>
                <p style={{ color: 'var(--text-muted)' }}>
                  Fica registrado que o pedido foi atendido hoje (só com o final {result.cpfFinal} do CPF). Você pode avisar o cliente.
                </p>
              </div>
            )}
          </div>
        </div>

        <Link to="/app/configuracoes" className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>Voltar para Configurações</Link>
      </div>
    </Layout>
  );
};

export default PrivacyRequests;
