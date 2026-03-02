import { exec } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import logger from './logger';

const SERVICE_NAME = 'PDV2CloudAgent';
const DEFAULT_INSTALL_DIRNAME = 'PDV2Cloud';
const SERVICE_SDDL = [
  'D:',
  '(A;;CCLCSWRPWPDTLOCRRC;;;SY)',
  '(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)',
  '(A;;CCLCSWRPWPDTLOCRRC;;;IU)',
  '(A;;CCLCSWLOCRRC;;;SU)',
].join('');

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

const looksLikeCouldNotStart = (message: string) => {
  const msg = (message || '').toString().toLowerCase();
  return (
    msg.includes('1053') ||
    msg.includes('couldnotstartservice') ||
    msg.includes('could not start service') ||
    msg.includes('cannot start service') ||
    msg.includes('nao pode ser iniciado') ||
    msg.includes('nÃ£o pode ser iniciado') ||
    msg.includes('nao respondeu') ||
    msg.includes('nÃ£o respondeu') ||
    msg.includes('timely fashion')
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
    // Use PowerShell with Start-Service which respects the service SDDL permissions
    return await execPromise(`powershell -Command "Start-Service -Name ${SERVICE_NAME}"`);
  } catch (err) {
    const mapped = mapServiceError(err);
    const mappedMsg = String(mapped || '');
    if (!looksLikeCouldNotStart(mappedMsg)) {
      throw mapped;
    }

    logger.warn('Service start failed, attempting self-heal reinstall', { error: mappedMsg });

    let selfHealError = '';
    let selfHealOutput = '';
    try {
      const installOutput = await installService();
      selfHealOutput = String(installOutput || '');
      // Retry start once after forced reinstall.
      return await execPromise(`powershell -Command "Start-Service -Name ${SERVICE_NAME}"`);
    } catch (healErr) {
      selfHealError = String(healErr || '');
      logger.error('Service self-heal failed', healErr);
    }

    const diagnostics = await collectServiceDiagnostics();
    throw new Error(
      [
        mappedMsg,
        '',
        'AUTO_REPAIR_FAILED',
        selfHealError || 'Unknown self-heal error',
        '',
        'AUTO_REPAIR_OUTPUT',
        selfHealOutput || '(empty)',
        '',
        diagnostics,
      ].join('\n')
    );
  }
};

export const stopService = async () => {
  try {
    await serviceStatus();
  } catch (err) {
    throw mapServiceError(err);
  }
  try {
    // Use PowerShell with Stop-Service which respects the service SDDL permissions
    return await execPromise(`powershell -Command "Stop-Service -Name ${SERVICE_NAME}"`);
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
  logger.info('Starting service installation...');

  const resolved = resolveInstallerPaths();
  if (!resolved) {
    const candidates = getCandidateBaseDirs();
    logger.error('Service installer not found', { candidatePaths: candidates });

    throw new Error(
      [
        'SERVICE_INSTALLER_NOT_FOUND',
        'Nao foi possivel localizar os arquivos do agente (python embutido e instalador do servico).',
        'Instale/reinstale o "PDV2Cloud Collector Agent" (PDV2Cloud-Setup.exe) ou execute a Config UI dentro da pasta do PDV2Cloud.',
        '',
        'Caminhos verificados:',
        ...candidates.map((d) => `- ${d}`),
      ].join('\n')
    );
  }

  logger.info('Installer paths resolved', resolved);

  try {
    await ensureEmbeddedPythonReady(resolved.baseDir, resolved.pythonPath);
    logger.info('Python environment ready');

    // CRITICAL: Fix pywin32 DLL locations before installing service
    await fixPywin32Installation(resolved.baseDir, resolved.pythonPath);
    logger.info('pywin32 configured successfully');

    const result = await installOrRepairService(resolved.baseDir, resolved.pythonPath, resolved.installerPath);
    logger.info('Service installed successfully', { result });
    return result;
  } catch (err) {
    logger.error('Failed to install service', err);
    throw err;
  }
};

export const testConfiguredConnection = async () => {
  const resolved = resolveInstallerPaths();
  if (!resolved) {
    throw new Error('SERVICE_INSTALLER_NOT_FOUND');
  }

  await ensureEmbeddedPythonReady(resolved.baseDir, resolved.pythonPath);
  await fixPywin32Installation(resolved.baseDir, resolved.pythonPath);

  const tmpPath = path.join(app.getPath('temp'), `pdv2cloud-connection-test-${process.pid}-${Date.now()}.py`);
  fs.writeFileSync(tmpPath, buildConnectionTestScript(resolved.baseDir), 'utf-8');

  try {
    const raw = await execPromise(`"${resolved.pythonPath}" "${tmpPath}"`);
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    throw new Error(`CONNECTION_TEST_FAILED\n${String(err || '')}`);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
};

const installOrRepairService = async (baseDir: string, pythonPath: string, installerPath: string) => {
  // Prefer a runtime bootstrap script so we can repair legacy installs that still
  // contain an outdated service_installer.py.
  try {
    return await runServiceBootstrap(baseDir, pythonPath);
  } catch (err) {
    logger.warn('Runtime service bootstrap failed, falling back to packaged installer', err);
    return await execPromise(`"${pythonPath}" "${installerPath}" install`);
  }
};

const runServiceBootstrap = async (baseDir: string, pythonPath: string) => {
  const tmpPath = path.join(app.getPath('temp'), `pdv2cloud-service-bootstrap-${process.pid}-${Date.now()}.py`);
  const script = buildServiceBootstrapScript(baseDir);

  fs.writeFileSync(tmpPath, script, 'utf-8');
  try {
    return await execPromise(`"${pythonPath}" "${tmpPath}"`);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
};

const buildServiceBootstrapScript = (baseDir: string) => {
  return [
    'import sys',
    'from pathlib import Path',
    'import subprocess',
    'import win32serviceutil',
    'import win32service',
    '',
    `SERVICE_NAME = ${JSON.stringify(SERVICE_NAME)}`,
    `SERVICE_SDDL = ${JSON.stringify(SERVICE_SDDL)}`,
    'SERVICE_CLASS = "service.windows_service.PDV2CloudService"',
    `BASE_DIR = Path(${JSON.stringify(baseDir)})`,
    '',
    'def _run(cmd):',
    '    try:',
    '        subprocess.run(cmd, check=True, capture_output=True, text=True)',
    '    except Exception as exc:',
    '        print(f"WARNING: command failed: {cmd} | {exc}")',
    '',
    'def _service_exists():',
    '    try:',
    '        win32serviceutil.QueryServiceStatus(SERVICE_NAME)',
    '        return True',
    '    except Exception:',
    '        return False',
    '',
    'sys.path.insert(0, str(BASE_DIR))',
    'sys.path.insert(0, str(BASE_DIR / "service"))',
    '__import__("service.windows_service")',
    '',
    'if _service_exists():',
    '    try:',
    '        status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)',
    '        if status and status[1] != win32service.SERVICE_STOPPED:',
    '            try:',
    '                win32serviceutil.StopService(SERVICE_NAME)',
    '            except Exception:',
    '                pass',
    '    except Exception:',
    '        pass',
    '    try:',
    '        win32serviceutil.RemoveService(SERVICE_NAME)',
    '    except Exception as exc:',
    '        print(f"WARNING: remove failed: {exc}")',
    '',
    'exe_name = str(sys.executable)',
    'try:',
    '    located = win32serviceutil.LocatePythonServiceExe()',
    '    if located:',
    '        exe_name = str(located)',
    'except Exception:',
    '    root_pythonservice = Path(sys.prefix) / "pythonservice.exe"',
    '    scripts_pythonservice = Path(sys.prefix) / "Scripts" / "pythonservice.exe"',
    '    if root_pythonservice.exists():',
    '        exe_name = str(root_pythonservice)',
    '    elif scripts_pythonservice.exists():',
    '        exe_name = str(scripts_pythonservice)',
    '',
    'win32serviceutil.InstallService(',
    '    pythonClassString=SERVICE_CLASS,',
    '    serviceName=SERVICE_NAME,',
    '    displayName="PDV2Cloud Collector Agent",',
    '    description="Coleta e transmite dados de vendas para PDV2Cloud",',
    '    exeName=exe_name,',
    '    startType=win32service.SERVICE_AUTO_START,',
    ')',
    '',
    '_run(["sc", "config", SERVICE_NAME, "start=", "auto"])',
    '_run(["sc", "sdset", SERVICE_NAME, SERVICE_SDDL])',
    'print("SERVICE_REINSTALLED_OK")',
    '',
  ].join('\n');
};

const buildConnectionTestScript = (baseDir: string) => {
  return [
    'import json',
    'import sys',
    'from pathlib import Path',
    '',
    `BASE_DIR = Path(${JSON.stringify(baseDir)})`,
    'sys.path.insert(0, str(BASE_DIR))',
    'sys.path.insert(0, str(BASE_DIR / "service"))',
    '',
    'result = {"success": False, "online": False}',
    'try:',
    '    from service.crypto import SecureConfig',
    '    from service.config import load_config_secure',
    '    from service.transmitter import APITransmitter',
    '',
    '    config = load_config_secure(SecureConfig())',
    '    api_url = str(config.get("api_url") or "").rstrip("/")',
    '    api_key = str(config.get("api_key") or "").strip()',
    '    watch_paths = config.get("watch_paths") or []',
    '',
    '    if not api_url or not api_key:',
    '        result = {',
    '            "success": False,',
    '            "online": False,',
    '            "title": "Configuração incompleta",',
    '            "message": "Configure a chave de acesso antes de testar a conexão.",',
    '            "watchPaths": len(watch_paths),',
    '        }',
    '    else:',
    '        transmitter = APITransmitter(api_url, api_key, config.get("market_id", ""))',
    '        profile = transmitter.get_agent_profile()',
    '        heartbeat_ok = transmitter.send_heartbeat()',
    '        result = {',
    '            "success": True,',
    '            "online": True,',
    '            "heartbeatOk": bool(heartbeat_ok),',
    '            "apiUrl": api_url,',
    '            "marketId": profile.get("marketId") or config.get("market_id") or "",',
    '            "marketName": profile.get("marketName") or "",',
    '            "watchPaths": len(watch_paths),',
    '        }',
    'except Exception as exc:',
    '    result = {',
    '        "success": False,',
    '        "online": False,',
    '        "title": "Falha na conexão",',
    '        "message": str(exc),',
    '    }',
    '',
    'print(json.dumps(result, ensure_ascii=False))',
    '',
  ].join('\n');
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

  const requiredEntries = ['..', '..\\service'];
  for (const entry of requiredEntries) {
    if (normalized.some((l) => l.trim() === entry)) {
      continue;
    }
    changed = true;
    const dotIndex = normalized.findIndex((l) => l.trim() === '.');
    if (dotIndex >= 0) {
      normalized.splice(dotIndex + 1, 0, entry);
    } else {
      normalized.unshift(entry);
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

const fixPywin32Installation = async (baseDir: string, pythonPath: string) => {
  const fixScript = path.join(baseDir, 'service', 'installer', 'fix_pywin32.py');
  if (!fs.existsSync(fixScript)) {
    logger.warn('pywin32 fix script not found, skipping');
    return;
  }

  logger.info('Running pywin32 post-installation fix...');
  try {
    const result = await execPromise(`"${pythonPath}" "${fixScript}"`);
    logger.info('pywin32 fix completed', { result });
  } catch (err) {
    logger.error('pywin32 fix failed, but continuing', err);
    // Don't throw - this is a best-effort fix
  }
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

  try {
    await execPromise(`"${pythonPath}" -m pip install -r "${requirementsPath}"`);
    return;
  } catch (err) {
    const msg = String(err || '');
    if (looksLikeXmlsecInstallFailure(msg)) {
      await installRequirementsWithoutXmlsec(pythonPath, requirementsPath);
      return;
    }
    throw err;
  }
};

const looksLikeXmlsecInstallFailure = (message: string) => {
  const msg = (message || '').toLowerCase();
  if (!msg.includes('xmlsec')) return false;
  return (
    msg.includes('no matching distribution found for xmlsec') ||
    msg.includes('could not find a version that satisfies the requirement xmlsec') ||
    msg.includes('has inconsistent version') ||
    msg.includes('requested xmlsec') ||
    msg.includes('discarding') ||
    msg.includes('metadata has') ||
    msg.includes('yanked versions')
  );
};

const installRequirementsWithoutXmlsec = async (pythonPath: string, requirementsPath: string) => {
  const raw = fs.readFileSync(requirementsPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const t = (line || '').trim();
    if (!t) return false; // keep file clean for pip
    if (t.startsWith('#')) return false;
    return !t.toLowerCase().startsWith('xmlsec');
  });

  if (filtered.length === 0) {
    throw new Error('REQUIREMENTS_EMPTY_AFTER_FILTER');
  }

  const tmpPath = path.join(app.getPath('temp'), `pdv2cloud-requirements-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, filtered.join('\n') + '\n', 'utf-8');
  try {
    await execPromise(`"${pythonPath}" -m pip install -r "${tmpPath}"`);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
};

const collectServiceDiagnostics = async () => {
  const sections: string[] = [];

  const pushCmdOutput = async (title: string, cmd: string) => {
    try {
      const out = await execPromise(cmd);
      sections.push(`${title}\n${out || '(empty)'}`);
    } catch (err) {
      sections.push(`${title}\nERROR: ${String(err || '')}`);
    }
  };

  await pushCmdOutput('SC_QC', `sc qc ${SERVICE_NAME}`);
  await pushCmdOutput('SC_QUERYEX', `sc queryex ${SERVICE_NAME}`);

  const resolved = resolveInstallerPaths();
  if (resolved) {
    const checker = path.join(resolved.baseDir, 'service', 'installer', 'check_service_logs.py');
    if (fs.existsSync(checker)) {
      await pushCmdOutput(
        'EVENT_LOG',
        `"${resolved.pythonPath}" "${checker}"`
      );
    }
  }

  return ['SERVICE_DIAGNOSTICS', ...sections].join('\n\n');
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
