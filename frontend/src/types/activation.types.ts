export type ActivationStepKey = 'CONNECT_AGENT' | 'FIRST_INVOICE' | 'FIRST_ANALYSIS';

export interface ActivationStep {
  key: ActivationStepKey;
  done: boolean;
  doneAt: string | null;
}

export interface ActivationStatus {
  complete: boolean;
  steps: ActivationStep[];
  agent: { pairedPdvs: number; lastHeartbeatAt: string | null; online: boolean };
  invoices: { received: number; salesDays: number; targetDays: number; rejectedLast7Days: number };
  nextAnalysisAt: string | null;
}
