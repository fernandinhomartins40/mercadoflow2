import api from './api';

/**
 * "Baixar meus dados" (LGPD art. 18): arquivo JSON com os dados pessoais da
 * própria pessoa. Vai por blob porque a requisição precisa do cabeçalho de
 * autenticação que o interceptor do axios injeta.
 */

/** O que vem no arquivo, em linguagem simples (painel e Bipaê usam o mesmo texto). */
export const DATA_EXPORT_SUMMARY =
  'Um arquivo com os seus dados: nome, e-mail, papel na equipe, datas de cadastro e de último acesso, '
  + 'se a verificação em duas etapas está ligada, convites, aceites dos termos, pedidos de exclusão, '
  + 'avisos do WhatsApp e o histórico de acessos (data, IP e navegador). Para o dono, também o cadastro da loja. '
  + 'A sua senha e os códigos de segurança não vão no arquivo.';

const fileName = (disposition?: string) =>
  /filename="?([^";]+)"?/i.exec(disposition || '')?.[1] || `meus-dados-mercadoflow-${new Date().toISOString().slice(0, 10)}.json`;

/** Busca o arquivo. Em erro, lança Error com a mensagem para a pessoa (inclusive o limite de 10 minutos). */
export async function fetchMyData(): Promise<File> {
  try {
    const r = await api.get('/v1/me/data-export', { responseType: 'blob' });
    return new File([r.data as Blob], fileName(r.headers?.['content-disposition'] as string | undefined), { type: 'application/json' });
  } catch (err) {
    // Com responseType blob, o corpo do erro também chega como Blob.
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    let msg = '';
    if (data instanceof Blob) {
      try { msg = (JSON.parse(await data.text()) as { userMessage?: string }).userMessage || ''; } catch { msg = ''; }
    }
    throw new Error(msg || 'Não foi possível gerar o arquivo agora. Tente de novo em alguns minutos.');
  }
}

/** Salva pelo navegador (link de download). */
export function saveFile(file: File) {
  const url = window.URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', file.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

/**
 * No celular (Bipaê), tenta a folha de compartilhar do sistema, que deixa salvar
 * ou mandar o arquivo; se não houver, cai no download comum.
 */
export async function shareOrSave(file: File) {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Meus dados no MercadoFlow' });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  saveFile(file);
}
