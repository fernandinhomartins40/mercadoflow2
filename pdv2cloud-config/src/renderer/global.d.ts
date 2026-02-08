export {};

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
    };
  }
}
