import api from './api';

/**
 * "Pergunte aos dados": o lojista pergunta em português e o sistema responde
 * consultando os números reais da loja.
 *
 * O histórico fica no cliente e viaja a cada pergunta — o backend não guarda
 * conversa. O que importa registrar é a decisão, e isso já vive em
 * `recommendations`.
 */

export interface ChatStatus {
  /** Há chave de IA configurada. Sem isso a tela convida a configurar. */
  disponivel: boolean;
  sugestoes: string[];
}

export interface ChatMessage {
  autor: 'usuario' | 'assistente';
  texto: string;
  /**
   * Quais consultas alimentaram a resposta. É o que separa "a IA disse" de
   * "os dados dizem" — o lojista consegue conferir a origem do número.
   */
  consultasUsadas?: string[];
  erro?: boolean;
}

export interface AskResponse {
  sucesso: boolean;
  resposta?: string;
  consultasUsadas?: string[];
  provedor?: string;
  erro?: string;
}

const base = (marketId: string) => `/v1/markets/${marketId}/ai/chat`;

export const dataChatService = {
  status: async (marketId: string): Promise<ChatStatus> => {
    const { data } = await api.get(`${base(marketId)}/status`);
    return data;
  },

  ask: async (
    marketId: string,
    pergunta: string,
    historico: ChatMessage[],
  ): Promise<AskResponse> => {
    const { data } = await api.post(base(marketId), {
      pergunta,
      // Só autor e texto: o backend ignora o resto e não faz sentido enviar.
      historico: historico.map(m => ({ autor: m.autor, texto: m.texto })),
    });
    return data;
  },
};

/** Nomes técnicos das ferramentas traduzidos para o que o lojista entende. */
export const CONSULTA_LABEL: Record<string, string> = {
  listar_produtos_para_comprar: 'Produtos para comprar',
  listar_capital_parado: 'Capital parado',
  resumo_do_estoque: 'Resumo do estoque',
  consultar_produto: 'Dados do produto',
  resumo_de_vendas: 'Resumo de vendas',
  produtos_mais_vendidos: 'Ranking de produtos',
  vendas_por_dia_da_semana: 'Vendas por dia da semana',
  listar_oportunidades: 'Oportunidades detectadas',
  listar_recomendacoes: 'Recomendações pendentes',
  horario_de_movimento: 'Horário de movimento',
};
