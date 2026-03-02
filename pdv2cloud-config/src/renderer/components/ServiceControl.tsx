import React, { useState, useEffect } from 'react';
import { colors, typography, spacing, borderRadius, shadows, Icons, components } from '../styles/theme';

interface ServiceControlProps {
  serviceInstalled: boolean;
  onServiceInstalled?: () => void;
  onServiceStatusChanged?: () => void;
}

const ServiceControl: React.FC<ServiceControlProps> = ({ serviceInstalled, onServiceInstalled, onServiceStatusChanged }) => {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [installing, setInstalling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkServiceStatus = async () => {
    try {
      const status = await (window as any).pdv2cloud.serviceStatus();
      setIsRunning(String(status).includes('RUNNING'));
    } catch {
      setIsRunning(false);
    } finally {
      setChecking(false);
    }
  };

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 8000);
  };

  const diagnoseService = async () => {
    try {
      showMessage('Executando diagnóstico do serviço...', 'info');
      const result = await (window as any).electron.invoke('service:diagnose');
      console.log('=== DIAGNÓSTICO DO SERVIÇO ===');
      console.log(result);
      showMessage('Diagnóstico concluído. Veja o console (F12) para detalhes.', 'success');
    } catch (err: any) {
      console.error('Erro no diagnóstico:', err);
      showMessage('Erro ao executar diagnóstico', 'error');
    }
  };

  const checkLogs = async () => {
    try {
      showMessage('Verificando logs do Windows Event Viewer...', 'info');
      const result = await (window as any).electron.invoke('service:checkLogs');
      console.log('=== LOGS DO EVENT VIEWER ===');
      console.log(result);
      showMessage('Logs recuperados. Veja o console (F12) para detalhes.', 'success');
    } catch (err: any) {
      console.error('Erro ao verificar logs:', err);
      showMessage('Erro ao verificar logs', 'error');
    }
  };

  const run = async (action: 'start' | 'stop' | 'restart') => {
    const actions = {
      start: { loading: 'Iniciando serviço...', success: 'Serviço iniciado com sucesso', verb: 'iniciar' },
      stop: { loading: 'Parando serviço...', success: 'Serviço parado', verb: 'parar' },
      restart: { loading: 'Reiniciando serviço...', success: 'Serviço reiniciado com sucesso', verb: 'reiniciar' }
    };

    const actionInfo = actions[action];

    try {
      showMessage(actionInfo.loading, 'info');
      await (window as any).pdv2cloud[`${action}Service`]();
      showMessage(actionInfo.success, 'success');
      await checkServiceStatus();
      onServiceStatusChanged?.();
    } catch (err: any) {
      const msg = err?.toString?.() || String(err || '');

      if (msg.includes('SERVICE_NOT_INSTALLED')) {
        showMessage('Serviço não está instalado. Use o Assistente de Configuração para instalar.', 'error');
      } else if (msg.includes('Access') || msg.includes('Acesso')) {
        showMessage('Sem permissão. Execute este aplicativo como Administrador.', 'error');
      } else {
        // Automatically run diagnostics on startup failure
        showMessage(`Não foi possível ${actionInfo.verb} o serviço. Executando diagnóstico...`, 'error');
        setTimeout(() => {
          diagnoseService();
          checkLogs();
        }, 1000);
      }
    }
  };

  const installServiceHandler = async () => {
    setInstalling(true);
    showMessage('Instalando e configurando o serviço...', 'info');

    try {
      await (window as any).pdv2cloud.installService();
      showMessage('Serviço instalado e iniciado com sucesso', 'success');
      if (onServiceInstalled) {
        setTimeout(() => onServiceInstalled(), 2000);
      }
      await checkServiceStatus();
      onServiceStatusChanged?.();
    } catch (err: any) {
      const msg = err?.toString?.() || String(err || '');

      if (msg.includes('SERVICE_INSTALLER_NOT_FOUND')) {
        showMessage('Arquivos não encontrados. Reinstale o PDV2Cloud usando o instalador oficial.', 'error');
      } else if (msg.includes('Access') || msg.includes('Acesso')) {
        showMessage('Sem permissão. Feche este aplicativo e execute-o como Administrador (botão direito > Executar como administrador).', 'error');
      } else {
        showMessage('Erro na instalação. Execute este aplicativo como Administrador e tente novamente.', 'error');
      }
    } finally {
      setInstalling(false);
    }
  };

  const getMessageStyle = () => {
    const styles = {
      success: { backgroundColor: colors.success[50], color: colors.success[800], border: `1px solid ${colors.success[300]}` },
      error: { backgroundColor: colors.error[50], color: colors.error[800], border: `1px solid ${colors.error[300]}` },
      info: { backgroundColor: colors.primary[50], color: colors.primary[800], border: `1px solid ${colors.primary[300]}` }
    };
    return styles[messageType];
  };

  if (!serviceInstalled) {
    return (
      <div style={{
        backgroundColor: colors.background.primary,
        borderRadius: borderRadius.lg,
        padding: spacing['2xl'],
        boxShadow: shadows.md,
        border: `1px solid ${colors.neutral[200]}`
      }}>
        <div style={{ marginBottom: spacing.xl }}>
          <h3 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            margin: 0,
            marginBottom: spacing.sm,
            fontFamily: typography.fontFamily.sans
          }}>
            Configure o Coletor
          </h3>
          <p style={{
            fontSize: typography.fontSize.base,
            color: colors.text.secondary,
            margin: 0,
            fontFamily: typography.fontFamily.sans
          }}>
            O serviço de coleta automática precisa ser instalado antes de usar o sistema
          </p>
        </div>

        <button
          onClick={installServiceHandler}
          disabled={installing}
          style={{
            ...components.button.success,
            width: '100%',
            justifyContent: 'center',
            opacity: installing ? 0.7 : 1,
            cursor: installing ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={(e) => !installing && (e.currentTarget.style.backgroundColor = colors.success[700])}
          onMouseLeave={(e) => !installing && (e.currentTarget.style.backgroundColor = colors.success[600])}
        >
          {installing ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: `2px solid ${colors.text.inverse}`,
                borderTopColor: 'transparent',
                borderRadius: borderRadius.full,
                animation: 'spin 0.6s linear infinite'
              }} />
              Instalando serviço...
            </>
          ) : (
            <>
              <Icons.Settings />
              Instalar Serviço de Coleta
            </>
          )}
        </button>

        {message && (
          <div style={{
            ...getMessageStyle(),
            padding: spacing.md,
            borderRadius: borderRadius.md,
            marginTop: spacing.lg,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            fontFamily: typography.fontFamily.sans
          }}>
            {message}
          </div>
        )}

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: colors.background.primary,
      borderRadius: borderRadius.lg,
      padding: spacing['2xl'],
      boxShadow: shadows.md,
      border: `1px solid ${colors.neutral[200]}`
    }}>
      <div style={{ marginBottom: spacing.xl }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm
        }}>
          <h3 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            margin: 0,
            fontFamily: typography.fontFamily.sans
          }}>
            Controle do Serviço
          </h3>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.sm,
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: isRunning ? colors.success[100] : colors.error[100],
            borderRadius: borderRadius.full,
            border: `1px solid ${isRunning ? colors.success[300] : colors.error[300]}`
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: borderRadius.full,
              backgroundColor: isRunning ? colors.success[600] : colors.error[600]
            }}></div>
            <span style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              color: isRunning ? colors.success[800] : colors.error[800],
              fontFamily: typography.fontFamily.sans
            }}>
              {checking ? 'Verificando...' : isRunning ? 'Em Execução' : 'Parado'}
            </span>
          </div>
        </div>
        <p style={{
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          margin: 0,
          fontFamily: typography.fontFamily.sans
        }}>
          Gerencie o funcionamento do coletor de notas fiscais
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.md,
        marginBottom: spacing.lg
      }}>
        <button
          onClick={() => run('start')}
          disabled={isRunning}
          style={{
            padding: spacing.md,
            backgroundColor: isRunning ? colors.neutral[200] : colors.success[600],
            color: isRunning ? colors.neutral[500] : colors.text.inverse,
            border: 'none',
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            fontFamily: typography.fontFamily.sans
          }}
          onMouseEnter={(e) => !isRunning && (e.currentTarget.style.backgroundColor = colors.success[700])}
          onMouseLeave={(e) => !isRunning && (e.currentTarget.style.backgroundColor = colors.success[600])}
        >
          <Icons.Play />
          Iniciar
        </button>

        <button
          onClick={() => run('stop')}
          disabled={!isRunning}
          style={{
            padding: spacing.md,
            backgroundColor: !isRunning ? colors.neutral[200] : colors.error[600],
            color: !isRunning ? colors.neutral[500] : colors.text.inverse,
            border: 'none',
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            fontFamily: typography.fontFamily.sans
          }}
          onMouseEnter={(e) => isRunning && (e.currentTarget.style.backgroundColor = colors.error[700])}
          onMouseLeave={(e) => isRunning && (e.currentTarget.style.backgroundColor = colors.error[600])}
        >
          <Icons.Stop />
          Parar
        </button>

        <button
          onClick={() => run('restart')}
          disabled={!isRunning}
          style={{
            padding: spacing.md,
            backgroundColor: !isRunning ? colors.neutral[200] : colors.warning[600],
            color: !isRunning ? colors.neutral[500] : colors.text.inverse,
            border: 'none',
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
            fontFamily: typography.fontFamily.sans
          }}
          onMouseEnter={(e) => isRunning && (e.currentTarget.style.backgroundColor = colors.warning[700])}
          onMouseLeave={(e) => isRunning && (e.currentTarget.style.backgroundColor = colors.warning[600])}
        >
          <Icons.Refresh />
          Reiniciar
        </button>
      </div>

      {!isRunning && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: spacing.md,
          marginBottom: spacing.lg,
          padding: spacing.md,
          backgroundColor: colors.warning[50],
          borderRadius: borderRadius.md,
          border: `1px solid ${colors.warning[300]}`
        }}>
          <button
            onClick={diagnoseService}
            style={{
              padding: spacing.md,
              backgroundColor: colors.primary[600],
              color: colors.text.inverse,
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              fontFamily: typography.fontFamily.sans
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.primary[700])}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.primary[600])}
          >
            <Icons.Settings />
            Diagnosticar Serviço
          </button>

          <button
            onClick={checkLogs}
            style={{
              padding: spacing.md,
              backgroundColor: colors.primary[600],
              color: colors.text.inverse,
              border: 'none',
              borderRadius: borderRadius.md,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              fontFamily: typography.fontFamily.sans
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.primary[700])}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.primary[600])}
          >
            <Icons.Alert />
            Ver Logs de Erro
          </button>
        </div>
      )}

      {message && (
        <div style={{
          ...getMessageStyle(),
          padding: spacing.md,
          borderRadius: borderRadius.md,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          fontFamily: typography.fontFamily.sans
        }}>
          {messageType === 'success' && <Icons.Check />}
          {messageType === 'error' && <Icons.Alert />}
          {messageType === 'info' && <Icons.Loader />}
          {message}
        </div>
      )}
    </div>
  );
};

export default ServiceControl;
