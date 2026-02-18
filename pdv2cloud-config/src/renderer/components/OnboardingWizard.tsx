import React, { useState } from 'react';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface Step {
  id: number;
  title: string;
  description: string;
  component: React.ReactNode;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [watchPaths, setWatchPaths] = useState<string[]>([]);
  const [autoDetectedPaths, setAutoDetectedPaths] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);

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
    if (!apiKey) {
      alert('Por favor, insira a chave de acesso');
      return false;
    }

    try {
      await (window as any).electron.invoke('api:testKey', apiKey);
      return true;
    } catch (err) {
      alert('Chave de acesso inválida. Verifique e tente novamente.');
      return false;
    }
  };

  const saveConfiguration = async () => {
    try {
      const config = {
        api_key: apiKey,
        watch_paths: watchPaths,
        api_url: 'https://mercadoflow.com',
      };
      await (window as any).electron.invoke('config:save', config);
      return true;
    } catch (err) {
      alert('Erro ao salvar configuração: ' + err);
      return false;
    }
  };

  const installService = async () => {
    setInstalling(true);
    try {
      await (window as any).electron.invoke('service:install');
      await (window as any).electron.invoke('service:start');
      return true;
    } catch (err) {
      alert('Erro ao instalar serviço: ' + err);
      return false;
    } finally {
      setInstalling(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      // Welcome screen
      setCurrentStep(1);
    } else if (currentStep === 1) {
      // API Key validation
      const valid = await testConnection();
      if (valid) {
        setCurrentStep(2);
      }
    } else if (currentStep === 2) {
      // Watch paths
      if (watchPaths.length === 0) {
        alert('Selecione pelo menos uma pasta para monitoramento');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Installation
      const saved = await saveConfiguration();
      if (!saved) return;

      const installed = await installService();
      if (installed) {
        setCurrentStep(4);
      }
    } else if (currentStep === 4) {
      // Completion
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const togglePath = (path: string) => {
    if (watchPaths.includes(path)) {
      setWatchPaths(watchPaths.filter(p => p !== path));
    } else {
      setWatchPaths([...watchPaths, path]);
    }
  };

  const addCustomPath = async () => {
    try {
      const path = await (window as any).electron.invoke('dialog:pickFolder');
      if (path && !watchPaths.includes(path)) {
        setWatchPaths([...watchPaths, path]);
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  };

  const steps: Step[] = [
    {
      id: 0,
      title: 'Bem-vindo ao PDV2Cloud!',
      description: 'Configure seu sistema em 3 passos simples',
      component: (
        <div className="text-center py-8">
          <div className="text-6xl mb-6">🚀</div>
          <h2 className="text-3xl font-bold mb-4">Bem-vindo!</h2>
          <p className="text-lg text-gray-600 mb-6 max-w-md mx-auto">
            Vamos configurar seu coletor de notas fiscais em apenas alguns minutos.
            É rápido e fácil!
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mt-8">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-3xl mb-2">🔑</div>
              <div className="font-semibold">Conectar</div>
              <div className="text-sm text-gray-600">Insira sua chave</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-3xl mb-2">📁</div>
              <div className="font-semibold">Configurar</div>
              <div className="text-sm text-gray-600">Selecione pastas</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-3xl mb-2">✅</div>
              <div className="font-semibold">Pronto!</div>
              <div className="text-sm text-gray-600">Comece a usar</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 1,
      title: 'Conecte ao MercadoFlow',
      description: 'Insira a chave de acesso do seu mercado',
      component: (
        <div className="max-w-lg mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="text-2xl mr-3">💡</div>
              <div>
                <div className="font-semibold text-blue-900">Onde encontrar a chave?</div>
                <div className="text-sm text-blue-700 mt-1">
                  1. Acesse o painel web em <strong>mercadoflow.com</strong><br />
                  2. Vá em <strong>Configurações → Integrações</strong><br />
                  3. Copie a chave de acesso do coletor
                </div>
              </div>
            </div>
          </div>

          <label className="block mb-2 font-semibold">Chave de Acesso:</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pdv2_..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <div className="text-xs text-gray-500 mt-2">
            Começa com "pdv2_" seguido de caracteres aleatórios
          </div>
        </div>
      ),
    },
    {
      id: 2,
      title: 'Selecione as pastas para monitoramento',
      description: 'Onde estão os arquivos XML das notas fiscais?',
      component: (
        <div className="max-w-2xl mx-auto">
          {autoDetectedPaths.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <div className="text-xl mr-2">🎯</div>
                <h3 className="font-semibold">Pastas detectadas automaticamente:</h3>
              </div>
              <div className="space-y-2">
                {autoDetectedPaths.map((path) => (
                  <label
                    key={path}
                    className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={watchPaths.includes(path)}
                      onChange={() => togglePath(path)}
                      className="mr-3 w-5 h-5"
                    />
                    <div className="flex-1">
                      <div className="font-mono text-sm">{path}</div>
                    </div>
                    <div className="text-green-600 text-sm">✓ Recomendado</div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <button
              onClick={addCustomPath}
              className="w-full px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center justify-center">
                <div className="text-2xl mr-2">➕</div>
                <div className="font-semibold">Adicionar pasta personalizada</div>
              </div>
            </button>
          </div>

          {watchPaths.length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="font-semibold mb-2">Pastas selecionadas ({watchPaths.length}):</div>
              <div className="space-y-1">
                {watchPaths.map((path) => (
                  <div key={path} className="flex items-center text-sm">
                    <div className="text-green-600 mr-2">✓</div>
                    <div className="font-mono flex-1">{path}</div>
                    <button
                      onClick={() => togglePath(path)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 3,
      title: 'Instalando o serviço',
      description: 'Aguarde enquanto configuramos tudo para você',
      component: (
        <div className="text-center py-8">
          <div className="text-6xl mb-6 animate-bounce">⚙️</div>
          <h3 className="text-2xl font-bold mb-4">
            {installing ? 'Instalando...' : 'Pronto para instalar'}
          </h3>
          <p className="text-gray-600 mb-6">
            {installing
              ? 'O serviço está sendo instalado e configurado. Isso pode levar alguns segundos.'
              : 'Vamos instalar o serviço de coleta automática de notas fiscais.'}
          </p>
          {installing && (
            <div className="max-w-md mx-auto">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '75%' }}></div>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 4,
      title: 'Tudo pronto! 🎉',
      description: 'Seu sistema está configurado e funcionando',
      component: (
        <div className="text-center py-8">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="text-3xl font-bold mb-4 text-green-600">Configuração concluída!</h2>
          <p className="text-lg text-gray-600 mb-6 max-w-md mx-auto">
            O coletor está rodando em segundo plano e já começou a monitorar suas notas fiscais.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md mx-auto">
            <div className="font-semibold text-green-900 mb-2">O que acontece agora?</div>
            <ul className="text-sm text-green-700 text-left space-y-2">
              <li>✓ Notas fiscais serão coletadas automaticamente</li>
              <li>✓ Dados enviados de forma segura para a nuvem</li>
              <li>✓ Relatórios disponíveis no painel web</li>
              <li>✓ Tudo funcionando em segundo plano</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">PDV2Cloud</h1>
          <p className="text-gray-600">Assistente de Configuração</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2 text-sm text-gray-600">
            <span>Passo {currentStep + 1} de {steps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{currentStepData.title}</h2>
            <p className="text-gray-600">{currentStepData.description}</p>
          </div>

          <div className="min-h-[400px]">{currentStepData.component}</div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={onSkip}
            className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Pular configuração
          </button>

          <div className="flex gap-3">
            {currentStep > 0 && currentStep < 4 && (
              <button
                onClick={handleBack}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
              >
                ← Voltar
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={installing}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-colors font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentStep === 0 && 'Começar →'}
              {currentStep === 1 && 'Validar e Continuar →'}
              {currentStep === 2 && 'Próximo →'}
              {currentStep === 3 && (installing ? 'Instalando...' : 'Instalar →')}
              {currentStep === 4 && 'Concluir ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
