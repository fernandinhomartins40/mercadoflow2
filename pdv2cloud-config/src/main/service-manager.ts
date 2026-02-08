import { exec } from 'child_process';

const SERVICE_NAME = 'PDV2CloudAgent';

const looksLikeNotInstalled = (message: string) => {
  const msg = (message || '').toString();
  return (
    msg.includes('1060') ||
    msg.includes('2185') ||
    msg.toLowerCase().includes('does not exist') ||
    msg.toLowerCase().includes('openscmanager failed') ||
    msg.toLowerCase().includes('openservice failed') ||
    msg.toLowerCase().includes('nao existe') ||
    msg.toLowerCase().includes('não existe') ||
    msg.toLowerCase().includes('nome de servi') // "O nome de serviço é inválido"
  );
};

const mapServiceError = (err: unknown) => {
  const msg = String(err || '');
  if (looksLikeNotInstalled(msg)) {
    return new Error('SERVICE_NOT_INSTALLED');
  }
  return err;
};

export const startService = async () => {
  try {
    await serviceStatus();
  } catch (err) {
    throw mapServiceError(err);
  }
  try {
    return await execPromise(`net start ${SERVICE_NAME}`);
  } catch (err) {
    throw mapServiceError(err);
  }
};

export const stopService = async () => {
  try {
    await serviceStatus();
  } catch (err) {
    throw mapServiceError(err);
  }
  try {
    return await execPromise(`net stop ${SERVICE_NAME}`);
  } catch (err) {
    throw mapServiceError(err);
  }
};

export const restartService = async () => {
  await stopService();
  return startService();
};

export const serviceStatus = async () => {
  try {
    const result = await execPromise(`sc query ${SERVICE_NAME}`);
    return result;
  } catch (error) {
    const errorMsg = String(error);
    if (looksLikeNotInstalled(errorMsg)) {
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
