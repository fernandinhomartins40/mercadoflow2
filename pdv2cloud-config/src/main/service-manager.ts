import { exec } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const SERVICE_NAME = 'PDV2CloudAgent';
const DEFAULT_INSTALL_DIRNAME = 'PDV2Cloud';

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

export const installService = async () => {
  const resolved = resolveInstallerPaths();
  if (!resolved) {
    throw new Error(
      [
        'SERVICE_INSTALLER_NOT_FOUND',
        'Nao foi possivel localizar os arquivos do agente (python embutido e instalador do servico).',
        'Instale/reinstale o "PDV2Cloud Collector Agent" (PDV2Cloud-Setup.exe) ou execute a Config UI dentro da pasta do PDV2Cloud.',
        '',
        'Caminhos verificados:',
        ...getCandidateBaseDirs().map((d) => `- ${d}`),
      ].join('\n')
    );
  }

  await ensureEmbeddedPythonReady(resolved.baseDir, resolved.pythonPath);
  return execPromise(`"${resolved.pythonPath}" "${resolved.installerPath}" install`);
};

const getCandidateBaseDirs = () => {
  const candidates = new Set<string>();

  // If this UI is launched from the full installer, it's usually under:
  //   <base>\\config-ui\\PDV2Cloud Config.exe
  try {
    const exePath = app.getPath('exe') || process.execPath;
    const exeDir = path.dirname(exePath);
    candidates.add(path.resolve(exeDir, '..'));
  } catch {
    // ignore
  }

  // Common defaults.
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
  if (programFiles) {
    candidates.add(path.join(programFiles, DEFAULT_INSTALL_DIRNAME));
  }
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) {
    candidates.add(path.join(programFilesX86, DEFAULT_INSTALL_DIRNAME));
  }

  // Last-resort hardcoded fallbacks (in case env vars are missing).
  candidates.add('C:\\Program Files\\PDV2Cloud');
  candidates.add('C:\\Program Files (x86)\\PDV2Cloud');

  return Array.from(candidates).filter(Boolean);
};

const resolveInstallerPaths = () => {
  const bases = getCandidateBaseDirs();
  for (const base of bases) {
    const pythonPath = path.join(base, 'python', 'python.exe');
    const installerPath = path.join(base, 'service', 'installer', 'service_installer.py');
    if (fs.existsSync(pythonPath) && fs.existsSync(installerPath)) {
      return { baseDir: base, pythonPath, installerPath };
    }
  }
  return null;
};

const ensureEmbeddedPythonReady = async (baseDir: string, pythonPath: string) => {
  const pythonDir = path.join(baseDir, 'python');
  ensurePythonPth(pythonDir);
  await ensurePipInstalled(pythonPath, pythonDir);
  await ensureRequirementsInstalled(pythonPath, baseDir);
};

const ensurePythonPth = (pythonDir: string) => {
  if (!fs.existsSync(pythonDir)) {
    return;
  }

  // Embedded Python uses pythonXY._pth to define sys.path. If site is disabled,
  // pip-installed packages (e.g. pywin32) won't be importable.
  const pthFile = fs.readdirSync(pythonDir).find((f) => /^python\d+.*\._pth$/i.test(f));
  if (!pthFile) {
    return;
  }

  const pthPath = path.join(pythonDir, pthFile);
  const raw = fs.readFileSync(pthPath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  let changed = false;
  const normalized = lines.map((line) => {
    if (line.trim() === '#import site') {
      changed = true;
      return 'import site';
    }
    return line;
  });

  const servicePathEntry = '..\\service';
  if (!normalized.some((l) => l.trim() === servicePathEntry)) {
    changed = true;
    const dotIndex = normalized.findIndex((l) => l.trim() === '.');
    if (dotIndex >= 0) {
      normalized.splice(dotIndex + 1, 0, servicePathEntry);
    } else {
      normalized.unshift(servicePathEntry);
    }
  }

  if (changed) {
    fs.writeFileSync(pthPath, normalized.join('\r\n'), 'utf-8');
  }
};

const ensurePipInstalled = async (pythonPath: string, pythonDir: string) => {
  try {
    await execPromise(`"${pythonPath}" -m pip --version`);
    return;
  } catch {
    // continue
  }

  const getPip = path.join(pythonDir, 'get-pip.py');
  if (!fs.existsSync(getPip)) {
    throw new Error(
      [
        'GET_PIP_NOT_FOUND',
        'Nao foi possivel encontrar get-pip.py para instalar o pip no Python embutido.',
        `Caminho esperado: ${getPip}`,
      ].join('\n')
    );
  }

  await execPromise(`"${pythonPath}" "${getPip}"`);
};

const ensureRequirementsInstalled = async (pythonPath: string, baseDir: string) => {
  const candidates = [
    path.join(baseDir, 'service', 'service', 'requirements.txt'),
    path.join(baseDir, 'service', 'requirements.txt'),
  ];
  const requirementsPath = candidates.find((p) => fs.existsSync(p));
  if (!requirementsPath) {
    throw new Error(
      [
        'REQUIREMENTS_NOT_FOUND',
        'Nao foi possivel localizar o requirements.txt do agente.',
        'Caminhos verificados:',
        ...candidates.map((p) => `- ${p}`),
      ].join('\n')
    );
  }

  await execPromise(`"${pythonPath}" -m pip install -r "${requirementsPath}"`);
};

const execPromise = (cmd: string) => {
  return new Promise<string>((resolve, reject) => {
    exec(cmd, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const out = String(stdout || '').trim();
      const errOut = String(stderr || '').trim();

      if (error) {
        // Some Windows utilities (e.g. `sc`) write failure details to stdout, so
        // include both stdout and stderr to allow callers to classify errors.
        const msg = [errOut, out, String(error.message || '').trim()].filter(Boolean).join('\n');
        reject(msg || String(error.message || 'Command failed'));
        return;
      }

      resolve(out);
    });
  });
};
