import { exec } from 'child_process';

export const startService = () => execPromise('net start PDV2CloudAgent');
export const stopService = () => execPromise('net stop PDV2CloudAgent');
export const restartService = async () => {
  await stopService();
  return startService();
};

export const serviceStatus = async () => {
  try {
    const result = await execPromise('sc query PDV2CloudAgent');
    return result;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('1060') || errorMsg.includes('does not exist') || errorMsg.includes('HELPMSG 2185')) {
      throw new Error('SERVICE_NOT_INSTALLED');
    }
    throw error;
  }
};

export const installService = () => {
  const pythonPath = 'C:\\Program Files\\PDV2Cloud\\python\\python.exe';
  const installerPath = 'C:\\Program Files\\PDV2Cloud\\service\\installer\\service_installer.py';
  return execPromise(`"${pythonPath}" "${installerPath}" install`);
};

const execPromise = (cmd: string) => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
        return;
      }
      resolve(stdout);
    });
  });
};
