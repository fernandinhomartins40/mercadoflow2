import React, { useState } from 'react';
import { colors, typography, spacing, borderRadius, shadows, Icons, components } from '../styles/theme';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

const DEFAULT_API_URL = 'https://mercadoflow.com';

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [watchPaths, setWatchPaths] = useState<string[]>([]);
  const [autoDetectedPaths, setAutoDetectedPaths] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const detectCommonPaths = async () => {
    try {
      const paths = await (window as any).electron.invoke('paths:detect');
      setAutoDetectedPaths(paths || []);
    } catch (err) {
      console.error('Failed to detect paths:', err);
    }
  };

  React.useEffect(() => {
    if (currentStep === 2) {
      detectCommonPaths();
    }
  }, [currentStep]);

  const testConnection = async () => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      alert('Por favor, insira a chave de acesso');
      return false;
    }

    try {
      await (window as any).electron.invoke('api:testKey', {
        apiKey: normalizedKey,
        apiUrl: DEFAULT_API_URL,
      });
      return true;
    } catch (err) {
      alert('Chave de acesso inválida. Verifique e tente novamente.');
      return false;
    }
  };

  const saveConfigAndInstall = async () => {
    const normalizedKey = apiKey.trim();
    const config = {
      api_url: DEFAULT_API_URL,
      api_key: normalizedKey,
      watch_paths: watchPaths,
      xsd_paths: [],
      retry_interval_minutes: 5,
      poll_interval_seconds: 10,
      healthcheck_enabled: true,
      healthcheck_port: 8765,
      auto_update_enabled: true
    };

    try {
      await (window as any).electron.invoke('config:save', config);
      return true;
    } catch (err) {
      console.error('Failed to save config:', err);
      return false;
    }
  };

  const installService = async () => {
    setInstalling(true);
    setErrorDetails('');

    try {
      await (window as any).electron.invoke('service:install');
      await (window as any).electron.invoke('service:start');
      return true;
    } catch (err) {
      const errorMsg = String(err);
      setErrorDetails(errorMsg);

      try {
        const desktopLogs = await (window as any).electron.invoke('desktop-logs:read');
        if (desktopLogs && desktopLogs.length > 0) {
          setErrorDetails(errorMsg + '\n\n=== Desktop App Logs ===\n' + desktopLogs.slice(-20).join('\n'));
        }
      } catch {}

      alert('Erro ao instalar serviço. Clique em "Ver Detalhes" para mais informações.');
      return false;
    } finally {
      setInstalling(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      const ok = await testConnection();
      if (!ok) return;
    }

    if (currentStep === 3) {
      const saved = await saveConfigAndInstall();
      if (!saved) return;

      const installed = await installService();
      if (!installed) return;

      onComplete();
      return;
    }

    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setCurrentStep(Math.max(0, currentStep - 1));
  };

  const addPath = () => {
    (window as any).electron.invoke('dialog:selectFolder').then((path: string | null) => {
      if (path && !watchPaths.includes(path)) {
        setWatchPaths([...watchPaths, path]);
      }
    });
  };

  const removePath = (path: string) => {
    setWatchPaths(watchPaths.filter(p => p !== path));
  };

  const addAutoDetectedPath = (path: string) => {
    if (!watchPaths.includes(path)) {
      setWatchPaths([...watchPaths, path]);
    }
  };

  const steps = [
    {
      id: 0,
      title: 'Bem-vindo ao PDV2Cloud',
      description: 'Configure o coletor automático em 4 passos simples',
      icon: <Icons.Cloud />,
      content: (
        <div style={{ textAlign: 'center', padding: spacing['3xl'] }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            backgroundColor: colors.primary[100],
            borderRadius: borderRadius.full,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.primary[600]
          }}>
            <div style={{ transform: 'scale(1.8)' }}>
              <Icons.Cloud />
            </div>
          </div>
          <h2 style={{
            fontSize: typography.fontSize['3xl'],
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: spacing.md,
            fontFamily: typography.fontFamily.sans
          }}>
            PDV2Cloud Collector Agent
          </h2>
          <p style={{
            fontSize: typography.fontSize.lg,
            color: colors.text.secondary,
            maxWidth: '500px',
            margin: '0 auto',
            lineHeight: typography.lineHeight.relaxed,
            fontFamily: typography.fontFamily.sans
          }}>
            Este assistente irá configurar o coletor automático de notas fiscais para o seu PDV.
          </p>
          <div style={{
            marginTop: spacing['3xl'],
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing.xl,
            maxWidth: '600px',
            margin: `${spacing['3xl']} auto 0`
          }}>
            <div style={{
              padding: spacing.xl,
              backgroundColor: colors.background.secondary,
              borderRadius: borderRadius.lg,
              border: `1px solid ${colors.neutral[200]}`
            }}>
              <div style={{ color: colors.primary[600], marginBottom: spacing.sm }}>
                <Icons.Check />
              </div>
              <h3 style={{
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans
              }}>
                Automático
              </h3>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.tertiary,
                fontFamily: typography.fontFamily.sans
              }}>
                Coleta arquivos XML automaticamente
              </p>
            </div>
            <div style={{
              padding: spacing.xl,
              backgroundColor: colors.background.secondary,
              borderRadius: borderRadius.lg,
              border: `1px solid ${colors.neutral[200]}`
            }}>
              <div style={{ color: colors.success[600], marginBottom: spacing.sm }}>
                <Icons.Database />
              </div>
              <h3 style={{
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans
              }}>
                Seguro
              </h3>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.tertiary,
                fontFamily: typography.fontFamily.sans
              }}>
                Dados criptografados e protegidos
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 1,
      title: 'Chave de Acesso',
      description: 'Insira a chave de acesso fornecida pelo PDV2Cloud',
      icon: <Icons.Key />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{ marginBottom: spacing['2xl'] }}>
            <label style={{
              display: 'block',
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.sm,
              fontFamily: typography.fontFamily.sans
            }}>
              Chave de Acesso (API Key)
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole sua chave de acesso aqui"
              style={{
                width: '100%',
                padding: spacing.md,
                fontSize: typography.fontSize.base,
                border: `2px solid ${colors.neutral[300]}`,
                borderRadius: borderRadius.md,
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: typography.fontFamily.mono,
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = colors.primary[500]}
              onBlur={(e) => e.target.style.borderColor = colors.neutral[300]}
            />
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.tertiary,
              marginTop: spacing.sm,
              fontFamily: typography.fontFamily.sans
            }}>
              Você pode encontrar sua chave de acesso no painel administrativo do PDV2Cloud
            </p>
          </div>
          <div style={{
            backgroundColor: colors.primary[50],
            border: `1px solid ${colors.primary[200]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            display: 'flex',
            gap: spacing.md
          }}>
            <div style={{ color: colors.primary[600], flexShrink: 0 }}>
              <Icons.Alert />
            </div>
            <div>
              <h4 style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.primary[900],
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans
              }}>
                Mantenha sua chave segura
              </h4>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.primary[700],
                margin: 0,
                fontFamily: typography.fontFamily.sans
              }}>
                Esta chave será armazenada de forma criptografada no seu computador
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: 'Pastas de Monitoramento',
      description: 'Selecione as pastas onde os arquivos XML são salvos',
      icon: <Icons.Folder />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{ marginBottom: spacing.xl }}>
            <button
              onClick={addPath}
              style={{
                ...components.button.secondary,
                width: '100%',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.neutral[200]}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.neutral[100]}
            >
              <Icons.Folder />
              Adicionar Pasta
            </button>
          </div>

          {autoDetectedPaths.length > 0 && (
            <div style={{ marginBottom: spacing.xl }}>
              <h4 style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                fontFamily: typography.fontFamily.sans
              }}>
                Pastas Detectadas Automaticamente
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {autoDetectedPaths.map((path) => (
                  <div
                    key={path}
                    style={{
                      padding: spacing.md,
                      backgroundColor: colors.background.secondary,
                      border: `1px solid ${colors.neutral[200]}`,
                      borderRadius: borderRadius.md,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{
                      fontSize: typography.fontSize.sm,
                      color: colors.text.secondary,
                      fontFamily: typography.fontFamily.mono,
                      flex: 1
                    }}>
                      {path}
                    </span>
                    <button
                      onClick={() => addAutoDetectedPath(path)}
                      disabled={watchPaths.includes(path)}
                      style={{
                        padding: `${spacing.xs} ${spacing.md}`,
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium,
                        backgroundColor: watchPaths.includes(path) ? colors.neutral[300] : colors.primary[600],
                        color: colors.text.inverse,
                        border: 'none',
                        borderRadius: borderRadius.sm,
                        cursor: watchPaths.includes(path) ? 'not-allowed' : 'pointer',
                        fontFamily: typography.fontFamily.sans
                      }}
                    >
                      {watchPaths.includes(path) ? 'Adicionada' : 'Adicionar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {watchPaths.length > 0 && (
            <div>
              <h4 style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                fontFamily: typography.fontFamily.sans
              }}>
                Pastas Selecionadas ({watchPaths.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {watchPaths.map((path) => (
                  <div
                    key={path}
                    style={{
                      padding: spacing.md,
                      backgroundColor: colors.success[50],
                      border: `1px solid ${colors.success[200]}`,
                      borderRadius: borderRadius.md,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                      <div style={{ color: colors.success[600] }}>
                        <Icons.Check />
                      </div>
                      <span style={{
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary,
                        fontFamily: typography.fontFamily.mono
                      }}>
                        {path}
                      </span>
                    </div>
                    <button
                      onClick={() => removePath(path)}
                      style={{
                        padding: spacing.sm,
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: colors.error[600],
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.error[100]}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Icons.X />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {watchPaths.length === 0 && (
            <div style={{
              padding: spacing['2xl'],
              textAlign: 'center',
              backgroundColor: colors.background.secondary,
              borderRadius: borderRadius.md,
              border: `2px dashed ${colors.neutral[300]}`
            }}>
              <div style={{ color: colors.neutral[400], marginBottom: spacing.md }}>
                <Icons.Folder />
              </div>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.tertiary,
                fontFamily: typography.fontFamily.sans
              }}>
                Nenhuma pasta selecionada. Adicione pelo menos uma pasta.
              </p>
            </div>
          )}
        </div>
      )
    },
    {
      id: 3,
      title: 'Revisão e Instalação',
      description: 'Revise as configurações e instale o serviço',
      icon: <Icons.Settings />,
      content: (
        <div style={{ padding: spacing.xl }}>
          <div style={{
            backgroundColor: colors.background.secondary,
            borderRadius: borderRadius.lg,
            padding: spacing.xl,
            marginBottom: spacing.xl
          }}>
            <h4 style={{
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.lg,
              fontFamily: typography.fontFamily.sans
            }}>
              Resumo da Configuração
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
              <div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.tertiary,
                  marginBottom: spacing.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Chave de Acesso
                </div>
                <div style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.text.primary,
                  fontFamily: typography.fontFamily.mono,
                  padding: spacing.sm,
                  backgroundColor: colors.background.primary,
                  borderRadius: borderRadius.sm,
                  border: `1px solid ${colors.neutral[200]}`
                }}>
                  {apiKey ? `${apiKey.substring(0, 20)}...` : 'Não configurada'}
                </div>
              </div>

              <div>
                <div style={{
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.tertiary,
                  marginBottom: spacing.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: typography.fontFamily.sans
                }}>
                  Pastas Monitoradas
                </div>
                <div style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.text.primary,
                  fontFamily: typography.fontFamily.mono
                }}>
                  {watchPaths.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                      {watchPaths.map((path, idx) => (
                        <div key={idx} style={{
                          padding: spacing.sm,
                          backgroundColor: colors.background.primary,
                          borderRadius: borderRadius.sm,
                          border: `1px solid ${colors.neutral[200]}`
                        }}>
                          {path}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: colors.text.tertiary }}>Nenhuma pasta</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {errorDetails && (
            <div style={{
              backgroundColor: colors.error[50],
              border: `1px solid ${colors.error[200]}`,
              borderRadius: borderRadius.md,
              padding: spacing.lg,
              marginBottom: spacing.xl
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
                <div style={{ color: colors.error[600], flexShrink: 0 }}>
                  <Icons.Alert />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.error[900],
                    marginBottom: spacing.sm,
                    fontFamily: typography.fontFamily.sans
                  }}>
                    Erro na Instalação
                  </h4>
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    style={{
                      padding: `${spacing.xs} ${spacing.sm}`,
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      backgroundColor: colors.error[100],
                      color: colors.error[700],
                      border: `1px solid ${colors.error[300]}`,
                      borderRadius: borderRadius.sm,
                      cursor: 'pointer',
                      fontFamily: typography.fontFamily.sans
                    }}
                  >
                    {showErrorDetails ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                  </button>
                  {showErrorDetails && (
                    <pre style={{
                      marginTop: spacing.md,
                      padding: spacing.md,
                      backgroundColor: colors.background.primary,
                      border: `1px solid ${colors.error[200]}`,
                      borderRadius: borderRadius.sm,
                      fontSize: typography.fontSize.xs,
                      color: colors.error[800],
                      overflow: 'auto',
                      maxHeight: '200px',
                      fontFamily: typography.fontFamily.mono
                    }}>
                      {errorDetails}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {!installing && !errorDetails && (
            <div style={{
              backgroundColor: colors.success[50],
              border: `1px solid ${colors.success[200]}`,
              borderRadius: borderRadius.md,
              padding: spacing.lg,
              display: 'flex',
              gap: spacing.md
            }}>
              <div style={{ color: colors.success[600], flexShrink: 0 }}>
                <Icons.Check />
              </div>
              <div>
                <h4 style={{
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.success[900],
                  marginBottom: spacing.xs,
                  fontFamily: typography.fontFamily.sans
                }}>
                  Pronto para Instalar
                </h4>
                <p style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.success[700],
                  margin: 0,
                  fontFamily: typography.fontFamily.sans
                }}>
                  Clique em "Concluir" para salvar as configurações e instalar o serviço
                </p>
              </div>
            </div>
          )}
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.background.tertiary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      fontFamily: typography.fontFamily.sans
    }}>
      <div style={{
        width: '100%',
        maxWidth: '800px',
        backgroundColor: colors.background.primary,
        borderRadius: borderRadius.xl,
        boxShadow: shadows.xl,
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${colors.primary[600]} 0%, ${colors.primary[700]} 100%)`,
          padding: spacing['2xl'],
          color: colors.text.inverse
        }}>
          <h1 style={{
            fontSize: typography.fontSize['2xl'],
            fontWeight: typography.fontWeight.bold,
            margin: 0,
            marginBottom: spacing.sm,
            fontFamily: typography.fontFamily.sans
          }}>
            PDV2Cloud
          </h1>
          <p style={{
            fontSize: typography.fontSize.sm,
            opacity: 0.9,
            margin: 0,
            fontFamily: typography.fontFamily.sans
          }}>
            Assistente de Configuração
          </p>
        </div>

        {/* Progress Steps */}
        <div style={{
          padding: spacing.xl,
          borderBottom: `1px solid ${colors.neutral[200]}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            position: 'relative'
          }}>
            {steps.map((step, index) => (
              <div key={step.id} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative'
              }}>
                {index < steps.length - 1 && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    right: '-50%',
                    height: '2px',
                    backgroundColor: index < currentStep ? colors.primary[500] : colors.neutral[300],
                    zIndex: 0
                  }} />
                )}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: borderRadius.full,
                  backgroundColor: index <= currentStep ? colors.primary[600] : colors.neutral[300],
                  color: colors.text.inverse,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  marginBottom: spacing.sm,
                  position: 'relative',
                  zIndex: 1,
                  transition: 'all 0.3s ease'
                }}>
                  {index < currentStep ? <Icons.Check /> : index + 1}
                </div>
                <span style={{
                  fontSize: typography.fontSize.xs,
                  color: index === currentStep ? colors.text.primary : colors.text.tertiary,
                  fontWeight: index === currentStep ? typography.fontWeight.semibold : typography.fontWeight.normal,
                  textAlign: 'center',
                  fontFamily: typography.fontFamily.sans
                }}>
                  {step.title.split(' ').slice(0, 2).join(' ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: spacing['2xl'] }}>
          <div style={{ marginBottom: spacing.xl }}>
            <h2 style={{
              fontSize: typography.fontSize['2xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.sm,
              fontFamily: typography.fontFamily.sans
            }}>
              {currentStepData.title}
            </h2>
            <p style={{
              fontSize: typography.fontSize.base,
              color: colors.text.secondary,
              margin: 0,
              fontFamily: typography.fontFamily.sans
            }}>
              {currentStepData.description}
            </p>
          </div>

          {currentStepData.content}
        </div>

        {/* Footer */}
        <div style={{
          padding: spacing.xl,
          borderTop: `1px solid ${colors.neutral[200]}`,
          backgroundColor: colors.background.secondary,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {currentStep === 0 && (
              <button
                onClick={onSkip}
                style={{
                  ...components.button.secondary,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: colors.text.tertiary
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = colors.text.primary}
                onMouseLeave={(e) => e.currentTarget.style.color = colors.text.tertiary}
              >
                Pular configuração
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: spacing.md }}>
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                disabled={installing}
                style={{
                  ...components.button.secondary,
                  opacity: installing ? 0.5 : 1,
                  cursor: installing ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => !installing && (e.currentTarget.style.backgroundColor = colors.neutral[200])}
                onMouseLeave={(e) => !installing && (e.currentTarget.style.backgroundColor = colors.neutral[100])}
              >
                <Icons.ArrowLeft />
                Voltar
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={installing || (currentStep === 1 && !apiKey) || (currentStep === 2 && watchPaths.length === 0)}
              style={{
                ...components.button.primary,
                opacity: (installing || (currentStep === 1 && !apiKey) || (currentStep === 2 && watchPaths.length === 0)) ? 0.5 : 1,
                cursor: (installing || (currentStep === 1 && !apiKey) || (currentStep === 2 && watchPaths.length === 0)) ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => {
                if (!installing && !(currentStep === 1 && !apiKey) && !(currentStep === 2 && watchPaths.length === 0)) {
                  e.currentTarget.style.backgroundColor = colors.primary[700];
                }
              }}
              onMouseLeave={(e) => {
                if (!installing && !(currentStep === 1 && !apiKey) && !(currentStep === 2 && watchPaths.length === 0)) {
                  e.currentTarget.style.backgroundColor = colors.primary[600];
                }
              }}
            >
              {installing ? (
                <>
                  <div className="spinner" style={{
                    width: '16px',
                    height: '16px',
                    border: `2px solid ${colors.text.inverse}`,
                    borderTopColor: 'transparent',
                    borderRadius: borderRadius.full,
                    animation: 'spin 0.6s linear infinite'
                  }} />
                  Instalando...
                </>
              ) : currentStep === steps.length - 1 ? (
                <>
                  Concluir
                  <Icons.Check />
                </>
              ) : (
                <>
                  Próximo
                  <Icons.ArrowRight />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default OnboardingWizard;
