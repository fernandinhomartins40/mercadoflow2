import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Bipaê para Android: conferência de nota e contagem de estoque no mesmo app.
 *
 * O app abre o Bipaê publicado (mercadoflow.com/confere): login, sessão e
 * atualizações são os mesmos da web, sem nova versão na loja a cada mudança.
 * O nativo entra onde a web não alcança: leitor de código de barras do Google
 * (ML Kit), vibração, barra de status e tela de abertura.
 */
const config: CapacitorConfig = {
  appId: 'br.com.bipae.confere',
  appName: 'Bipaê',
  webDir: 'dist',
  server: {
    url: 'https://mercadoflow.com/confere/',
    androidScheme: 'https',
    allowNavigation: ['mercadoflow.com'],
    errorPath: 'bipae-offline.html',
  },
  android: {
    backgroundColor: '#045e48',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#045e48',
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#045e48',
      style: 'DARK',
    },
  },
};

export default config;
