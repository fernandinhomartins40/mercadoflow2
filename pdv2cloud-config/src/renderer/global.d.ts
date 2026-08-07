export {};

export interface FolderCandidate {
  path: string;
  xmlCount: number;
  zipCount: number;
  validatedSamples: number;
  invalidSamples: number;
  newestModified: string | null;
  score: number;
  recommended: boolean;
}

export interface ScanResult {
  candidates: FolderCandidate[];
  scannedDirs: number;
  elapsedSeconds: number;
  truncated: boolean;
  recommended: string[];
  engine: 'python' | 'node';
}

export interface PairingStart {
  userCode: string;
  pairingUrl: string;
  qrCode: string | null;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface PairingClaim {
  status: 'PENDING' | 'APPROVED' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';
  apiKey?: string;
  marketId?: string;
  marketName?: string;
  pdvId?: string;
  pdvName?: string;
}

declare global {
  interface Window {
    pdv2cloud: {
      startService: () => Promise<any>;
      stopService: () => Promise<any>;
      restartService: () => Promise<any>;
      serviceStatus: () => Promise<any>;
      installService: () => Promise<any>;
      pickFolder: () => Promise<string | null>;
      loadConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      readLogs: () => Promise<any>;
      exportLogs: () => Promise<any>;
      loadStatus: () => Promise<any>;
      scanXmlFolders: (options?: { timeoutSeconds?: number }) => Promise<ScanResult>;
      startPairing: () => Promise<PairingStart>;
      claimPairing: () => Promise<PairingClaim>;
      cancelPairing: () => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
    };
    electron: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}
