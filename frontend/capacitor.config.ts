import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Dois apps saem deste projeto. O comando escolhe qual pela variável MF_APP
 * (scripts/cap.mjs). Sem ela, vale o Bipaê, como sempre foi.
 *
 * Bipaê (Android): conferência de nota e contagem de estoque.
 * O app abre o Bipaê publicado (mercadoflow.com/confere): login, sessão e
 * atualizações são os mesmos da web, sem nova versão na loja a cada mudança.
 * O nativo entra onde a web não alcança: leitor de código de barras do Google
 * (ML Kit), vibração, barra de status e tela de abertura.
 *
 * MercadoFlow Gestão (Android e iOS): o painel do supermercadista.
 * As telas vão DENTRO do app (build "gestao" em dist-gestao/), e não é o site
 * aberto num navegador: abre sem internet, fala com a API em mercadoflow.com
 * e usa o nativo para ler código de barras, vibrar, compartilhar arquivos e
 * guardar a sessão (src/lib/nativeApp.ts). Projetos nativos em android-gestao/
 * e ios-gestao/.
 */
const bipae: CapacitorConfig = {
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

const gestao: CapacitorConfig = {
  appId: 'br.com.mercadoflow.gestao',
  appName: 'MercadoFlow Gestão',
  webDir: 'dist-gestao',
  server: {
    androidScheme: 'https',
  },
  android: {
    path: 'android-gestao',
    backgroundColor: '#0F3A29',
    // Android 15+ desenha o app por baixo das barras do sistema: o Capacitor dá a margem.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  ios: {
    path: 'ios-gestao',
    backgroundColor: '#0F3A29',
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0F3A29',
      showSpinner: false,
    },
    StatusBar: {
      // O painel é claro: ícones escuros na barra de status.
      backgroundColor: '#FFFFFF',
      style: 'LIGHT',
    },
  },
};

const config: CapacitorConfig = process.env.MF_APP === 'gestao' ? gestao : bipae;

export default config;
