import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, flow, typography, spacing, borderRadius, shadows, Icons } from '../styles/theme';

interface DashboardProps {
  serviceInstalled: boolean;
}

type LocalInvoiceActivity = {
  id: number;
  chaveNFe: string;
  status: string;
  createdAt: string;
  processedAt: string;
  errorDetails: string;
  numero: string;
  serie: string;
  valorTotal: number;
};

type RemoteSyncSnapshot = {
  reachable: boolean;
  checkedAt: string;
  marketId: string;
  marketName: string;
  totalInvoices: number;
  invoicesLast24h: number;
  lastInvoiceProcessedAt: string;
  recentInvoices: Array<{
    id?: string;
    chaveNFe?: string;
    numero?: string;
    serie?: string;
    valorTotal?: number;
    dataEmissao?: string;
    processedAt?: string;
  }>;
  error: string;
};

const EMPTY_QUEUE = {
  total: 0,
  pending: 0,
  processing: 0,
  sent: 0,
  error: 0,
  dead_letter: 0,
};
const PROBE_OVERRIDE_TTL_MS = 2 * 60 * 1000;

const parseVersion = (value: string): number[] | null => {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'unknown') {
    return null;
  }
  const parts = raw.split('.').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3);
};

const isNewerVersion = (latest: string, current: string): boolean => {
  const a = parseVersion(latest);
  if (!a) {
    return false;
  }
  const b = parseVersion(current) || [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
};

const formatShortTime = (value: string) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString('pt-BR');
};

const formatCurrency = (value: number) => {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const statusMeta: Record<string, { label: string; bg: string; color: string }> = {
  SENT: { label: 'Enviada', bg: colors.success[50], color: colors.success[700] },
  PENDING: { label: 'Na fila', bg: colors.warning[50], color: colors.warning[700] },
  PROCESSING: { label: 'Processando', bg: colors.primary[50], color: colors.primary[700] },
  ERROR: { label: 'Erro', bg: colors.error[50], color: colors.error[700] },
  DEAD_LETTER: { label: 'Falha crítica', bg: colors.error[100], color: colors.error[800] },
};

const Dashboard: React.FC<DashboardProps> = ({ serviceInstalled }) => {
  const [status, setStatus] = useState<string>('carregando');
  const [configOk, setConfigOk] = useState(false);
  const [queue, setQueue] = useState(EMPTY_QUEUE);
  const [online, setOnline] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastProcessed, setLastProcessed] = useState<string>('');
  const [lastError, setLastError] = useState<any>(null);
  const [watchPathsCount, setWatchPathsCount] = useState<number>(0);
  const [marketLabel, setMarketLabel] = useState<string>('');
  const [recentLocalInvoices, setRecentLocalInvoices] = useState<LocalInvoiceActivity[]>([]);
  const [remoteSync, setRemoteSync] = useState<RemoteSyncSnapshot | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [installing, setInstalling] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionMessage, setConnectionMessage] = useState<string>('');
  const [connectionMessageType, setConnectionMessageType] = useState<'success' | 'error' | 'info'>('info');
  const autoConnectionAttemptedRef = useRef(false);
  const lastProbeRef = useRef<{
    at: number;
    online: boolean;
    statusMessage: string;
    lastError: any;
    marketLabel: string;
  } | null>(null);

  const showConnectionMessage = (message: string, type: 'success' | 'error' | 'info') => {
    setConnectionMessage(message);
    setConnectionMessageType(type);
    window.setTimeout(() => setConnectionMessage(''), 7000);
  };

  const checkForUpdates = async () => {
    try {
      const versionInfo = await (window as any).electron.invoke('update:check');
      const currentVersion = await (window as any).electron.invoke('version:get');
      if (isNewerVersion(versionInfo?.version, currentVersion)) {
        setUpdateAvailable(true);
        setLatestVersion(versionInfo.version);
      } else {
        setUpdateAvailable(false);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  };

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }

    let nextStatus = 'stopped';
    try {
      const service = await (window as any).electron.invoke('service:status');
      nextStatus = String(service);
      setStatus(nextStatus);
    } catch (err) {
      const errorMsg = String(err || '');
      nextStatus = errorMsg.includes('SERVICE_NOT_INSTALLED') ? 'not_installed' : 'stopped';
      setStatus(nextStatus);
    }

    try {
      const config = await (window as any).electron.invoke('config:load');
      const hasApiKey = Boolean(
        config?.api_key ||
        config?.api_key_encrypted ||
        config?.api_token ||
        config?.api_token_encrypted
      );
      const watchPaths = Array.isArray(config?.watch_paths) ? config.watch_paths.filter(Boolean) : [];
      setConfigOk(hasApiKey && watchPaths.length > 0);
    } catch (err) {
      console.error('Failed to load config:', err);
      setConfigOk(false);
    }

    try {
      const snapshot = await (window as any).electron.invoke('agent:snapshot');
      if (snapshot) {
        const snapshotOnline =
          typeof snapshot.online === 'boolean' ? snapshot.online : (nextStatus.includes('RUNNING') ? null : false);
        const probe = lastProbeRef.current;
        const shouldUseProbeOverride = Boolean(
          probe &&
          Date.now() - probe.at <= PROBE_OVERRIDE_TTL_MS &&
          nextStatus.includes('RUNNING') &&
          typeof probe.online === 'boolean' &&
          probe.online !== snapshotOnline
        );

        setQueue({ ...EMPTY_QUEUE, ...(snapshot.queue || {}) });
        setOnline(shouldUseProbeOverride ? probe!.online : snapshotOnline);
        setStatusMessage(
          shouldUseProbeOverride
            ? probe!.statusMessage
            : String(snapshot.statusMessage || '')
        );
        setLastUpdate(String(snapshot.statusTimestamp || ''));
        setLastProcessed(String(snapshot.lastProcessed || ''));
        setLastError(shouldUseProbeOverride ? probe!.lastError : (snapshot.lastError || null));
        setWatchPathsCount(Number(snapshot.watchPathsCount || 0));
        setRecentLocalInvoices(Array.isArray(snapshot.recentLocalInvoices) ? snapshot.recentLocalInvoices : []);
        setRemoteSync(snapshot.remoteSync || null);
        setMarketLabel(
          shouldUseProbeOverride && probe?.marketLabel
            ? probe.marketLabel
            : String(snapshot.marketLabel || '')
        );
      } else {
        setQueue(EMPTY_QUEUE);
        setOnline(nextStatus.includes('RUNNING') ? null : false);
        setStatusMessage('');
        setLastUpdate('');
        setLastProcessed('');
        setLastError(null);
        setWatchPathsCount(0);
        setRecentLocalInvoices([]);
        setRemoteSync(null);
        setMarketLabel('');
      }
    } catch (err) {
      console.error('Failed to load agent snapshot:', err);
      setQueue(EMPTY_QUEUE);
      setOnline(nextStatus.includes('RUNNING') ? null : false);
      setLastUpdate('');
      setLastProcessed('');
      setLastError(null);
      setWatchPathsCount(0);
      setRecentLocalInvoices([]);
      setRemoteSync(null);
      setMarketLabel('');
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, []);

  useEffect(() => {
    loadDashboard();
    const id = setInterval(() => loadDashboard(true), 5000);
    return () => clearInterval(id);
  }, [loadDashboard]);

  useEffect(() => {
    const shouldAutoTest =
      serviceInstalled &&
      status.includes('RUNNING') &&
      online === null &&
      !testingConnection &&
      !autoConnectionAttemptedRef.current;

    if (!status.includes('RUNNING')) {
      autoConnectionAttemptedRef.current = false;
      return;
    }

    if (!shouldAutoTest) {
      return;
    }

    autoConnectionAttemptedRef.current = true;
    testConnection({ silent: true }).catch((err) => {
      console.error('Automatic connection test failed:', err);
    });
  }, [serviceInstalled, status, online, testingConnection]);

  const installUpdate = async () => {
    if (!confirm('Instalar atualização agora?\n\nO Agente Mercado Flow será fechado e o instalador será executado automaticamente.')) {
      return;
    }

    setInstalling(true);
    try {
      await (window as any).electron.invoke('update:install');
    } catch (err) {
      alert('Erro ao instalar atualização: ' + err);
      setInstalling(false);
    }
  };

  const testConnection = async (options?: { silent?: boolean }) => {
    setTestingConnection(true);
    if (!options?.silent) {
      showConnectionMessage('Testando conexão com o servidor...', 'info');
    }

    try {
      const result = await (window as any).electron.invoke('connection:testConfigured');
      const now = new Date().toISOString();

      if (!result?.success) {
        const probeState = {
          at: Date.now(),
          online: false,
          statusMessage: result?.message || 'Não foi possível validar a comunicação com o servidor.',
          lastError: {
            title: result?.title || 'Falha na conexão',
            message: result?.message || 'Não foi possível validar a comunicação com o servidor.',
            technical: result?.message || '',
          },
          marketLabel: result?.marketName || result?.marketId || marketLabel,
        };
        lastProbeRef.current = probeState;
        setOnline(false);
        setLastUpdate(now);
        setStatusMessage(probeState.statusMessage);
        setLastError(probeState.lastError);
        if (!options?.silent) {
          showConnectionMessage(result?.message || 'Falha ao conectar com o servidor.', 'error');
        }
        return;
      }

      const probeState = {
        at: Date.now(),
        online: Boolean(result.online),
        statusMessage: result.heartbeatOk === false
          ? 'API key validada, mas o heartbeat do agente falhou.'
          : 'Conexão com o servidor validada com sucesso.',
        lastError: result.heartbeatOk === false
          ? {
              title: result?.title || 'Heartbeat falhou',
              message: result?.message || 'A API respondeu, mas o heartbeat do agente falhou.',
              technical: result?.message || '',
            }
          : null,
        marketLabel: result.marketName || result.marketId || marketLabel,
      };
      lastProbeRef.current = probeState;

      setOnline(Boolean(result.online));
      setLastUpdate(now);
      setLastError(probeState.lastError);
      setMarketLabel(probeState.marketLabel);
      setStatusMessage(probeState.statusMessage);
      if (!options?.silent) {
        showConnectionMessage(
          result.heartbeatOk === false
            ? 'API key válida, mas o heartbeat do agente falhou.'
            : 'Conexão com o servidor validada com sucesso.',
          result.heartbeatOk === false ? 'error' : 'success'
        );
      }
    } catch (err) {
      const message = String(err || '');
      lastProbeRef.current = {
        at: Date.now(),
        online: false,
        statusMessage: 'Não foi possível validar a comunicação com o servidor.',
        lastError: {
          title: 'Falha na conexão',
          message: 'Não foi possível validar a comunicação com o servidor.',
          technical: message,
        },
        marketLabel,
      };
      setOnline(false);
      setLastUpdate(new Date().toISOString());
      setStatusMessage('Não foi possível validar a comunicação com o servidor.');
      setLastError({
        title: 'Falha na conexão',
        message: 'Não foi possível validar a comunicação com o servidor.',
        technical: message,
      });
      if (!options?.silent) {
        showConnectionMessage('Falha ao testar a conexão com o servidor.', 'error');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const getStatusInfo = () => {
    if (status === 'not_installed') {
      return {
        color: colors.error[600],
        bgColor: colors.error[50],
        borderColor: colors.error[200],
        icon: <Icons.Settings />,
        title: 'Serviço não instalado',
        subtitle: 'Clique em "Assistente de Configuração" para começar',
      };
    }
    if (status === 'carregando') {
      return {
        color: colors.neutral[500],
        bgColor: colors.neutral[50],
        borderColor: colors.neutral[200],
        icon: <Icons.Loader />,
        title: 'Carregando...',
        subtitle: 'Verificando status do sistema',
      };
    }
    if (status.includes('RUNNING') && online === null) {
      return {
        color: colors.primary[600],
        bgColor: colors.primary[50],
        borderColor: colors.primary[200],
        icon: <Icons.Loader />,
        title: 'Verificando conexão',
        subtitle: 'O serviço está em execução. Aguarde ou clique em "Testar conexão agora".',
      };
    }
    if (status.includes('RUNNING') && online) {
      return {
        color: colors.success[600],
        bgColor: colors.success[50],
        borderColor: colors.success[200],
        icon: <Icons.Check />,
        title: 'Tudo funcionando',
        subtitle: statusMessage || 'Coletando notas fiscais automaticamente',
      };
    }
    if (status.includes('RUNNING') && online === false) {
      return {
        color: colors.warning[600],
        bgColor: colors.warning[50],
        borderColor: colors.warning[200],
        icon: <Icons.Alert />,
        title: 'Sem conexão com servidor',
        subtitle: statusMessage || 'Verifique a conexão e use "Testar conexão agora" para validar a comunicação.',
      };
    }
    return {
      color: colors.error[600],
      bgColor: colors.error[50],
      borderColor: colors.error[200],
      icon: <Icons.X />,
      title: 'Serviço parado',
      subtitle: 'Clique em "Iniciar" abaixo para começar a coleta',
    };
  };

  const getConnectionMessageStyle = () => {
    if (connectionMessageType === 'success') {
      return {
        backgroundColor: colors.success[50],
        color: colors.success[800],
        border: `1px solid ${colors.success[300]}`,
      };
    }
    if (connectionMessageType === 'error') {
      return {
        backgroundColor: colors.error[50],
        color: colors.error[800],
        border: `1px solid ${colors.error[300]}`,
      };
    }
    return {
      backgroundColor: colors.primary[50],
      color: colors.primary[800],
      border: `1px solid ${colors.primary[300]}`,
    };
  };

  const statusInfo = getStatusInfo();
  const pendingTotal = Number(queue.pending || 0) + Number(queue.processing || 0);
  const remoteTotalInvoices = Number(remoteSync?.totalInvoices || 0);
  const remoteRecentInvoices = Array.isArray(remoteSync?.recentInvoices) ? remoteSync!.recentInvoices : [];
  const showHistoricalInfo = Boolean(remoteSync?.reachable && remoteTotalInvoices > 0 && Number(queue.sent || 0) === 0);

  const HEADLINE: Record<string, [string, string]> = {
    'Tudo funcionando': ['O caixa está', 'enviando as vendas.'],
    'Serviço parado': ['O serviço está', 'parado.'],
    'Sem conexão com servidor': ['Sem conexão', 'com o MercadoFlow.'],
    'Verificando conexão': ['Verificando', 'a conexão.'],
    'Serviço não instalado': ['Vamos', 'instalar o serviço.'],
    'Carregando...': ['Lendo o', 'estado do caixa.'],
  };
  const [lead, mark] = HEADLINE[statusInfo.title] ?? [statusInfo.title, ''];
  const ok = statusInfo.title === 'Tudo funcionando';
  const chip: React.CSSProperties = {
    padding: '5px 12px', borderRadius: 999, fontSize: 13, color: flow.onForest,
    background: 'rgba(255, 255, 255, 0.07)', border: `1px solid ${flow.forestLine}`, fontFamily: typography.fontFamily.sans,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      {updateAvailable && (
        <div style={{
          background: flow.lime,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{ color: flow.limeInk }}>
              <Icons.Download />
            </div>
            <div>
              <div style={{
                fontWeight: typography.fontWeight.semibold,
                color: flow.limeInk,
                marginBottom: spacing.xs,
                fontSize: typography.fontSize.base,
                fontFamily: typography.fontFamily.sans,
              }}>
                Nova atualização disponível
              </div>
              <div style={{
                fontSize: typography.fontSize.sm,
                color: flow.limeInk,
                opacity: 0.85,
                fontFamily: typography.fontFamily.sans,
              }}>
                Versão {latestVersion} está pronta para instalar
              </div>
            </div>
          </div>
          <button
            onClick={installUpdate}
            disabled={installing}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: flow.forest,
              color: '#fff',
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: installing ? 'not-allowed' : 'pointer',
              opacity: installing ? 0.7 : 1,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            {installing ? 'Instalando...' : 'Atualizar agora'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <section aria-label="Estado do caixa" style={{
          background: `radial-gradient(700px 400px at 100% 0%, rgba(215, 242, 107, 0.08), transparent 60%), ${flow.forest}`,
          color: flow.onForest,
          borderRadius: borderRadius.xl,
          padding: 'clamp(20px, 3vw, 32px)',
          boxShadow: shadows.lg,
          fontFamily: typography.fontFamily.sans,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'flex-start', minWidth: 0, flex: '1 1 420px' }}>
              <span style={{
                width: 58, height: 58, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                background: ok ? flow.lime : statusInfo.color, color: ok ? flow.limeInk : '#fff',
                boxShadow: `0 0 0 6px ${ok ? 'rgba(215, 242, 107, 0.18)' : 'rgba(255, 255, 255, 0.08)'}`,
              }}>
                {statusInfo.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.04 }}>
                  {lead}{mark ? ' ' : ''}
                  {mark && <mark style={{ background: flow.lime, color: flow.ink, padding: '0 0.12em', borderRadius: '0.1em', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{mark}</mark>}
                </h1>
                <p style={{ margin: '10px 0 0', fontSize: 15.5, color: flow.onForestMuted, lineHeight: 1.5 }}>{statusInfo.subtitle}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
                  <span style={chip}>Pastas monitoradas: <strong>{watchPathsCount}</strong></span>
                  <span style={chip}>Mercado: <strong>{marketLabel || 'não identificado'}</strong></span>
                  <span style={chip}>Na web: <strong>{remoteSync?.reachable ? remoteTotalInvoices : '--'}</strong></span>
                  <span style={chip}>Último envio: <strong>{formatShortTime(lastProcessed)}</strong></span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 110 }}>
              <div style={{ fontSize: 13, color: flow.onForestMuted, marginBottom: 4 }}>Última verificação</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: flow.lime, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {formatShortTime(lastUpdate)}
              </div>
            </div>
          </div>
        </section>

        <div style={{
          display: 'flex',
          gap: spacing.md,
          flexWrap: 'wrap',
          marginBottom: spacing.xl,
        }}>
          <button
            onClick={() => loadDashboard()}
            disabled={refreshing}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary[600],
              color: colors.text.inverse,
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              fontFamily: typography.fontFamily.sans,
            }}
            onMouseEnter={(e) => !refreshing && (e.currentTarget.style.backgroundColor = colors.primary[700])}
            onMouseLeave={(e) => !refreshing && (e.currentTarget.style.backgroundColor = colors.primary[600])}
          >
            <Icons.Refresh />
            {refreshing ? 'Atualizando...' : 'Atualizar painel'}
          </button>

          <button
            // Sem o wrapper, o React passa o MouseEvent como primeiro
            // argumento e ele cai no lugar de `options` — o clique virava
            // uma chamada com options.silent indefinido.
            onClick={() => testConnection()}
            disabled={testingConnection || !serviceInstalled}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.success[600],
              color: colors.text.inverse,
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: testingConnection || !serviceInstalled ? 'not-allowed' : 'pointer',
              opacity: testingConnection || !serviceInstalled ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              fontFamily: typography.fontFamily.sans,
            }}
            onMouseEnter={(e) => !testingConnection && serviceInstalled && (e.currentTarget.style.backgroundColor = colors.success[700])}
            onMouseLeave={(e) => !testingConnection && serviceInstalled && (e.currentTarget.style.backgroundColor = colors.success[600])}
          >
            <Icons.Check />
            {testingConnection ? 'Testando conexão...' : 'Testar conexão agora'}
          </button>
        </div>

        {connectionMessage && (
          <div style={{
            ...getConnectionMessageStyle(),
            padding: spacing.md,
            borderRadius: borderRadius.md,
            marginBottom: spacing.xl,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            fontFamily: typography.fontFamily.sans,
          }}>
            {connectionMessage}
          </div>
        )}

        {lastError && (
          <div style={{
            backgroundColor: colors.error[50],
            border: `1px solid ${colors.error[300]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}>
            <div style={{ display: 'flex', gap: spacing.md }}>
              <div style={{ color: colors.error[600], flexShrink: 0 }}>
                <Icons.Alert />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.error[900],
                  marginBottom: spacing.xs,
                  fontSize: typography.fontSize.base,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  {lastError.title || 'Ocorreu um erro'}
                </div>
                <div style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.error[700],
                  marginBottom: spacing.sm,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  {lastError.message}
                </div>
                {lastError.technical && (
                  <details style={{ marginTop: spacing.sm }}>
                    <summary style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.error[700],
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontFamily: typography.fontFamily.sans,
                    }}>
                      Ver detalhes técnicos
                    </summary>
                    <pre style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.error[800],
                      backgroundColor: colors.error[100],
                      padding: spacing.sm,
                      borderRadius: borderRadius.sm,
                      marginTop: spacing.sm,
                      overflow: 'auto',
                      maxHeight: '200px',
                      fontFamily: typography.fontFamily.mono,
                    }}>
                      {lastError.technical}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.lg,
            fontFamily: typography.fontFamily.sans,
          }}>
            Resumo das notas
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: spacing.lg,
            marginBottom: spacing.xl,
          }}>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              border: `1px solid ${flow.line}`,
              boxShadow: flow.shadow,
            }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: typography.fontWeight.semibold,
                color: flow.muted,
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
              }}>
                Encontradas
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: typography.fontWeight.bold,
                color: colors.primary[700],
                fontFamily: typography.fontFamily.sans,
              }}>
                {queue.total || 0}
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: flow.muted,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}>
                XMLs detectados pelo coletor
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              border: `1px solid ${flow.line}`,
              boxShadow: flow.shadow,
            }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: typography.fontWeight.semibold,
                color: flow.muted,
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
              }}>
                Enviadas
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: typography.fontWeight.bold,
                color: colors.success[700],
                fontFamily: typography.fontFamily.sans,
              }}>
                {queue.sent || 0}
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: flow.muted,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}>
                Confirmadas nesta instalação do coletor
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              border: `1px solid ${flow.line}`,
              boxShadow: flow.shadow,
            }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: typography.fontWeight.semibold,
                color: flow.muted,
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
              }}>
                Na fila
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: typography.fontWeight.bold,
                color: colors.warning[700],
                fontFamily: typography.fontFamily.sans,
              }}>
                {pendingTotal}
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: flow.muted,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}>
                {queue.processing > 0 ? `${queue.processing} em processamento agora` : 'Aguardando envio'}
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              border: `1px solid ${flow.line}`,
              boxShadow: flow.shadow,
            }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: typography.fontWeight.semibold,
                color: flow.muted,
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
              }}>
                Com erro
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: typography.fontWeight.bold,
                color: colors.error[700],
                fontFamily: typography.fontFamily.sans,
              }}>
                {queue.error || 0}
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: flow.muted,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}>
                {queue.dead_letter > 0 ? `${queue.dead_letter} falhas críticas` : 'Nenhuma falha crítica'}
              </div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              borderRadius: borderRadius.lg,
              padding: spacing.lg,
              border: `1px solid ${flow.line}`,
              boxShadow: flow.shadow,
            }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: typography.fontWeight.semibold,
                color: flow.muted,
                marginBottom: spacing.sm,
                fontFamily: typography.fontFamily.sans,
              }}>
                Confirmadas na web
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: typography.fontWeight.bold,
                color: colors.neutral[800],
                fontFamily: typography.fontFamily.sans,
              }}>
                {remoteSync?.reachable ? remoteTotalInvoices : '--'}
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: flow.muted,
                marginTop: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}>
                {remoteSync?.reachable
                  ? `${remoteSync?.invoicesLast24h || 0} recebidas nas últimas 24h`
                  : 'Resumo remoto indisponível no momento'}
              </div>
            </div>
          </div>
        </div>

        {showHistoricalInfo && (
          <div style={{
            backgroundColor: colors.primary[50],
            border: `1px solid ${colors.primary[200]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}>
            <div style={{
              fontSize: typography.fontSize.sm,
              color: colors.primary[800],
              fontWeight: typography.fontWeight.medium,
              fontFamily: typography.fontFamily.sans,
            }}>
              A API já possui <strong>{remoteTotalInvoices}</strong> notas deste mercado. O contador
              &nbsp;<strong>Enviadas</strong> acima representa apenas o histórico desta instalação local.
            </div>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: spacing.lg,
          marginBottom: spacing.xl,
        }}>
          <div style={{
            backgroundColor: colors.background.secondary,
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.neutral[200]}`,
            padding: spacing.lg,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
              gap: spacing.md,
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  Atividade local recente
                </h3>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.text.tertiary,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  Últimos XMLs vistos pelo coletor nesta máquina
                </div>
              </div>
            </div>

            {recentLocalInvoices.length === 0 ? (
              <div style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                fontFamily: typography.fontFamily.sans,
              }}>
                Ainda não há atividade local registrada na fila.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: spacing.md }}>
                {recentLocalInvoices.map((item) => {
                  const meta = statusMeta[item.status] || {
                    label: item.status || 'Desconhecido',
                    bg: colors.neutral[100],
                    color: colors.neutral[700],
                  };
                  return (
                    <div
                      key={`${item.id}-${item.chaveNFe}`}
                      style={{
                        backgroundColor: colors.background.primary,
                        border: `1px solid ${colors.neutral[200]}`,
                        borderRadius: borderRadius.md,
                        padding: spacing.md,
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: spacing.md,
                        marginBottom: spacing.sm,
                      }}>
                        <div>
                          <div style={{
                            fontSize: typography.fontSize.sm,
                            fontWeight: typography.fontWeight.semibold,
                            color: colors.text.primary,
                            fontFamily: typography.fontFamily.sans,
                          }}>
                            NF {item.numero || '-'}{item.serie ? ` / Série ${item.serie}` : ''}
                          </div>
                          <div style={{
                            fontSize: typography.fontSize.xs,
                            color: colors.text.tertiary,
                            fontFamily: typography.fontFamily.mono,
                            wordBreak: 'break-all',
                          }}>
                            {item.chaveNFe}
                          </div>
                        </div>
                        <div style={{
                          padding: `${spacing.xs} ${spacing.sm}`,
                          borderRadius: borderRadius.full,
                          backgroundColor: meta.bg,
                          color: meta.color,
                          fontSize: typography.fontSize.xs,
                          fontWeight: typography.fontWeight.semibold,
                          fontFamily: typography.fontFamily.sans,
                          whiteSpace: 'nowrap',
                        }}>
                          {meta.label}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: spacing.md,
                        flexWrap: 'wrap',
                        fontSize: typography.fontSize.xs,
                        color: colors.text.secondary,
                        fontFamily: typography.fontFamily.sans,
                      }}>
                        <span>Detectada: {formatDateTime(item.createdAt)}</span>
                        <span>Processada: {formatDateTime(item.processedAt)}</span>
                        <span>Valor: {formatCurrency(item.valorTotal)}</span>
                      </div>
                      {item.errorDetails && (
                        <div style={{
                          marginTop: spacing.sm,
                          fontSize: typography.fontSize.xs,
                          color: colors.error[700],
                          fontFamily: typography.fontFamily.sans,
                        }}>
                          {item.errorDetails}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{
            backgroundColor: colors.background.secondary,
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.neutral[200]}`,
            padding: spacing.lg,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
              gap: spacing.md,
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  Confirmadas na web
                </h3>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.text.tertiary,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  Histórico já persistido para este mercado no servidor
                </div>
              </div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                fontFamily: typography.fontFamily.sans,
                textAlign: 'right',
              }}>
                Última consulta<br />
                <strong>{formatShortTime(remoteSync?.checkedAt || '')}</strong>
              </div>
            </div>

            {!remoteSync?.reachable ? (
              <div style={{
                backgroundColor: colors.warning[50],
                border: `1px solid ${colors.warning[200]}`,
                borderRadius: borderRadius.md,
                padding: spacing.md,
                fontSize: typography.fontSize.sm,
                color: colors.warning[800],
                fontFamily: typography.fontFamily.sans,
              }}>
                Não foi possível consultar o histórico do servidor agora.
                {remoteSync?.error ? ` Detalhe: ${remoteSync.error}` : ''}
              </div>
            ) : remoteRecentInvoices.length === 0 ? (
              <div style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                fontFamily: typography.fontFamily.sans,
              }}>
                A API ainda não registrou notas para este mercado.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: spacing.md }}>
                {remoteRecentInvoices.map((invoice, index) => (
                  <div
                    key={`${invoice.id || invoice.chaveNFe || index}`}
                    style={{
                      backgroundColor: colors.background.primary,
                      border: `1px solid ${colors.neutral[200]}`,
                      borderRadius: borderRadius.md,
                      padding: spacing.md,
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: spacing.md,
                      marginBottom: spacing.sm,
                    }}>
                      <div>
                        <div style={{
                          fontSize: typography.fontSize.sm,
                          fontWeight: typography.fontWeight.semibold,
                          color: colors.text.primary,
                          fontFamily: typography.fontFamily.sans,
                        }}>
                          NF {invoice.numero || '-'}{invoice.serie ? ` / Série ${invoice.serie}` : ''}
                        </div>
                        <div style={{
                          fontSize: typography.fontSize.xs,
                          color: colors.text.tertiary,
                          fontFamily: typography.fontFamily.mono,
                          wordBreak: 'break-all',
                        }}>
                          {invoice.chaveNFe || '-'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.semibold,
                        color: colors.text.primary,
                        fontFamily: typography.fontFamily.sans,
                        whiteSpace: 'nowrap',
                      }}>
                        {formatCurrency(Number(invoice.valorTotal || 0))}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: spacing.md,
                      flexWrap: 'wrap',
                      fontSize: typography.fontSize.xs,
                      color: colors.text.secondary,
                      fontFamily: typography.fontFamily.sans,
                    }}>
                      <span>Emissão: {formatDateTime(invoice.dataEmissao || '')}</span>
                      <span>Recebida: {formatDateTime(invoice.processedAt || '')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          borderTop: `1px solid ${colors.neutral[200]}`,
          paddingTop: spacing.lg,
          display: 'flex',
          gap: spacing.xl,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: borderRadius.full,
              backgroundColor: configOk ? colors.success[500] : colors.error[500],
            }} />
            <span style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.secondary,
              fontFamily: typography.fontFamily.sans,
            }}>
              {configOk ? 'Configuração válida' : 'Configuração incompleta'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: borderRadius.full,
              backgroundColor:
                online === null ? colors.primary[500] : online ? colors.success[500] : colors.warning[500],
            }} />
            <span style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.secondary,
              fontFamily: typography.fontFamily.sans,
            }}>
              {online === null ? 'Verificando conexão...' : online ? 'Servidor online' : 'Servidor offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
