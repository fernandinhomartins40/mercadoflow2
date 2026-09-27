import api from './api';
import type { ActivationStatus } from '../types/activation.types';

export const activationService = {
  /** Onde a loja está até a primeira análise: agente, primeira nota, primeira análise. */
  async getStatus(marketId: string): Promise<ActivationStatus> {
    const response = await api.get(`/v1/markets/${marketId}/activation`);
    return response.data;
  },
};
