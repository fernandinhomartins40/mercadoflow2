import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import agentPairingService, { type PairingSessionInfo } from '../services/agentPairing.service';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

/**
 * Passo a passo aberto pelo usuário ao ler o QR Code exibido pelo Agente
 * Mercado Flow. Autentica, nomeia o PDV e libera a chave de API — que é
 * entregue diretamente ao agente, sem nunca passar pelas mãos do usuário.
 */

type Stage = 'loading' | 'invalid' | 'code' | 'login' | 'naming' | 'done';

const STEP_LABELS = ['Identificar', 'Entrar', 'Nomear PDV', 'Pronto'];

const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const StepDots: React.FC<{ current: number }> = ({ current }) => (
  <ol className="mb-6 flex items-center justify-between gap-2">
    {STEP_LABELS.map((label, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li key={label} className="flex flex-1 flex-col items-center gap-2 text-center">
          <span
            className={[
              'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
              done || active ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500',
            ].join(' ')}
          >
            {done ? '✓' : index + 1}
          </span>
          <span
            className={[
              'text-xs',
              active ? 'font-semibold text-slate-900' : 'text-slate-500',
            ].join(' ')}
          >
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

const AgentPairing: React.FC = () => {
  const location = useLocation();
  const { userId, name, login, loading: authLoading } = useAuth();

  const codeFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeCode(params.get('codigo') || params.get('code') || '');
  }, [location.search]);

  const [code, setCode] = useState(codeFromUrl);
  const [typedCode, setTypedCode] = useState(codeFromUrl);
  const [session, setSession] = useState<PairingSessionInfo | null>(null);
  const [stage, setStage] = useState<Stage>(codeFromUrl ? 'loading' : 'code');
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pdvName, setPdvName] = useState('');
  const [result, setResult] = useState<{ marketName: string; pdvName: string } | null>(null);

  // Valida o código contra o backend assim que houver um para checar.
  useEffect(() => {
    if (!code) {
      setStage('code');
      return;
    }
    let cancelled = false;
    setStage('loading');
    setError(null);

    agentPairingService
      .getSession(code)
      .then((info) => {
        if (cancelled) return;
        setSession(info);
        setPdvName((current) => current || suggestPdvName(info.hostname));
        setStage(userId ? 'naming' : 'login');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setSession(null);
        setError(err?.message || 'Código de pareamento inválido ou expirado.');
        setStage('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [code, userId]);

  // Assim que a sessão do usuário existir, avança do login para a nomeação.
  useEffect(() => {
    if (userId && session && stage === 'login') {
      setStage('naming');
    }
  }, [userId, session, stage]);

  const handleCodeSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeCode(typedCode);
    if (!normalized) {
      setError('Digite o código exibido no Agente Mercado Flow.');
      return;
    }
    setError(null);
    setCode(normalized);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, true);
      setStage('naming');
    } catch (err: any) {
      setError(err?.message || 'E-mail ou senha inválidos.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = pdvName.trim();
    if (!trimmed) {
      setError('Dê um nome para este PDV, por exemplo "Caixa 1".');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const approval = await agentPairingService.approve(code, trimmed);
      setResult({ marketName: approval.marketName, pdvName: approval.pdvName });
      setStage('done');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir o pareamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentStepIndex = stage === 'done' ? 3 : stage === 'naming' ? 2 : stage === 'login' ? 1 : 0;
  const mutedText = 'text-sm text-slate-500';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Agente Mercado Flow</h1>
          <p className={mutedText}>Conecte o computador do seu PDV à sua conta em poucos passos.</p>
        </header>

        <StepDots current={currentStepIndex} />

        <Card className="p-6">
          {(stage === 'loading' || authLoading) && <p className={mutedText}>Verificando código...</p>}

          {stage === 'code' && !authLoading && (
            <form onSubmit={handleCodeSubmit} className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Digite o código do agente</h2>
              <p className={mutedText}>
                O código de 8 caracteres aparece na tela do Agente Mercado Flow, logo abaixo do QR Code.
              </p>
              <div className="form-group">
                <label htmlFor="pairing-code">Código de pareamento</label>
                <input
                  id="pairing-code"
                  className="input text-center text-xl font-semibold tracking-[0.3em] uppercase"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value.toUpperCase())}
                  placeholder="ABCD2345"
                  maxLength={16}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <Button type="submit">Continuar</Button>
            </form>
          )}

          {stage === 'invalid' && (
            <div className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Código inválido ou expirado</h2>
              <p className={mutedText}>
                {error || 'Este código não é mais válido.'} Abra novamente o Agente Mercado Flow no
                computador do PDV para gerar um novo QR Code.
              </p>
              <Button
                onClick={() => {
                  setTypedCode('');
                  setCode('');
                  setError(null);
                  setStage('code');
                }}
              >
                Digitar outro código
              </Button>
            </div>
          )}

          {stage === 'login' && !authLoading && (
            <form onSubmit={handleLogin} className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Entre na sua conta</h2>
              {session?.hostname && (
                <p className={mutedText}>
                  Você está conectando o computador <strong>{session.hostname}</strong>.
                </p>
              )}
              <div className="form-group">
                <label htmlFor="pairing-email">E-mail</label>
                <input
                  id="pairing-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="pairing-password">Senha</label>
                <input
                  id="pairing-password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Entrando...' : 'Entrar e continuar'}
              </Button>
            </form>
          )}

          {stage === 'naming' && (
            <form onSubmit={handleApprove} className="grid gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Como se chama este PDV?</h2>
              <p className={mutedText}>
                {name ? `Olá, ${name}. ` : ''}
                Escolha um nome para reconhecer este caixa nos relatórios.
                {session?.hostname ? ` Computador: ${session.hostname}.` : ''}
              </p>
              <div className="form-group">
                <label htmlFor="pairing-pdv-name">Nome do PDV</label>
                <input
                  id="pairing-pdv-name"
                  className="input"
                  value={pdvName}
                  onChange={(e) => setPdvName(e.target.value)}
                  placeholder="Caixa 1"
                  maxLength={120}
                  autoFocus
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {['Caixa 1', 'Caixa 2', 'Balcão', 'Retaguarda'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    onClick={() => setPdvName(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Conectando...' : 'Conectar agente'}
              </Button>
            </form>
          )}

          {stage === 'done' && result && (
            <div className="grid gap-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
                ✓
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Tudo pronto!</h2>
              <p className="text-sm text-slate-700">
                O PDV <strong>{result.pdvName}</strong> foi conectado ao mercado{' '}
                <strong>{result.marketName}</strong>.
              </p>
              <p className={mutedText}>
                Pode voltar ao computador do PDV: o Agente Mercado Flow já recebeu a configuração e
                está localizando sozinho as pastas de notas fiscais. Você já pode fechar esta página.
              </p>
            </div>
          )}
        </Card>

        <footer className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            Por segurança, a chave de acesso nunca é exibida aqui: ela vai direto para o agente
            instalado no computador do PDV.
          </p>
        </footer>
      </div>
    </div>
  );
};

/** Deriva um nome inicial amigável a partir do hostname da máquina. */
function suggestPdvName(hostname?: string): string {
  if (!hostname) {
    return '';
  }
  const cleaned = hostname.trim().replace(/[._-]+/g, ' ');
  if (!cleaned) {
    return '';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 60);
}

export default AgentPairing;
