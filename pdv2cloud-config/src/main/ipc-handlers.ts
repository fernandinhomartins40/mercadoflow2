import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import { startService, stopService, restartService, serviceStatus, installService } from './service-manager';

const CONFIG_PATH = 'C:/ProgramData/PDV2Cloud/config.json';
const LOG_PATH = 'C:/ProgramData/PDV2Cloud/logs/agent.log';
const STATUS_PATH = 'C:/ProgramData/PDV2Cloud/status.json';
const DEFAULT_API_URL = 'https://mercadoflow.com';

export const registerIpcHandlers = () => {
  ipcMain.handle('service:start', async () => startService());
  ipcMain.handle('service:stop', async () => stopService());
  ipcMain.handle('service:restart', async () => restartService());
  ipcMain.handle('service:status', async () => serviceStatus());
  ipcMain.handle('service:install', async () => installService());

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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
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
};
