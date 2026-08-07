const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdv2cloud', {
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  restartService: () => ipcRenderer.invoke('service:restart'),
  serviceStatus: () => ipcRenderer.invoke('service:status'),
  installService: () => ipcRenderer.invoke('service:install'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  readLogs: () => ipcRenderer.invoke('logs:read'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  loadStatus: () => ipcRenderer.invoke('status:load'),
  scanXmlFolders: (options) => ipcRenderer.invoke('paths:scan', options),
  startPairing: () => ipcRenderer.invoke('pairing:start'),
  claimPairing: () => ipcRenderer.invoke('pairing:claim'),
  cancelPairing: () => ipcRenderer.invoke('pairing:cancel'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
