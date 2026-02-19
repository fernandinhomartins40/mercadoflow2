import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { startService, stopService, restartService, serviceStatus, installService } from './service-manager';
import logger from './logger';

const CONFIG_PATH = 'C:/ProgramData/PDV2Cloud/config.json';
const LOG_PATH = 'C:/ProgramData/PDV2Cloud/logs/agent.log';
const STATUS_PATH = 'C:/ProgramData/PDV2Cloud/status.json';
const DEFAULT_API_URL = 'https://mercadoflow.com';

export const registerIpcHandlers = () => {
  ipcMain.handle('service:start', async () => {
    try {
      logger.info('IPC: service:start');
      return await startService();
    } catch (err) {
      logger.error('IPC service:start failed', err);
      throw err;
    }
  });

  ipcMain.handle('service:stop', async () => {
    try {
      logger.info('IPC: service:stop');
      return await stopService();
    } catch (err) {
      logger.error('IPC service:stop failed', err);
      throw err;
    }
  });

  ipcMain.handle('service:restart', async () => {
    try {
      logger.info('IPC: service:restart');
      return await restartService();
    } catch (err) {
      logger.error('IPC service:restart failed', err);
      throw err;
    }
  });

  ipcMain.handle('service:status', async () => {
    try {
      return await serviceStatus();
    } catch (err) {
      // Don't log this as error since it's called frequently
      throw err;
    }
  });

  ipcMain.handle('service:install', async () => {
    try {
      logger.info('IPC: service:install');
      return await installService();
    } catch (err) {
      logger.error('IPC service:install failed', err);
      throw err;
    }
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar pasta para monitorar',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    // Prefer forward slashes for consistency with existing configs.
    return result.filePaths[0].replace(/\\/g, '/');
  });

  ipcMain.handle('config:load', async () => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (!config.api_key && config.api_token) {
      config.api_key = config.api_token;
    }
    if (config.api_key_encrypted && !config.api_key) {
      config.api_key = '';
    }
    if (config.api_token_encrypted && !config.api_token) {
      config.api_token = '';
    }

    // Normalize defaults (older configs may not have these).
    if (!config.api_url) {
      config.api_url = DEFAULT_API_URL;
    }
    if (!Array.isArray(config.watch_paths)) {
      config.watch_paths = [];
    }
    return config;
  });

  ipcMain.handle('config:save', async (event, config) => {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  });

  ipcMain.handle('logs:read', async () => {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }
    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    return content.split('\n').slice(-100).filter(Boolean);
  });

  ipcMain.handle('logs:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Exportar logs',
      defaultPath: 'pdv2cloud_logs.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) {
      return false;
    }
    const content = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf-8') : '';
    const lines = content.split('\n').filter(Boolean);
    const csv = lines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n');
    fs.writeFileSync(result.filePath, csv, 'utf-8');
    return true;
  });

  ipcMain.handle('status:load', async () => {
    if (!fs.existsSync(STATUS_PATH)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8'));
  });

  // Auto-detect common PDV XML paths
  ipcMain.handle('paths:detect', async () => {
    const commonPaths = [
      'C:/SAT/XML',
      'C:/NFe/Emitidas',
      'C:/NFCe/XML',
      'C:/Emissor/XML',
      'C:/NFe/XML',
      'C:/NFCe/Emitidas',
      'C:/Program Files/SAT/XML',
      'C:/Arquivos de Programas/NFe/XML',
    ];

    const detected: string[] = [];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        detected.push(p.replace(/\\/g, '/'));
      }
    }
    return detected;
  });

  // Test API key validity
  ipcMain.handle('api:testKey', async (event, apiKey: string) => {
    try {
      const response = await fetch(`${DEFAULT_API_URL}/api/v1/agent/me`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      throw new Error(`API key validation failed: ${err}`);
    }
  });

  // Check for updates
  ipcMain.handle('update:check', async () => {
    try {
      const response = await fetch(`${DEFAULT_API_URL}/api/v1/downloads/agent-installer/version`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      throw new Error(`Failed to check for updates: ${err}`);
    }
  });

  // Download and install update
  ipcMain.handle('update:install', async () => {
    try {
      const tempPath = path.join(require('os').tmpdir(), 'PDV2Cloud-Update.exe');
      const response = await fetch(`${DEFAULT_API_URL}/api/v1/downloads/agent-installer`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      // Launch installer
      require('child_process').spawn(tempPath, [
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        '/CLOSEAPPLICATIONS',
        '/RESTARTAPPLICATIONS'
      ], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      return { success: true, path: tempPath };
    } catch (err) {
      throw new Error(`Failed to install update: ${err}`);
    }
  });

  // Desktop app logs
  ipcMain.handle('desktop-logs:read', async () => {
    return logger.getLogContent(200);
  });

  ipcMain.handle('desktop-logs:path', async () => {
    return logger.getLogPath();
  });

  // Dialog handlers
  ipcMain.handle('dialog:selectFolder', async () => {
    try {
      logger.info('IPC: dialog:selectFolder');
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (err) {
      logger.error('IPC dialog:selectFolder failed', err);
      throw err;
    }
  });
};
