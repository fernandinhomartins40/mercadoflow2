export interface ConferePlan { id: string; name: string; reads: number; priceCents: number; active: boolean }

export interface ConfereCertificate {
  cnpj: string;
  holder: string | null;
  notAfter: string;
  lastSyncAt: string | null;
  lastStatus: string | null;
  expired: boolean;
}

export interface ConfereStatus {
  enabled: boolean;
  termsAccepted: boolean;
  termsVersion: string;
  termsText: string;
  balance: number;
  trialGranted: boolean;
  trialReads: number;
  pricePerReadCents: number;
  plans: ConferePlan[];
  certificate: ConfereCertificate | null;
  pixAvailable: boolean;
  stripeAvailable: boolean;
  marketName: string;
  marketCnpj: string | null;
}

export interface ReadResult {
  documentId: string;
  accessKey: string;
  source: 'SAVED' | 'SEFAZ' | 'MEUDANFE' | 'UPLOAD';
  charged: boolean;
  balance: number;
}

export interface DocumentSummary {
  id: string;
  accessKey: string;
  completeness: 'FULL' | 'SUMMARY';
  source: string;
  emitterName: string | null;
  number: string | null;
  issuedAt: string | null;
  totalValue: number | null;
  itemsCount: number | null;
  volumes: number | null;
  checkStatus: 'OPEN' | 'DONE' | null;
  checkedAt: string | null;
}

export interface ConfereItem {
  number: number;
  code: string | null;
  ean: string | null;
  name: string;
  catalogName: string | null;
  imageUrl: string | null;
  unit: string | null;
  quantity: number | null;
  taxUnit: string | null;
  taxQuantity: number | null;
  taxEan: string | null;
  unitPrice: number | null;
  total: number | null;
  lot: string | null;
  expiry: string | null;
  lastUnitPrice: number | null;
  priceChangePercent: number | null;
}

export type ItemIssue = 'AVARIA' | 'VALIDADE' | 'TROCADO';

export interface ItemCount {
  counted: number | null;
  issue?: ItemIssue | null;
  note?: string;
}

export interface ConfereCheck {
  id: string;
  status: 'OPEN' | 'DONE';
  blind: boolean;
  counts: Record<string, ItemCount> | null;
  summary: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  finishedBy: string | null;
}

export interface ConfereDocument {
  id: string;
  accessKey: string;
  emitterCnpj: string | null;
  emitterName: string | null;
  number: string | null;
  series: string | null;
  issuedAt: string | null;
  totalValue: number | null;
  volumes: number | null;
  volumeKind: string | null;
  grossWeight: number | null;
  items: ConfereItem[];
  check: ConfereCheck | null;
}

export interface ConfereOrder {
  id: string;
  planName: string | null;
  reads: number;
  amountCents: number;
  method: 'PIX' | 'STRIPE';
  status: 'PENDING' | 'PAID' | 'CANCELED';
  txid: string;
  pixPayload: string | null;
  pixQrPng: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface LedgerEntry { delta: number; kind: string; note: string | null; createdAt: string }

// ── Superadmin ─────────────────────────────────────────────────────────

export interface ConfereSettings {
  enabled: boolean;
  meuDanfeConfigured: boolean;
  meuDanfeKeyHint: string | null;
  pricePerReadCents: number;
  trialReads: number;
  termsVersion: string;
  termsText: string;
  pixKey: string | null;
  pixMerchantName: string | null;
  pixMerchantCity: string | null;
  stripeEnabled: boolean;
  encryptionReady: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ConfereStats {
  accounts: number;
  withCertificate: number;
  readsMonth: number;
  paidReadsMonth: number;
  revenueMonthCents: number;
  pendingOrders: number;
  documents: number;
}

export interface AdminOrder {
  id: string;
  marketId: string;
  marketName: string;
  planName: string | null;
  reads: number;
  amountCents: number;
  method: string;
  status: string;
  txid: string;
  createdAt: string;
  paidAt: string | null;
  confirmedBy: string | null;
}

export interface AdminAccount {
  marketId: string;
  marketName: string;
  cnpj: string | null;
  balance: number;
  trialGranted: boolean;
  hasCertificate: boolean;
  termsAcceptedAt: string | null;
  reads30d: number;
  documents: number;
}
