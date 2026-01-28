export {};

declare global {
  interface Window {
    pdv2cloud: {
      startService: () => Promise<any>;
      stopService: () => Promise<any>;
      restartService: () => Promise<any>;
      serviceStatus: () => Promise<any>;
      installService: () => Promise<any>;
      loadConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      readLogs: () => Promise<any>;
      exportLogs: () => Promise<any>;
      loadStatus: () => Promise<any>;
    };
  }
}
