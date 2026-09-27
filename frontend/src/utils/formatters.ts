/**
 * Utilitários de formatação — pt-BR
 *
 * Centralize aqui todas as funções de formatação de texto, datas, moeda e números.
 * Todas as saídas devem estar em português brasileiro (pt-BR).
 *
 * @module utils/formatters
 */

/** Retorna o valor formatado como moeda BRL (R$). */
export const formatMoney = (value?: number | null): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

/** Alias legado — use formatMoney em novos componentes. */
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/** Retorna o valor formatado de forma compacta (1,2 mil, 3,4 mi). */
export const formatCompact = (value?: number | null): string =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));

/**
 * Número com casas fixas no formato brasileiro: `formatDecimal(1234.5, 1)` → "1.234,5".
 * Substitui `toFixed`, que sempre usa ponto decimal (UX-07).
 */
export const formatDecimal = (value?: number | string | null, digits = 1): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(Number(value ?? 0));

/** Quantidade sem zeros sobrando: 12 → "12", 2.5 → "2,5", 0.125 → "0,125". */
export const formatQuantityTrim = (value?: number | string | null, maxDigits = 3): string =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDigits }).format(Number(value ?? 0));

/** Retorna o valor como percentual com sinal (+12,3% / -4,5%). */
export const formatSignedPercent = (value?: number | null): string => {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${formatDecimal(numeric, 1)}%`;
};

/** Retorna o valor como percentual inteiro (85%). */
export const formatPercent = (value?: number | null): string =>
  `${formatDecimal(value, 0)}%`;

/** Retorna o valor como quantidade inteira. */
export const formatQuantity = (value?: number | null): string =>
  formatDecimal(value, 0);

/** Retorna data/hora formatada em pt-BR ou '--' se inválida. */
export const formatDateTime = (value?: string | null): string => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '--' : parsed.toLocaleString('pt-BR');
};

/** Alias para formatDateTime — usado em contextos de datas simples. */
export const formatDate = formatDateTime;

/** Retorna o texto ou '--' se vazio/nulo. */
export const textValue = (value?: string | null): string => {
  if (!value) return '--';
  const normalized = value.trim();
  return normalized || '--';
};

/** Converte string ISO para formato aceitável por input[type=datetime-local]. */
export const toDateTimeLocalValue = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
};

/** Normaliza JSON para exibição formatada no editor. */
export const normalizeJsonForEditor = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
};

/** Retorna o valor trimado ou undefined. Usado para campos opcionais no payload. */
export const normalizeOptionalField = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed || undefined;
};

/** Valida e retorna JSON compacto ou lança erro com rótulo do campo. */
export const validateJsonField = (label: string, value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    throw new Error(`${label} inválido. Informe um JSON válido.`);
  }
};
