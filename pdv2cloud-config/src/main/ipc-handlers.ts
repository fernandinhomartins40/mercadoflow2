import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import { startService, stopService, restartService, serviceStatus } from './service-manager';

const CONFIG_PATH = 'C:/ProgramData/PDV2Cloud/config.json';
const LOG_PATH = 'C:/ProgramData/PDV2Cloud/logs/agent.log';
const STATUS_PATH = 'C:/ProgramData/PDV2Cloud/status.json';

export const registerIpcHandlers = () => {
  ipcMain.handle('service:start', async () => startService());
  ipcMain.handle('service:stop', async () => stopService());
  ipcMain.handle('service:restart', async () => restartService());
  ipcMain.handle('service:status', async () => serviceStatus());

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
