import { Capacitor } from '@capacitor/core';

/**
 * O que o app Bipaê (Android) faz pelo nativo: ler código de barras com o
 * leitor do Google (ML Kit) e vibrar. Na web, quem chama cai na câmera do
 * navegador (Scanner) e na vibração do navegador.
 */

export const isNativeApp = () => Capacitor.isNativePlatform();

export type BarcodeKind = 'produto' | 'nota';

/** Vibração curta de "bipou" (ou longa, de erro). */
export const buzz = async (kind: 'ok' | 'erro' = 'ok') => {
  if (isNativeApp()) {
    try {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'ok') await Haptics.impact({ style: ImpactStyle.Medium });
      else await Haptics.notification({ type: NotificationType.Error });
      return;
    } catch {
      // segue para a vibração do navegador
    }
  }
  try { navigator.vibrate?.(kind === 'ok' ? 40 : [80, 60, 80]); } catch { /* sem vibração */ }
};

/**
 * Abre o leitor do Google e devolve o código lido, ou nulo se a pessoa voltou.
 * O leitor do Google não pede permissão de câmera ao app: ele mesmo mostra a
 * tela de leitura. Se o módulo ainda não estiver no aparelho, o Android baixa.
 */
export const scanWithNative = async (kind: BarcodeKind): Promise<string | null> => {
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error('O leitor de código de barras está sendo instalado no celular. Tente de novo em alguns segundos.');
  }
  const formats = kind === 'nota'
    ? [BarcodeFormat.Code128, BarcodeFormat.QrCode]
    : [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128, BarcodeFormat.Itf];
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats });
    return barcodes[0]?.rawValue ?? null;
  } catch (e) {
    // Voltar sem ler não é erro.
    if (String((e as Error)?.message ?? e).toLowerCase().includes('cancel')) return null;
    throw e;
  }
};
