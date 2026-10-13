import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import {
  connectPublicInfo,
  integrationsService,
  type ConnectPreview,
  type ConnectPublicInfo,
} from '../services/integrations.service';
import { clearPendingConnect, savePendingConnect } from '../utils/pendingConnect';
import { apiError } from './copilot/shared';

/**
 * "Conectar ao MercadoFlow", aberto de dentro do Bipae (ou de outro sistema
 * parceiro). Quem não está logado entra ou cria a conta e volta para cá; o
 * dono confere as permissões e aprova. Depois volta para o sistema que pediu.
 */

const formatCnpj = (c: string | null) =>
  c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c ?? '';

const STATUS_TEXT: Record<string, string> = {
  APROVADO: 'Esta conexão já foi aprovada.',
  RECUSADO: 'Esta conexão foi recusada. Gere um novo link no seu sistema se quiser tentar de novo.',
  EXPIRADO: 'Este link venceu. Gere um novo no seu sistema.',
  INDISPONIVEL: 'Este sistema não está disponível no momento.',
};

const Connect: React.FC = () => {
  const location = useLocation();
  const { userId, marketId, role, loading: authLoading } = useAuth();
  const code = useMemo(() => new URLSearchParams(location.search).get('code')?.trim() ?? '', [location.search]);

  const [info, setInfo] = useState<ConnectPublicInfo | null>(null);
  const [preview, setPreview] = useState<ConnectPreview | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ approved: boolean; returnUrl: string | null } | null>(null);

  // Antes do login: quem pede, e guarda o pedido para voltar depois de entrar.
  useEffect(() => {
    if (!code) return;
    connectPublicInfo(code)
      .then((i) => {
        setInfo(i);
        if (i.status === 'PENDENTE') {
          savePendingConnect({ code, cnpj: i.cnpj ?? undefined, email: i.ownerEmail ?? undefined, storeName: i.storeName ?? undefined });
        }
      })
      .catch(() => setError('Link de conexão inválido. Gere outro no seu sistema.'));
  }, [code]);

  // Logado numa loja: o que exatamente será liberado.
  useEffect(() => {
    if (!code || !userId || !marketId) return;
    integrationsService.connectPreview(marketId, code)
      .then((p) => {
        setPreview(p);
        setChosen(new Set(Object.keys(p.scopes)));
      })
      .catch((e) => setError(apiError(e, 'Não foi possível abrir este pedido de conexão.')));
  }, [code, userId, marketId]);

  const flip = (k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const finish = (approved: boolean, returnUrl: string | null) => {
    clearPendingConnect();
    setDone({ approved, returnUrl });
    if (returnUrl) window.setTimeout(() => { window.location.href = returnUrl; }, 2500);
  };

  const approve = async () => {
    if (!marketId) return;
    setBusy(true); setError(null);
    try {
      const r = await integrationsService.connectApprove(marketId, code, [...chosen]);
      finish(true, r.returnUrl);
    } catch (e) {
      setError(apiError(e, 'Não foi possível aprovar agora.'));
    } finally {
      setBusy(false);
    }
  };

  const refuse = async () => {
    if (!marketId) return;
    setBusy(true); setError(null);
    try {
      const r = await integrationsService.connectRefuse(marketId, code);
      finish(false, r.returnUrl);
    } catch (e) {
      setError(apiError(e, 'Não foi possível recusar agora.'));
    } finally {
      setBusy(false);
    }
  };

  const partner = preview?.partnerName ?? info?.partnerName ?? 'O seu sistema';
  const status = preview?.status ?? info?.status;
  const muted = 'text-sm text-slate-500';
  const isStoreUser = role !== 'INDUSTRY_USER' && role !== 'SELLER_USER';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Conectar ao MercadoFlow</h1>
          <p className={muted}>{partner} quer conversar com a sua loja no MercadoFlow.</p>
        </header>

        <Card className="p-6">
          {!code && <p className={muted}>Abra este link pelo botão "Conectar ao MercadoFlow" do seu sistema.</p>}

          {code && error && !preview && <p className="text-sm font-medium text-red-600">{error}</p>}

          {code && !error && (authLoading || !info) && <p className={muted}>Verificando o link...</p>}

          {done && (
            <div className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">{done.approved ? 'Conectado!' : 'Conexão recusada'}</h2>
              <p className={muted}>
                {done.approved
                  ? `${partner} já pode trocar dados com a sua loja. Você muda ou revoga quando quiser em Integrações.`
                  : `${partner} não terá acesso à sua loja.`}
                {done.returnUrl ? ' Voltando para o seu sistema...' : ''}
              </p>
              {done.returnUrl
                ? <a className="fx-btn dark" style={{ justifyContent: 'center' }} href={done.returnUrl}>Voltar para o {partner}</a>
                : <Link className="fx-btn dark" style={{ justifyContent: 'center' }} to="/app/integracoes">Ver integrações</Link>}
            </div>
          )}

          {!done && info && !authLoading && status && status !== 'PENDENTE' && (
            <p className={muted}>{STATUS_TEXT[status] ?? 'Este link não está mais disponível.'}</p>
          )}

          {!done && info && !authLoading && status === 'PENDENTE' && !userId && (
            <div className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Entre na conta da loja</h2>
              <p className={muted}>
                {info.storeName ? `Loja: ${info.storeName}${info.cnpj ? ` (${formatCnpj(info.cnpj)})` : ''}. ` : ''}
                Entre com a conta do dono da loja no MercadoFlow para aprovar. Ainda não tem conta? Crie em 1 minuto: os dados da loja já vêm preenchidos.
              </p>
              <Link className="fx-btn dark" style={{ justifyContent: 'center' }} to="/login">Entrar</Link>
              <Link className="fx-btn ghost" style={{ justifyContent: 'center' }} to="/register">Criar conta grátis</Link>
            </div>
          )}

          {!done && userId && !isStoreUser && (
            <p className={muted}>Esta conta não é de uma loja. Entre com a conta do dono da loja.</p>
          )}

          {!done && userId && isStoreUser && preview && preview.status === 'PENDENTE' && (
            <div className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">O que o {preview.partnerName} vai poder fazer</h2>
              {!preview.cnpjMatches && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  O {preview.partnerName} pediu a conexão para o CNPJ {formatCnpj(preview.cnpj)}, mas você está na loja de CNPJ {formatCnpj(preview.marketCnpj)}.
                  Confira se é a loja certa antes de aprovar.
                </p>
              )}
              <div className="grid gap-2">
                {Object.entries(preview.scopes).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
                    <input type="checkbox" className="mt-1" checked={chosen.has(k)} onChange={() => flip(k)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className={muted}>
                {preview.firstParty
                  ? 'Sistema da mesma empresa do MercadoFlow. Giro, tração e previsão continuam só aqui.'
                  : 'Giro, tração, previsão e as recomendações do Tino nunca saem para o sistema.'}
                {' '}Só o dono da loja aprova, e pode revogar quando quiser em Integrações.
              </p>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <Button onClick={approve} disabled={busy || chosen.size === 0}>{busy ? 'Conectando...' : 'Aprovar conexão'}</Button>
              <Button variant="secondary" onClick={refuse} disabled={busy}>Recusar</Button>
            </div>
          )}

          {!done && userId && isStoreUser && preview && preview.status !== 'PENDENTE' && (
            <p className={muted}>{STATUS_TEXT[preview.status] ?? 'Este link não está mais disponível.'}</p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Connect;
