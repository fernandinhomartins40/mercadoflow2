import { Capacitor } from '@capacitor/core';

/**
 * App MercadoFlow Gestão (Android e iOS): as telas do painel vão DENTRO do app,
 * e não são o site aberto num navegador. Por isso, aqui:
 * - a API fica em outro endereço (mercadoflow.com), e o login vai pelo cabeçalho
 *   Authorization, com o token guardado no próprio aparelho, sem cookie;
 * - caminhos "/api/..." que o servidor devolve viram endereços completos;
 * - baixar arquivo abre a folha de compartilhar do sistema;
 * - assinatura e pagamento não aparecem (regras da Play Store e da App Store).
 *
 * Fora desse build (site, PWA e Bipaê), tudo aqui fica desligado.
 */

export const IS_GESTAO_APP = import.meta.env.VITE_NATIVE_APP === 'gestao';

/** Endereço público do MercadoFlow, para a API e para links "/api/..." no app. */
export const API_ORIGIN = 'https://mercadoflow.com';

const TOKEN_KEY = 'mf_session_token';
let sessionToken: string | null = null;

/** Lê o token guardado antes do primeiro desenho da tela (o /me já sai com ele). */
export async function loadNativeSession() {
  if (!IS_GESTAO_APP) return;
  try {
    // Painel claro: ícones escuros na barra de status.
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // Sem o plugin (navegador): nada a fazer.
  }
  try {
    const { Preferences } = await import('@capacitor/preferences');
    sessionToken = (await Preferences.get({ key: TOKEN_KEY })).value;
  } catch {
    sessionToken = null;
  }
}

export const getSessionToken = () => sessionToken;

export async function setSessionToken(token: string | null) {
  sessionToken = token;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
    else await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    // Sem armazenamento: a sessão vale até fechar o app.
  }
}

/** Troca "/api/..." por "https://mercadoflow.com/api/..." em toda a resposta (fotos, artes, arquivos). */
export function absolutizeApiPaths<T>(value: T): T {
  if (typeof value === 'string') {
    return (value.startsWith('/api/') ? `${API_ORIGIN}${value}` : value) as T;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = absolutizeApiPaths(value[i]);
    return value;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = absolutizeApiPaths(record[key]);
  }
  return value;
}

/** Endereço completo de um caminho da API, para links que saem do app (ex.: instalador do agente). */
export const apiHref = (path: string) => (IS_GESTAO_APP ? `${API_ORIGIN}${path}` : path);

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Salva um arquivo gerado na tela (CSV, imagem, PDF). No navegador, é o download
 * comum. No app, o WebView não baixa blob: grava no cache e abre a folha de
 * compartilhar, de onde a pessoa salva, manda no WhatsApp ou abre em outro app.
 */
export async function saveBlob(blob: Blob, filename: string, title = 'Arquivo do MercadoFlow') {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share')) {
    try {
      const [{ Directory, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const written = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
      await Share.share({ title, files: [written.uri], dialogTitle: 'Salvar ou enviar o arquivo' });
      return;
    } catch (e) {
      // Fechar a folha sem escolher não é erro.
      if (/cancel/i.test((e as Error)?.message || '')) return;
      throw new Error('Não foi possível abrir o arquivo no celular. Tente de novo.');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
