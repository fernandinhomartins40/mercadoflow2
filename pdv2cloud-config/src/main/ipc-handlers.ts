import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { startService, stopService, restartService, serviceStatus, installService } from './service-manager';
import logger from './logger';

const CONFIG_PATH = 'C:/ProgramData/PDV2Cloud/config.json';
const LOG_PATH = 'C:/ProgramData/PDV2Cloud/logs/agent.log';
const STATUS_PATH = 'C:/ProgramData/PDV2Cloud/status.json';
const DEFAULT_API_URL = 'https://mercadoflow.com';
const VERSION_FILE = 'version.txt';

type ApiTestKeyPayload = string | { apiKey?: string; apiUrl?: string };

function normalizeApiUrl(value?: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return DEFAULT_API_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

function readConfigOrDefault() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { api_url: DEFAULT_API_URL };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return { api_url: DEFAULT_API_URL };
  }
}

function getConfiguredApiUrl(): string {
  const config = readConfigOrDefault();
  return normalizeApiUrl(config?.api_url);
}

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
  ipcMain.handle('api:testKey', async (event, payload: ApiTestKeyPayload) => {
    try {
      const apiKey = (typeof payload === 'string' ? payload : payload?.apiKey || '').trim();
      const providedApiUrl = typeof payload === 'string' ? '' : payload?.apiUrl;
      const apiUrl = normalizeApiUrl(providedApiUrl || getConfiguredApiUrl());
      if (!apiKey) {
        throw new Error('API key is empty');
      }

      const response = await fetch(`${apiUrl}/api/v1/agent/me`, {
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
      const apiUrl = getConfiguredApiUrl();
      const response = await fetch(`${apiUrl}/api/v1/downloads/agent-installer/version`);
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
      const apiUrl = getConfiguredApiUrl();
      const tempPath = path.join(require('os').tmpdir(), 'PDV2Cloud-Update.exe');
      const response = await fetch(`${apiUrl}/api/v1/downloads/agent-installer`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      logger.info('Update downloaded, launching installer and quitting app');

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

      // Give the installer a moment to start, then quit the app
      setTimeout(() => {
        require('electron').app.quit();
      }, 500);

      return { success: true, path: tempPath };
    } catch (err) {
      throw new Error(`Failed to install update: ${err}`);
    }
  });

  // Get installed version
  ipcMain.handle('version:get', async () => {
    try {
      for (const base of getCandidateBaseDirs()) {
        const versionFile = path.join(base, VERSION_FILE);
        if (!fs.existsSync(versionFile)) {
          continue;
        }
        const version = fs.readFileSync(versionFile, 'utf-8').trim();
        if (version) {
          return version;
        }
      }
      return 'unknown';
    } catch {
      return 'unknown';
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

  // Service diagnostics
  ipcMain.handle('service:diagnose', async () => {
    try {
      logger.info('IPC: service:diagnose');
      const bases = getCandidateBaseDirs();
      let pythonPath = '';
      let testScript = '';

      for (const base of bases) {
        const p = path.join(base, 'python', 'python.exe');
        const t = path.join(base, 'service', 'test_service_startup.py');
        if (fs.existsSync(p) && fs.existsSync(t)) {
          pythonPath = p;
          testScript = t;
          break;
        }
      }

      if (!pythonPath || !testScript) {
        throw new Error('Diagnostic script not found');
      }

      const result = await new Promise<string>((resolve, reject) => {
        require('child_process').exec(`"${pythonPath}" "${testScript}"`, {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }, (error: any, stdout: any, stderr: any) => {
          if (error) {
            reject(stderr || stdout || error.message);
          } else {
            resolve(stdout);
          }
        });
      });

      logger.info('Service diagnostic completed', { result });
      return result;
    } catch (err) {
      logger.error('IPC service:diagnose failed', err);
      throw err;
    }
  });

  // Check Windows Event Viewer for service errors
  ipcMain.handle('service:checkLogs', async () => {
    try {
      logger.info('IPC: service:checkLogs');
      const bases = getCandidateBaseDirs();
      let pythonPath = '';
      let logScript = '';

      for (const base of bases) {
        const p = path.join(base, 'python', 'python.exe');
        const s = path.join(base, 'service', 'installer', 'check_service_logs.py');
        if (fs.existsSync(p) && fs.existsSync(s)) {
          pythonPath = p;
          logScript = s;
          break;
        }
      }

      if (!pythonPath || !logScript) {
        throw new Error('Log checker script not found');
      }

      const result = await new Promise<string>((resolve, reject) => {
        require('child_process').exec(`"${pythonPath}" "${logScript}"`, {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }, (error: any, stdout: any, stderr: any) => {
          // Don't reject on error - the script may have partial output
          resolve(stdout || stderr || '');
        });
      });

      logger.info('Service log check completed');
      return result;
    } catch (err) {
      logger.error('IPC service:checkLogs failed', err);
      throw err;
    }
  });
};

function getCandidateBaseDirs() {
  const candidates = new Set<string>();

  try {
    const exePath = require('electron').app.getPath('exe') || process.execPath;
    const exeDir = path.dirname(exePath);
    candidates.add(path.resolve(exeDir, '..'));
  } catch {
    // ignore
  }

  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
  if (programFiles) {
    candidates.add(path.join(programFiles, 'PDV2Cloud'));
  }
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) {
    candidates.add(path.join(programFilesX86, 'PDV2Cloud'));
  }

  candidates.add('C:\\Program Files\\PDV2Cloud');
  candidates.add('C:\\Program Files (x86)\\PDV2Cloud');

  return Array.from(candidates).filter(Boolean);
}
