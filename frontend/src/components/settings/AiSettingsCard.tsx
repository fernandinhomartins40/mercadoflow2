import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Check, X, AlertTriangle, Trash2, Plug, Loader2, ExternalLink,
} from 'lucide-react';
import {
  aiService, AiCredential, AiProviderOption, AiProviderId, AiUsageSummary,
} from '../../services/ai.service';

/**
 * Configuração da IA do mercado (BYOK).
 *
 * A decisão de produto: a plataforma não fornece chave — cada mercado usa a
 * própria conta no provedor. Isso mantém a cota de um cliente longe da de
 * outro e deixa o limite de gasto onde ele já está, na conta dele.
 *
 * A tela precisa comunicar três coisas com clareza, porque cadastrar uma chave
 * de API não é gesto trivial para um supermercadista:
 *   1. que existem opções gratuitas;
 *   2. que a chave fica cifrada e não é recuperável nem por nós;
 *   3. que **nada quebra** se ele não configurar nada.
 */

/** Onde o cliente cria a chave. Sem isso o cadastro vira caça ao tesouro. */
const SIGNUP_URL: Partial<Record<AiProviderId, string>> = {
  CEREBRAS: 'https://cloud.cerebras.ai',
  GROQ: 'https://console.groq.com/keys',
  NVIDIA_NIM: 'https://build.nvidia.com',
  OPENROUTER: 'https://openrouter.ai/keys',
  GEMINI: 'https://aistudio.google.com/apikey',
  OPENAI: 'https://platform.openai.com/api-keys',
};

const card: React.CSSProperties = {
  border: '1px solid var(--border-soft)',
  background: 'var(--surface-base)',
};

const AiSettingsCard: React.FC<{ marketId?: string | null }> = ({ marketId }) => {
  const [providers, setProviders] = useState<AiProviderOption[]>([]);
  const [credentials, setCredentials] = useState<AiCredential[]>([]);
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    provider: AiProviderId; apiKey: string; baseUrl: string; model: string;
  }>({ provider: 'GROQ', apiKey: '', baseUrl: '', model: '' });

  const selected = useMemo(
    () => providers.find(p => p.id === form.provider),
    [providers, form.provider],
  );

  const load = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const [p, c, u] = await Promise.all([
        aiService.listProviders(marketId),
        aiService.listCredentials(marketId),
        aiService.usage(marketId),
      ]);
      setProviders(p);
      setCredentials(c);
      setUsage(u);
      setError(null);
    } catch {
      setError('Não foi possível carregar a configuração de IA.');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!marketId) return;
    setSaving(true);
    setError(null);
    try {
      await aiService.saveCredential(marketId, {
        provider: form.provider,
        apiKey: form.apiKey.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined,
        model: form.model.trim() || undefined,
      });
      // A chave sai do estado assim que é enviada: não há razão para mantê-la
      // na memória do navegador depois disso.
      setForm(f => ({ ...f, apiKey: '', baseUrl: '', model: '' }));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.erro || 'Não foi possível salvar a chave.');
    } finally {
      setSaving(false);
    }
  };

  const test = async (id: string) => {
    if (!marketId) return;
    setTestingId(id);
    try {
      await aiService.testCredential(marketId, id);
      await load();
    } catch {
      setError('Falha ao testar a credencial.');
    } finally {
      setTestingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!marketId) return;
    await aiService.deleteCredential(marketId, id);
    await load();
  };

  if (!marketId) return null;

  const cryptoOff = usage && !usage.criptografiaDisponivel;

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}
      >
        <Sparkles className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Análise com IA
        </p>
        {usage?.configurado && (
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
          >
            <Check className="h-3 w-3" /> Ativa
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-5">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Com uma chave configurada, o sistema explica cada oportunidade em
          linguagem do dia a dia da loja. A chave é sua e fica guardada
          criptografada — nem nós conseguimos lê-la de volta.
          {' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            Sem chave, tudo continua funcionando
          </strong>{' '}
          com os textos que o próprio sistema escreve.
        </p>

        {cryptoOff && (
          <div
            className="flex gap-2 rounded-lg px-4 py-3 text-sm"
            style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              O servidor ainda não tem a chave de criptografia configurada, então
              não é possível guardar sua chave com segurança. Fale com o suporte.
            </span>
          </div>
        )}

        {error && (
          <div
            className="flex gap-2 rounded-lg px-4 py-3 text-sm"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Credenciais cadastradas */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : credentials.length > 0 && (
          <div className="flex flex-col gap-2">
            {credentials.map(c => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
                style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}
              >
                <div className="min-w-[9rem]">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {c.providerLabel}
                    {c.hasFreeTier && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--surface-success)', color: 'var(--brand-700)' }}
                      >
                        GRÁTIS
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {c.keyHint} · {c.model}
                  </p>
                </div>

                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {c.lastCheckOk === true && (
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--brand-700)' }}>
                      <Check className="h-3 w-3" /> Funcionando
                    </span>
                  )}
                  {c.lastCheckOk === false && (
                    <span className="inline-flex items-center gap-1" style={{ color: '#b91c1c' }}>
                      <X className="h-3 w-3" /> {c.lastCheckError || 'Falhou'}
                    </span>
                  )}
                  {c.lastCheckOk == null && 'Ainda não testada'}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => test(c.id)}
                    disabled={testingId === c.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
                    style={{
                      border: '1px solid var(--border-strong)',
                      background: 'var(--surface-base)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {testingId === c.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Plug className="h-3 w-3" />}
                    Testar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                    style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cadastro */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Serviço de IA
              </span>
              <select
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value as AiProviderId }))}
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-base)',
                  color: 'var(--text-primary)',
                }}
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome}{p.gratuito ? ' — tem plano gratuito' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 flex-1 min-w-[14rem]">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Sua chave de API
              </span>
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="cole aqui a chave do serviço"
                autoComplete="off"
                className="rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-base)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
          </div>

          {selected?.exigeUrl && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Endereço do seu serviço
              </span>
              <input
                value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://seu-servidor/v1"
                className="rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-base)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {SIGNUP_URL[form.provider] && (
              <a
                href={SIGNUP_URL[form.provider]}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                style={{ color: 'var(--brand-700)' }}
              >
                <ExternalLink className="h-3 w-3" />
                Criar chave no {selected?.nome}
              </a>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || cryptoOff === true}
              className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--brand-500)' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar chave
            </button>
          </div>

          {selected?.modeloPadrao && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Modelo usado: <span className="font-mono">{selected.modeloPadrao}</span>
            </p>
          )}
        </div>

        {/* Consumo */}
        {usage && usage.chamadas > 0 && (
          <div
            className="rounded-lg px-4 py-3 text-xs"
            style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
          >
            Nos últimos {usage.periodoDias} dias: {usage.chamadas} análises,{' '}
            {usage.tokensEntrada.toLocaleString('pt-BR')} tokens enviados e{' '}
            {usage.tokensSaida.toLocaleString('pt-BR')} recebidos.
          </div>
        )}
      </div>
    </div>
  );
};

export default AiSettingsCard;
