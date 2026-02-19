import React, { useEffect, useState } from 'react';
import { colors, typography, spacing, borderRadius, shadows, Icons } from '../styles/theme';

interface DashboardProps {
  serviceInstalled: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ serviceInstalled }) => {
  const [status, setStatus] = useState<string>('carregando');
  const [configOk, setConfigOk] = useState(false);
  const [queue, setQueue] = useState<any>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastError, setLastError] = useState<any>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [installing, setInstalling] = useState<boolean>(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const versionInfo = await (window as any).electron.invoke('update:check');
      const currentVersion = '1.0.0';
      if (versionInfo.version !== currentVersion) {
        setUpdateAvailable(true);
        setLatestVersion(versionInfo.version);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  };

  const installUpdate = async () => {
    if (!confirm('Instalar atualização? O sistema será reiniciado.')) {
      return;
    }

    setInstalling(true);
    try {
      await (window as any).electron.invoke('update:install');
      alert('Atualização iniciada! O sistema será reiniciado em breve.');
    } catch (err) {
      alert('Erro ao instalar atualização: ' + err);
    } finally {
      setInstalling(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const service = await (window as any).electron.invoke('service:status');
        setStatus(String(service));
      } catch (err) {
        const errorMsg = String(err);
        if (errorMsg.includes('SERVICE_NOT_INSTALLED')) {
          setStatus('not_installed');
        } else {
          setStatus('stopped');
        }
      }

      try {
        await (window as any).electron.invoke('config:load');
        setConfigOk(true);
      } catch (err) {
        setConfigOk(false);
      }

      try {
        const statusFile = await (window as any).electron.invoke('status:load');
        if (statusFile) {
          setQueue(statusFile.queue);
          setOnline(statusFile.online);
          setStatusMessage(statusFile.status_message || '');
          setLastUpdate(statusFile.timestamp);
          setLastError(statusFile.last_error);
        }
      } catch {
        setQueue(null);
      }
    };

    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const getStatusInfo = () => {
    if (status === 'not_installed') {
      return {
        color: colors.error[600],
        bgColor: colors.error[50],
        borderColor: colors.error[200],
        icon: <Icons.Settings />,
        title: 'Serviço não instalado',
        subtitle: 'Clique em "Assistente de Configuração" para começar'
      };
    }
    if (status.includes('RUNNING') && online) {
      return {
        color: colors.success[600],
        bgColor: colors.success[50],
        borderColor: colors.success[200],
        icon: <Icons.Check />,
        title: 'Tudo funcionando',
        subtitle: statusMessage || 'Coletando notas fiscais automaticamente'
      };
    }
    if (status.includes('RUNNING') && !online) {
      return {
        color: colors.warning[600],
        bgColor: colors.warning[50],
        borderColor: colors.warning[200],
        icon: <Icons.Alert />,
        title: 'Sem conexão com servidor',
        subtitle: 'Verifique sua internet. Os dados serão enviados quando reconectar.'
      };
    }
    if (status === 'carregando') {
      return {
        color: colors.neutral[500],
        bgColor: colors.neutral[50],
        borderColor: colors.neutral[200],
        icon: <Icons.Loader />,
        title: 'Carregando...',
        subtitle: 'Verificando status do sistema'
      };
    }
    return {
      color: colors.error[600],
      bgColor: colors.error[50],
      borderColor: colors.error[200],
      icon: <Icons.X />,
      title: 'Serviço parado',
      subtitle: 'Clique em "Iniciar" abaixo para começar a coleta'
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div style={{
      backgroundColor: colors.background.primary,
      borderRadius: borderRadius.lg,
      boxShadow: shadows.md,
      border: `1px solid ${colors.neutral[200]}`,
      overflow: 'hidden'
    }}>
      {/* Update Banner */}
      {updateAvailable && (
        <div style={{
          background: `linear-gradient(135deg, ${colors.primary[500]} 0%, ${colors.primary[600]} 100%)`,
          padding: spacing.lg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <div style={{ color: colors.text.inverse }}>
              <Icons.Download />
            </div>
            <div>
              <div style={{
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.inverse,
                marginBottom: spacing.xs,
                fontSize: typography.fontSize.base,
                fontFamily: typography.fontFamily.sans
              }}>
                Nova atualização disponível
              </div>
              <div style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.inverse,
                opacity: 0.9,
                fontFamily: typography.fontFamily.sans
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
              backgroundColor: colors.background.primary,
              color: colors.primary[700],
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: installing ? 'not-allowed' : 'pointer',
              opacity: installing ? 0.7 : 1,
              fontFamily: typography.fontFamily.sans
            }}
          >
            {installing ? 'Instalando...' : 'Atualizar agora'}
          </button>
        </div>
      )}

      <div style={{ padding: spacing['2xl'] }}>
        {/* Main Status Card */}
        <div style={{
          backgroundColor: statusInfo.bgColor,
          border: `2px solid ${statusInfo.borderColor}`,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          marginBottom: spacing.xl
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.lg }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: statusInfo.color,
              borderRadius: borderRadius.lg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.text.inverse,
              flexShrink: 0
            }}>
              {statusInfo.icon}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{
                fontSize: typography.fontSize['2xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                margin: 0,
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans
              }}>
                {statusInfo.title}
              </h2>
              <p style={{
                fontSize: typography.fontSize.base,
                color: colors.text.secondary,
                margin: 0,
                fontFamily: typography.fontFamily.sans
              }}>
                {statusInfo.subtitle}
              </p>
            </div>
            <div style={{
              textAlign: 'right',
              minWidth: '100px'
            }}>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans
              }}>
                Última verificação
              </div>
              <div style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                fontFamily: typography.fontFamily.mono
              }}>
                {lastUpdate ? new Date(lastUpdate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {lastError && (
          <div style={{
            backgroundColor: colors.error[50],
            border: `1px solid ${colors.error[300]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl
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
                  fontFamily: typography.fontFamily.sans
                }}>
                  {lastError.title || 'Ocorreu um erro'}
                </div>
                <div style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.error[700],
                  marginBottom: spacing.sm,
                  fontFamily: typography.fontFamily.sans
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
                      fontFamily: typography.fontFamily.sans
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
                      fontFamily: typography.fontFamily.mono
                    }}>
                      {lastError.technical}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {queue && (
          <div>
            <h3 style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.lg,
              fontFamily: typography.fontFamily.sans
            }}>
              Estatísticas
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: spacing.lg,
              marginBottom: spacing.xl
            }}>
              <div style={{
                backgroundColor: colors.primary[50],
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                border: `1px solid ${colors.primary[200]}`
              }}>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.primary[700],
                  marginBottom: spacing.md,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Notas Processadas
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: typography.fontWeight.bold,
                  color: colors.primary[700],
                  fontFamily: typography.fontFamily.sans
                }}>
                  {queue.total || 0}
                </div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.primary[600],
                  marginTop: spacing.xs,
                  fontFamily: typography.fontFamily.sans
                }}>
                  total encontrado
                </div>
              </div>

              <div style={{
                backgroundColor: colors.success[50],
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                border: `1px solid ${colors.success[200]}`
              }}>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.success[700],
                  marginBottom: spacing.md,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Enviadas
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: typography.fontWeight.bold,
                  color: colors.success[700],
                  fontFamily: typography.fontFamily.sans
                }}>
                  {queue.sent || 0}
                </div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.success[600],
                  marginTop: spacing.xs,
                  fontFamily: typography.fontFamily.sans
                }}>
                  sincronizadas
                </div>
              </div>

              <div style={{
                backgroundColor: colors.warning[50],
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                border: `1px solid ${colors.warning[200]}`
              }}>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.warning[700],
                  marginBottom: spacing.md,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Aguardando
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: typography.fontWeight.bold,
                  color: colors.warning[700],
                  fontFamily: typography.fontFamily.sans
                }}>
                  {queue.pending || 0}
                </div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.warning[600],
                  marginTop: spacing.xs,
                  fontFamily: typography.fontFamily.sans
                }}>
                  na fila
                </div>
              </div>

              <div style={{
                backgroundColor: colors.error[50],
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
                border: `1px solid ${colors.error[200]}`
              }}>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.error[700],
                  marginBottom: spacing.md,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Com Erros
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: typography.fontWeight.bold,
                  color: colors.error[700],
                  fontFamily: typography.fontFamily.sans
                }}>
                  {queue.error || 0}
                </div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.error[600],
                  marginTop: spacing.xs,
                  fontFamily: typography.fontFamily.sans
                }}>
                  {queue.dead_letter > 0 ? `${queue.dead_letter} críticos` : 'nenhum crítico'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* System Status Footer */}
        <div style={{
          borderTop: `1px solid ${colors.neutral[200]}`,
          paddingTop: spacing.lg,
          display: 'flex',
          gap: spacing.xl,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: borderRadius.full,
              backgroundColor: configOk ? colors.success[500] : colors.error[500]
            }}></div>
            <span style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.secondary,
              fontFamily: typography.fontFamily.sans
            }}>
              {configOk ? 'Configuração OK' : 'Configure o sistema'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: borderRadius.full,
              backgroundColor: online ? colors.success[500] : colors.neutral[400]
            }}></div>
            <span style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.secondary,
              fontFamily: typography.fontFamily.sans
            }}>
              {online === null ? 'Verificando conexão...' : online ? 'Servidor Online' : 'Servidor Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
