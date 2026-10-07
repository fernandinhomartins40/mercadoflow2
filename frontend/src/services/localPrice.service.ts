import api from './api';

/**
 * Preço da vizinhança: preço dos produtos da loja nas lojas próximas, pelo
 * código de barras, no Menor Preço do Nota Paraná. Só o Paraná oferece esse
 * serviço; fora dele a função fica desligada e a tela diz por quê.
 */

export interface LocalPriceStatus {
  available: boolean;
  inParana: boolean;
  knownLocation: boolean;
  onlyParana: string;
  provider: string;
  providerUrl: string;
  uf: string | null;
  city: string | null;
  /** LOJA (GPS marcado pelo dono) | MUNICIPIO (centro da cidade) */
  geoSource: string | null;
  running: boolean;
  productsWithReference: number;
  productsChecked: number;
  lastCollectedOn: string | null;
}

export interface LocalPriceSnapshot {
  product_id: string;
  collected_on: string;
  /** OK | POUCAS_LOJAS | SEM_DADOS */
  status: string;
  radius_km: number;
  stores: number;
  discarded: number;
  median_price: number | null;
  p25_price: number | null;
  p75_price: number | null;
  min_price: number | null;
  min_store: string | null;
  min_distance_km: number | null;
  own_price: number | null;
  newest_seen: string | null;
}

const base = (marketId: string) => `/v1/markets/${marketId}/local-prices`;

export const localPriceService = {
  status: (marketId: string) => api.get<LocalPriceStatus>(base(marketId)).then((r) => r.data),
  setLocation: (marketId: string, latitude: number, longitude: number) =>
    api.put<LocalPriceStatus>(`${base(marketId)}/location`, { latitude, longitude }).then((r) => r.data),
  refresh: (marketId: string) => api.post<{ started: boolean }>(`${base(marketId)}/refresh`).then((r) => r.data),
  products: (marketId: string, ids: string[]) =>
    api.get<LocalPriceSnapshot[]>(`${base(marketId)}/products`, { params: { ids: ids.slice(0, 200).join(',') } }).then((r) => r.data),
};

/** Onde o preço da loja cai na faixa da vizinhança (25% a 75% dos preços). */
export function positionOf(own: number | null | undefined, s: LocalPriceSnapshot | null | undefined): { tone: 'green' | 'amber' | 'red' | 'gray'; text: string } {
  if (own == null || !s || s.p25_price == null || s.p75_price == null) return { tone: 'gray', text: 'sem comparação' };
  const p25 = Number(s.p25_price);
  const p75 = Number(s.p75_price);
  if (own < p25) return { tone: 'amber', text: `${Math.round((1 - own / p25) * 100)}% abaixo da faixa` };
  if (own > p75) return { tone: 'red', text: `${Math.round((own / p75 - 1) * 100)}% acima da faixa` };
  return { tone: 'green', text: 'dentro da faixa' };
}
