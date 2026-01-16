import { exec } from 'child_process';

export const startService = () => execPromise('net start PDV2CloudAgent');
export const stopService = () => execPromise('net stop PDV2CloudAgent');
export const restartService = async () => {
  await stopService();
  return startService();
};

export const serviceStatus = () => execPromise('sc query PDV2CloudAgent');

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
