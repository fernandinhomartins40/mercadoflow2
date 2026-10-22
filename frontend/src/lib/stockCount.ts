/**
 * Textos e contas da contagem de estoque, iguais no painel (/app/contar) e no
 * Bipaê (/confere/contar). O vocabulário é o do Bipaê: "bipe", "quantos tem",
 * "contados", "enviado".
 */

export const COUNT_TEXT = {
  title: 'Contar estoque',
  subtitle: 'Bipe o produto e diga quantos tem',
  steps: ['Bipe o produto', 'Diga quantos tem', 'Salve a contagem'] as const,
  shelf: 'Na prateleira',
  stock: 'No depósito',
  total: 'Total na loja',
  save: 'Salvar contagem',
  saveAndNext: 'Salvar e bipar o próximo',
  saving: 'Enviando...',
  searching: 'Buscando...',
  skip: 'Pular este produto',
  scan: 'Bipar produto',
  scanOther: 'Bipar outro produto',
  typeCode: 'Digitar o código',
  retry: 'Tentar de novo',
  sent: 'Enviado',
  waiting: 'Esperando internet',
  allSent: 'Tudo enviado',
  empty: 'Nenhum produto contado ainda.',
  missingTitle: 'Produto não está no cadastro',
  missingHint: (code: string) => `Código ${code}. Ele aparece aqui depois da primeira venda ou da primeira nota de entrada.`,
  lookupError: 'Não foi possível buscar o produto. Confira a internet e bipe de novo.',
  saveError: 'Não foi possível enviar a contagem. Confira a internet e tente de novo.',
  counted: (n: number) => `Contados (${n})`,
  doneTitle: (n: number) => `${n} ${n === 1 ? 'produto contado' : 'produtos contados'}`,
  doneHint: 'O estoque desses produtos agora é medido. Em alguns minutos o placar do Início, o dinheiro parado e as sugestões de compra passam a usar a contagem.',
  countMore: 'Contar mais',
} as const;

/** "12,5" ou "12.5" viram número; vazio ou inválido vira 0. */
export const parseUnits = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const fmtUnits = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Leitor de código de barras (USB ou câmera) manda só dígitos: 6 ou mais é código, não nome. */
export const isBarcode = (raw: string) => /^\d{6,}$/.test(raw.trim());
