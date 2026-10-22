import api from './api';

/** Resultado do pedido de cliente (LGPD): quantas notas tiveram o CPF apagado. */
export interface ConsumerAnonymizationResult {
  notasAlteradas: number;
  perfilApagado: boolean;
  cpfFinal: string;
}

export const privacyService = {
  anonymizeConsumer: async (marketId: string, cpf: string): Promise<ConsumerAnonymizationResult> =>
    (await api.post(`/v1/markets/${marketId}/privacy/consumer-anonymization`, { cpf })).data,
};
