import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, typography, spacing, borderRadius, shadows, Icons, components } from '../styles/theme';
import type { FolderCandidate, PairingStart, ScanResult } from '../global';

/**
 * Assistente de configuração do Agente Mercado Flow.
 *
 * O usuário não digita chave nem escolhe pastas: lê um QR Code com o celular,
 * define o nome do PDV na web, e o agente recebe a chave e localiza sozinho as
 * pastas de XML. Restam apenas confirmar e instalar.
 */

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

const DEFAULT_API_URL = 'https://mercadoflow.com';
const POLL_INTERVAL_MS = 3000;

type PairingState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'waiting'; data: PairingStart }
  | { phase: 'approved'; marketName: string; pdvName: string }
  | { phase: 'error'; message: string };

const formatCount = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const formatDate = (iso: string | null) => {
  if (!iso) return 'sem data';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'sem data';
  return parsed.toLocaleDateString('pt-BR');
};

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Pareamento
  const [pairing, setPairing] = useState<PairingState>({ phase: 'idle' });
  const [apiKey, setApiKey] = useState('');
  const [marketName, setMarketName] = useState('');
  const [pdvName, setPdvName] = useState('');
  const pollTimer = useRef<number | null>(null);

  // Varredura
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [scanError, setScanError] = useState('');

  // Instalação
  const [installing, setInstalling] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // ── Pareamento ──────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const beginPairing = useCallback(async () => {
    stopPolling();
    setPairing({ phase: 'starting' });
    try {
      const data = await window.pdv2cloud.startPairing();
      setPairing({ phase: 'waiting', data });
    } catch (err) {
      setPairing({
        phase: 'error',
        message:
          'Não foi possível falar com o Mercado Flow. Verifique a conexão com a internet e tente novamente.',
      });
    }
  }, [stopPolling]);

  // Long-poll enquanto o usuário conclui o passo a passo no celular.
  useEffect(() => {
    if (pairing.phase !== 'waiting') {
      return;
    }

    const poll = async () => {
      try {
        const result = await window.pdv2cloud.claimPairing();
        if (result.status === 'APPROVED' && result.apiKey) {
          stopPolling();
          setApiKey(result.apiKey);
          setMarketName(result.marketName || '');
          setPdvName(result.pdvName || '');
          setPairing({
            phase: 'approved',
            marketName: result.marketName || '',
            pdvName: result.pdvName || '',
          });
          // Encadeia direto para a varredura: o usuário não precisa fazer nada.
          setCurrentStep(2);
        } else if (result.status === 'EXPIRED' || result.status === 'CANCELLED') {
          stopPolling();
          setPairing({
            phase: 'error',
            message: 'O código expirou. Gere um novo QR Code para continuar.',
          });
        }
      } catch {
        // Falha de rede pontual: o próximo ciclo tenta de novo.
      }
    };

    pollTimer.current = window.setInterval(poll, POLL_INTERVAL_MS);
    void poll();

    return stopPolling;
  }, [pairing.phase, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // Inicia o pareamento assim que o usuário entra no passo 1.
  useEffect(() => {
    if (currentStep === 1 && pairing.phase === 'idle') {
      void beginPairing();
    }
  }, [currentStep, pairing.phase, beginPairing]);

  // ── Varredura automática ────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError('');
    try {
      const result = await window.pdv2cloud.scanXmlFolders({ timeoutSeconds: 45 });
      setScanResult(result);
      // Pré-seleciona o que o scanner recomendou: o caso comum vira zero cliques.
      setSelectedPaths(result.recommended || []);
      if (result.candidates.length === 0) {
        setScanError(
          'Nenhuma pasta com notas fiscais foi encontrada automaticamente. Você pode adicionar a pasta manualmente.',
        );
      }
    } catch (err) {
      setScanError('A varredura falhou. Adicione a pasta manualmente para continuar.');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === 2 && !scanResult && !scanning) {
      void runScan();
    }
  }, [currentStep, scanResult, scanning, runScan]);

  const togglePath = (path: string) => {
    setSelectedPaths((current) =>
      current.includes(path) ? current.filter((p) => p !== path) : [...current, path],
    );
  };

  const addPathManually = async () => {
    const path = await window.electron.invoke('dialog:selectFolder');
    if (path) {
      const normalized = String(path).replace(/\\/g, '/');
      setSelectedPaths((current) =>
        current.includes(normalized) ? current : [...current, normalized],
      );
    }
  };

  // ── Salvar e instalar ───────────────────────────────────────────────────

  const saveConfigAndInstall = async () => {
    const config = {
      api_url: DEFAULT_API_URL,
      api_key: apiKey,
      pdv_name: pdvName,
      market_name: marketName,
      watch_paths: selectedPaths,
      xsd_paths: [],
      retry_interval_minutes: 5,
      poll_interval_seconds: 10,
      healthcheck_enabled: true,
      healthcheck_port: 8765,
      auto_update_enabled: true,
    };

    try {
      await window.electron.invoke('config:save', config);
      return true;
    } catch {
      return false;
    }
  };

  const installService = async () => {
    setInstalling(true);
    setErrorDetails('');
    try {
      await window.electron.invoke('service:install');
      await window.electron.invoke('service:start');
      return true;
    } catch (err) {
      const errorMsg = String(err);
      setErrorDetails(errorMsg);
      try {
        const desktopLogs = await window.electron.invoke('desktop-logs:read');
        if (desktopLogs && desktopLogs.length > 0) {
          setErrorDetails(`${errorMsg}\n\n=== Logs do aplicativo ===\n${desktopLogs.slice(-20).join('\n')}`);
        }
      } catch {
        // logs são um extra; o erro principal já foi capturado
      }
      return false;
    } finally {
      setInstalling(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 3) {
      const saved = await saveConfigAndInstall();
      if (!saved) {
        setErrorDetails('Não foi possível gravar a configuração do agente.');
        return;
      }
      const installed = await installService();
      if (!installed) return;
      onComplete();
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => setCurrentStep(Math.max(0, currentStep - 1));

  // ── Conteúdo dos passos ─────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    padding: spacing.lg,
    backgroundColor: colors.background.secondary,
    border: `1px solid ${colors.neutral[200]}`,
    borderRadius: borderRadius.md,
  };

  const welcomeStep = (
    <div style={{ textAlign: 'center', padding: spacing['3xl'] }}>
      <div
        style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 24px',
          backgroundColor: colors.primary[100],
          borderRadius: borderRadius.full,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.primary[600],
        }}
      >
        <div style={{ transform: 'scale(1.8)' }}>
          <Icons.Cloud />
        </div>
      </div>
      <h2
        style={{
          fontSize: typography.fontSize['3xl'],
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
          marginBottom: spacing.md,
          fontFamily: typography.fontFamily.sans,
        }}
      >
        Agente Mercado Flow
      </h2>
      <p
        style={{
          fontSize: typography.fontSize.lg,
          color: colors.text.secondary,
          maxWidth: '520px',
          margin: '0 auto',
          lineHeight: typography.lineHeight.relaxed,
          fontFamily: typography.fontFamily.sans,
        }}
      >
        A configuração é automática. Você só precisa apontar a câmera do celular para um QR Code —
        o agente cuida do resto.
      </p>
      <div
        style={{
          marginTop: spacing['3xl'],
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: spacing.xl,
          maxWidth: '600px',
          margin: `${spacing['3xl']} auto 0`,
          textAlign: 'left',
        }}
      >
        <div style={cardStyle}>
          <div style={{ color: colors.primary[600], marginBottom: spacing.sm }}>
            <Icons.Key />
          </div>
          <h3
            style={{
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.xs,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            Sem digitar chaves
          </h3>
          <p style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary, margin: 0 }}>
            A chave de acesso chega sozinha, direto do seu painel.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={{ color: colors.success[600], marginBottom: spacing.sm }}>
            <Icons.Folder />
          </div>
          <h3
            style={{
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.xs,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            Sem procurar pastas
          </h3>
          <p style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary, margin: 0 }}>
            O agente encontra sozinho onde as notas são gravadas.
          </p>
        </div>
      </div>
    </div>
  );

  const pairingStep = (
    <div style={{ padding: spacing.xl, textAlign: 'center' }}>
      {pairing.phase === 'starting' && (
        <p style={{ color: colors.text.secondary, fontFamily: typography.fontFamily.sans }}>
          Gerando seu QR Code...
        </p>
      )}

      {pairing.phase === 'error' && (
        <div style={{ display: 'grid', gap: spacing.lg, justifyItems: 'center' }}>
          <div style={{ color: colors.error[600] }}>
            <Icons.Alert />
          </div>
          <p style={{ color: colors.text.secondary, margin: 0, maxWidth: '420px' }}>
            {pairing.message}
          </p>
          <button onClick={beginPairing} style={components.button.primary}>
            Gerar novo QR Code
          </button>
        </div>
      )}

      {pairing.phase === 'waiting' && (
        <div style={{ display: 'grid', gap: spacing.lg, justifyItems: 'center' }}>
          {pairing.data.qrCode ? (
            <img
              src={pairing.data.qrCode}
              alt="QR Code de pareamento"
              style={{
                width: '220px',
                height: '220px',
                border: `1px solid ${colors.neutral[200]}`,
                borderRadius: borderRadius.lg,
                padding: spacing.sm,
                backgroundColor: '#ffffff',
              }}
            />
          ) : (
            <p style={{ color: colors.text.tertiary }}>QR Code indisponível — use o link abaixo.</p>
          )}

          <div>
            <p
              style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                marginBottom: spacing.xs,
                fontFamily: typography.fontFamily.sans,
              }}
            >
              Aponte a câmera do celular ou digite o código no site:
            </p>
            <div
              style={{
                fontSize: typography.fontSize['2xl'],
                fontWeight: typography.fontWeight.bold,
                letterSpacing: '0.3em',
                color: colors.text.primary,
                fontFamily: typography.fontFamily.mono,
              }}
            >
              {pairing.data.userCode}
            </div>
          </div>

          <button
            onClick={() => window.pdv2cloud.openExternal(pairing.data.pairingUrl)}
            style={{
              ...components.button.secondary,
              fontSize: typography.fontSize.sm,
            }}
          >
            Abrir a página no navegador deste computador
          </button>

          <div
            style={{
              ...cardStyle,
              display: 'flex',
              gap: spacing.md,
              alignItems: 'center',
              textAlign: 'left',
              maxWidth: '460px',
            }}
          >
            <div
              className="spinner"
              style={{
                width: '18px',
                height: '18px',
                border: `2px solid ${colors.primary[500]}`,
                borderTopColor: 'transparent',
                borderRadius: borderRadius.full,
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }}
            />
            <p style={{ margin: 0, fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
              Aguardando você concluir o passo a passo no celular. Esta tela avança sozinha.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const scanStep = (
    <div style={{ padding: spacing.xl }}>
      {scanning && (
        <div style={{ ...cardStyle, display: 'flex', gap: spacing.md, alignItems: 'center' }}>
          <div
            className="spinner"
            style={{
              width: '18px',
              height: '18px',
              border: `2px solid ${colors.primary[500]}`,
              borderTopColor: 'transparent',
              borderRadius: borderRadius.full,
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }}
          />
          <p style={{ margin: 0, fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
            Procurando pastas com notas fiscais neste computador...
          </p>
        </div>
      )}

      {!scanning && scanResult && (
        <>
          <p
            style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.tertiary,
              marginTop: 0,
              marginBottom: spacing.lg,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            {formatCount(scanResult.scannedDirs)} pastas verificadas em {scanResult.elapsedSeconds}s.
            {scanResult.candidates.length > 0
              ? ' As pastas com notas fiscais confirmadas já vêm marcadas.'
              : ''}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {scanResult.candidates.map((candidate: FolderCandidate) => {
              const checked = selectedPaths.includes(candidate.path);
              return (
                <label
                  key={candidate.path}
                  style={{
                    display: 'flex',
                    gap: spacing.md,
                    alignItems: 'flex-start',
                    padding: spacing.md,
                    backgroundColor: checked ? colors.success[50] : colors.background.secondary,
                    border: `1px solid ${checked ? colors.success[200] : colors.neutral[200]}`,
                    borderRadius: borderRadius.md,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePath(candidate.path)}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary,
                        fontFamily: typography.fontFamily.mono,
                        wordBreak: 'break-all',
                      }}
                    >
                      {candidate.path}
                    </div>
                    <div
                      style={{
                        fontSize: typography.fontSize.xs,
                        color: colors.text.tertiary,
                        marginTop: spacing.xs,
                        fontFamily: typography.fontFamily.sans,
                      }}
                    >
                      {formatCount(candidate.xmlCount)} arquivos XML
                      {candidate.zipCount > 0 ? ` · ${formatCount(candidate.zipCount)} ZIP` : ''}
                      {' · nota mais recente em '}
                      {formatDate(candidate.newestModified)}
                    </div>
                  </div>
                  {candidate.recommended && (
                    <span
                      style={{
                        fontSize: typography.fontSize.xs,
                        fontWeight: typography.fontWeight.semibold,
                        color: colors.success[700],
                        backgroundColor: colors.success[100],
                        padding: `2px ${spacing.sm}`,
                        borderRadius: borderRadius.sm,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Recomendada
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </>
      )}

      {scanError && (
        <p
          style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginTop: spacing.lg,
          }}
        >
          {scanError}
        </p>
      )}

      {!scanning && (
        <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.xl }}>
          <button onClick={runScan} style={{ ...components.button.secondary, flex: 1, justifyContent: 'center' }}>
            Procurar novamente
          </button>
          <button onClick={addPathManually} style={{ ...components.button.secondary, flex: 1, justifyContent: 'center' }}>
            <Icons.Folder />
            Adicionar pasta manualmente
          </button>
        </div>
      )}
    </div>
  );

  const reviewStep = (
    <div style={{ padding: spacing.xl }}>
      <div
        style={{
          backgroundColor: colors.background.secondary,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          marginBottom: spacing.xl,
          display: 'grid',
          gap: spacing.lg,
        }}
      >
        <div>
          <div
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.tertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: spacing.xs,
            }}
          >
            Mercado
          </div>
          <div style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>
            {marketName || 'Não identificado'}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.tertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: spacing.xs,
            }}
          >
            PDV
          </div>
          <div style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>
            {pdvName || 'Não identificado'}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.tertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: spacing.xs,
            }}
          >
            Pastas monitoradas ({selectedPaths.length})
          </div>
          {selectedPaths.length > 0 ? (
            <div style={{ display: 'grid', gap: spacing.xs }}>
              {selectedPaths.map((path) => (
                <div
                  key={path}
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.text.primary,
                    fontFamily: typography.fontFamily.mono,
                    padding: spacing.sm,
                    backgroundColor: colors.background.primary,
                    borderRadius: borderRadius.sm,
                    border: `1px solid ${colors.neutral[200]}`,
                    wordBreak: 'break-all',
                  }}
                >
                  {path}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: typography.fontSize.sm, color: colors.text.tertiary }}>
              Nenhuma pasta selecionada
            </span>
          )}
        </div>
      </div>

      {errorDetails && (
        <div
          style={{
            backgroundColor: colors.error[50],
            border: `1px solid ${colors.error[200]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        >
          <h4
            style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.error[900],
              marginTop: 0,
              marginBottom: spacing.sm,
            }}
          >
            Erro na instalação
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
            }}
          >
            {showErrorDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          {showErrorDetails && (
            <pre
              style={{
                marginTop: spacing.md,
                padding: spacing.md,
                backgroundColor: colors.background.primary,
                border: `1px solid ${colors.error[200]}`,
                borderRadius: borderRadius.sm,
                fontSize: typography.fontSize.xs,
                color: colors.error[800],
                overflow: 'auto',
                maxHeight: '200px',
                fontFamily: typography.fontFamily.mono,
              }}
            >
              {errorDetails}
            </pre>
          )}
        </div>
      )}

      {!installing && !errorDetails && (
        <div
          style={{
            backgroundColor: colors.success[50],
            border: `1px solid ${colors.success[200]}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            display: 'flex',
            gap: spacing.md,
          }}
        >
          <div style={{ color: colors.success[600], flexShrink: 0 }}>
            <Icons.Check />
          </div>
          <div>
            <h4
              style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.success[800],
                marginTop: 0,
                marginBottom: spacing.xs,
              }}
            >
              Pronto para instalar
            </h4>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.success[700], margin: 0 }}>
              Clique em "Concluir" para instalar o serviço e começar a enviar as notas.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const steps = [
    { id: 0, title: 'Bem-vindo', description: 'Configure o Agente Mercado Flow em poucos cliques', content: welcomeStep },
    { id: 1, title: 'Conectar conta', description: 'Leia o QR Code com a câmera do seu celular', content: pairingStep },
    { id: 2, title: 'Pastas de notas', description: 'Encontramos automaticamente onde suas notas ficam', content: scanStep },
    { id: 3, title: 'Revisão', description: 'Confira e instale o serviço', content: reviewStep },
  ];

  const currentStepData = steps[currentStep];

  const nextDisabled =
    installing ||
    (currentStep === 1 && pairing.phase !== 'approved') ||
    (currentStep === 2 && selectedPaths.length === 0);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.background.tertiary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        fontFamily: typography.fontFamily.sans,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          backgroundColor: colors.background.primary,
          borderRadius: borderRadius.xl,
          boxShadow: shadows.lg,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${colors.primary[600]} 0%, ${colors.primary[700]} 100%)`,
            padding: spacing['2xl'],
            color: colors.text.inverse,
          }}
        >
          <h1
            style={{
              fontSize: typography.fontSize['2xl'],
              fontWeight: typography.fontWeight.bold,
              margin: 0,
              marginBottom: spacing.sm,
            }}
          >
            Agente Mercado Flow
          </h1>
          <p style={{ fontSize: typography.fontSize.sm, opacity: 0.9, margin: 0 }}>
            Assistente de configuração
          </p>
        </div>

        <div style={{ padding: spacing.xl, borderBottom: `1px solid ${colors.neutral[200]}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {steps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                {index < steps.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '20px',
                      left: '50%',
                      right: '-50%',
                      height: '2px',
                      backgroundColor: index < currentStep ? colors.primary[500] : colors.neutral[300],
                      zIndex: 0,
                    }}
                  />
                )}
                <div
                  style={{
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
                    transition: 'all 0.3s ease',
                  }}
                >
                  {index < currentStep ? <Icons.Check /> : index + 1}
                </div>
                <span
                  style={{
                    fontSize: typography.fontSize.xs,
                    color: index === currentStep ? colors.text.primary : colors.text.tertiary,
                    fontWeight:
                      index === currentStep
                        ? typography.fontWeight.semibold
                        : typography.fontWeight.normal,
                    textAlign: 'center',
                  }}
                >
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: spacing['2xl'] }}>
          <div style={{ marginBottom: spacing.xl }}>
            <h2
              style={{
                fontSize: typography.fontSize['2xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                marginTop: 0,
                marginBottom: spacing.sm,
              }}
            >
              {currentStepData.title}
            </h2>
            <p style={{ fontSize: typography.fontSize.base, color: colors.text.secondary, margin: 0 }}>
              {currentStepData.description}
            </p>
          </div>

          {currentStepData.content}
        </div>

        <div
          style={{
            padding: spacing.xl,
            borderTop: `1px solid ${colors.neutral[200]}`,
            backgroundColor: colors.background.secondary,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            {currentStep === 0 && (
              <button
                onClick={onSkip}
                style={{
                  ...components.button.secondary,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: colors.text.tertiary,
                }}
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
                  cursor: installing ? 'not-allowed' : 'pointer',
                }}
              >
                <Icons.ArrowLeft />
                Voltar
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={nextDisabled}
              style={{
                ...components.button.primary,
                opacity: nextDisabled ? 0.5 : 1,
                cursor: nextDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {installing ? (
                <>
                  <div
                    className="spinner"
                    style={{
                      width: '16px',
                      height: '16px',
                      border: `2px solid ${colors.text.inverse}`,
                      borderTopColor: 'transparent',
                      borderRadius: borderRadius.full,
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
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
