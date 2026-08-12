import api from './api';

/**
 * Recursos do plano Profissional: base de clientes, simulação de preço e
 * exportação.
 *
 * Todos seguem o mesmo contrato de bloqueio — `bloqueadoPorPlano` com a
 * mensagem pronta — para que a tela mostre o convite em vez de sumir. Recurso
 * oculto não gera desejo porque o lojista nem sabe que existe.
 */

/* ─── Base de clientes ─── */

export interface CustomerOverview {
  totalCustomers: number;
  recurringCustomers: number;
  occasionalCustomers: number;
  singlePurchaseCustomers: number;
  recurringSharePercent?: number | null;
  recurringAverageTicket?: number | null;
  singleAverageTicket?: number | null;
  averageDaysBetweenPurchases?: number | null;
}

export interface ProductRepurchase {
  productId: string;
  name: string;
  imageUrl?: string | null;
  distinctCustomers: number;
  repurchasingCustomers: number;
  repurchaseRate?: number | null;
  averageDaysBetween?: number | null;
}

export interface CustomerResponse {
  bloqueadoPorPlano: boolean;
  mensagem?: string;
  resumo?: CustomerOverview;
  observacao?: string;
}

export const customerService = {
  overview: async (marketId: string): Promise<CustomerResponse> => {
    const { data } = await api.get(`/v1/markets/${marketId}/intelligence/customers`);
    return data;
  },

  repurchase: async (marketId: string, limit = 20): Promise<ProductRepurchase[]> => {
    const { data } = await api.get(
      `/v1/markets/${marketId}/intelligence/customers/repurchase`,
      { params: { limit } },
    );
    return data;
  },
};

/* ─── Simulação de preço ─── */

export interface PriceScenario {
  productId: string;
  productName: string;
  precoAtual: number;
  precoSimulado: number;
  descontoPercent: number;
  elasticidade: number;
  descontoMedioJaPraticado?: number | null;
  quantidadeDiariaAtual: number;
  quantidadeDiariaProjetada: number;
  variacaoQuantidadePercent?: number | null;
  receitaDiariaAtual: number;
  receitaDiariaProjetada: number;
  variacaoReceitaPercent?: number | null;
  margemDiariaAtual?: number | null;
  margemDiariaProjetada?: number | null;
  variacaoMargemPercent?: number | null;
  /** Há elasticidade medida no histórico; falso = estimativa grosseira. */
  confiavel: boolean;
  /** O desconto pedido está fora da faixa que a loja já praticou. */
  extrapolando: boolean;
  veredito: string;
  ressalvas: string[];
}

export interface PriceSimulationResponse {
  bloqueadoPorPlano: boolean;
  mensagem?: string;
  cenarios?: PriceScenario[];
}

export const priceSimulationService = {
  simulate: async (
    marketId: string,
    productId: string,
    desconto?: number,
  ): Promise<PriceSimulationResponse> => {
    const { data } = await api.get(
      `/v1/markets/${marketId}/intelligence/price-simulation`,
      { params: { productId, ...(desconto ? { desconto } : {}) } },
    );
    return data;
  },
};

/* ─── Exportação ─── */

export interface ExportStatus {
  disponivel: boolean;
  mensagem?: string;
}

export const exportService = {
  status: async (marketId: string): Promise<ExportStatus> => {
    const { data } = await api.get(`/v1/markets/${marketId}/export/status`);
    return data;
  },

  /**
   * Baixa o CSV pelo navegador.
   *
   * Usa blob em vez de abrir a URL direto porque a requisição precisa do
   * cabeçalho de autenticação que o interceptor do axios injeta — uma
   * navegação simples iria sem ele e receberia 401.
   */
  download: async (marketId: string, arquivo: string): Promise<void> => {
    const { data } = await api.get(`/v1/markets/${marketId}/export/${arquivo}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', arquivo);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
