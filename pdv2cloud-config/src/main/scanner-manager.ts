import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import logger from './logger';

/**
 * Varredura automática de pastas com XML fiscal.
 *
 * Caminho preferencial: delegar ao `service/xml_scanner.py`, que roda sobre o
 * Python empacotado do agente e é a mesma implementação usada pelo serviço.
 * Quando o Python ainda não está disponível — tipicamente no primeiro
 * onboarding, antes da instalação do serviço — usa-se o scanner equivalente em
 * Node abaixo, para que o usuário nunca precise escolher pastas na mão.
 */

export interface FolderCandidate {
  path: string;
  xmlCount: number;
  zipCount: number;
  validatedSamples: number;
  invalidSamples: number;
  newestModified: string | null;
  score: number;
  recommended: boolean;
}

export interface ScanResult {
  candidates: FolderCandidate[];
  scannedDirs: number;
  elapsedSeconds: number;
  truncated: boolean;
  recommended: string[];
  engine: 'python' | 'node';
}

const DEFAULT_INSTALL_DIRNAME = 'PDV2Cloud';

const SKIP_DIR_NAMES = new Set([
  '$recycle.bin', 'system volume information', 'windows', 'winnt',
  'node_modules', '.git', '.svn', '__pycache__', 'temp', 'tmp', 'cache',
  'appdata', 'microsoft', 'microsoft office', 'windowsapps', 'drivers',
  'driverstore', 'assembly', 'installer', 'servicing', 'winsxs',
  'program files', 'program files (x86)', 'arquivos de programas',
  'recovery', 'perflogs', 'msocache', 'onedrive', 'onedrivetemp',
  'dropbox', 'google drive', 'steam', 'steamapps',
]);

const POSITIVE_NAME_HINTS = [
  'nfe', 'nfce', 'nf-e', 'nf-ce', 'sat', 'cfe', 'xml', 'xmls', 'fiscal',
  'notas', 'nota', 'emitidas', 'autorizadas', 'vendas', 'cupom', 'cupons',
  'danfe', 'retorno', 'pdv', 'ecf',
];

const KNOWN_PDV_PATHS = [
  'C:/SAT/XML', 'C:/SAT', 'C:/NFe/Emitidas', 'C:/NFe/XML', 'C:/NFe',
  'C:/NFCe/XML', 'C:/NFCe/Emitidas', 'C:/NFCe', 'C:/Emissor/XML',
  'C:/PDV/XMLs', 'C:/PDV/XML', 'C:/PDV', 'C:/XML', 'C:/XMLS',
  'C:/Fiscal/XML', 'C:/Notas', 'C:/NotasFiscais',
  'C:/Program Files/SAT/XML', 'C:/Program Files (x86)/SAT/XML',
  'C:/Arquivos de Programas/NFe/XML',
  'C:/ProgramData/NFe', 'C:/ProgramData/NFCe',
];

const FISCAL_MARKERS = ['<infNFe', '<infNFCe', '<nfeProc', '<NFe', '<CFe', '<infCFe'];
const CHAVE_RE = /[0-9]{44}/;

// ── Caminho preferencial: scanner Python do agente ────────────────────────────

const getCandidateBaseDirs = (): string[] => {
  const candidates = new Set<string>();
  try {
    const exePath = app.getPath('exe') || process.execPath;
    candidates.add(path.resolve(path.dirname(exePath), '..'));
  } catch {
    // ignore
  }
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
  if (programFiles) candidates.add(path.join(programFiles, DEFAULT_INSTALL_DIRNAME));
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) candidates.add(path.join(programFilesX86, DEFAULT_INSTALL_DIRNAME));
  candidates.add('C:\\Program Files\\PDV2Cloud');
  candidates.add('C:\\Program Files (x86)\\PDV2Cloud');
  return Array.from(candidates).filter(Boolean);
};

const resolvePythonScanner = () => {
  for (const base of getCandidateBaseDirs()) {
    const pythonPath = path.join(base, 'python', 'python.exe');
    const scannerPath = path.join(base, 'service', 'xml_scanner.py');
    if (fs.existsSync(pythonPath) && fs.existsSync(scannerPath)) {
      return { baseDir: base, pythonPath, scannerPath };
    }
  }
  return null;
};

const runPythonScanner = async (timeoutSeconds: number): Promise<ScanResult | null> => {
  const resolved = resolvePythonScanner();
  if (!resolved) {
    return null;
  }

  try {
    const raw = await new Promise<string>((resolve, reject) => {
      exec(
        `"${resolved.pythonPath}" "${resolved.scannerPath}" --timeout ${timeoutSeconds}`,
        {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          // Margem sobre o orçamento interno do scanner para ele encerrar sozinho.
          timeout: (timeoutSeconds + 20) * 1000,
          cwd: resolved.baseDir,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(String(stderr || stdout || error.message));
            return;
          }
          resolve(String(stdout || '').trim());
        },
      );
    });

    const parsed = JSON.parse(raw);
    return { ...parsed, engine: 'python' as const };
  } catch (err) {
    logger.warn('Scanner Python falhou, usando fallback em Node', err);
    return null;
  }
};

// ── Fallback em Node ─────────────────────────────────────────────────────────

const looksLikeFiscalXml = (filePath: string): boolean => {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    if (bytesRead <= 0) return false;
    const head = buffer.subarray(0, bytesRead).toString('latin1');
    if (FISCAL_MARKERS.some((marker) => head.includes(marker))) {
      return true;
    }
    return head.includes('<') && CHAVE_RE.test(head);
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
};

const nameHintBonus = (dirPath: string): number => {
  const tail = dirPath.toLowerCase().split(/[\\/]/).slice(-3).join(' ');
  return POSITIVE_NAME_HINTS.reduce((sum, hint) => (tail.includes(hint) ? sum + 3 : sum), 0);
};

const inspectDirectory = (
  dirPath: string,
  entries: fs.Dirent[],
  sampleSize: number,
): FolderCandidate | null => {
  const xmlFiles: string[] = [];
  let zipCount = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lowered = entry.name.toLowerCase();
    if (lowered.endsWith('.xml')) xmlFiles.push(entry.name);
    else if (lowered.endsWith('.zip')) zipCount += 1;
  }

  if (xmlFiles.length === 0 && zipCount === 0) {
    return null;
  }

  const candidate: FolderCandidate = {
    path: dirPath.replace(/\\/g, '/'),
    xmlCount: xmlFiles.length,
    zipCount,
    validatedSamples: 0,
    invalidSamples: 0,
    newestModified: null,
    score: 0,
    recommended: false,
  };

  let newestMtime = 0;
  const sample = xmlFiles.slice(-sampleSize);
  for (const filename of sample) {
    const filePath = path.join(dirPath, filename);
    if (looksLikeFiscalXml(filePath)) {
      candidate.validatedSamples += 1;
      try {
        newestMtime = Math.max(newestMtime, fs.statSync(filePath).mtimeMs);
      } catch {
        // ignore
      }
    } else {
      candidate.invalidSamples += 1;
    }
  }

  if (candidate.validatedSamples === 0 && zipCount === 0) {
    return null;
  }

  if (newestMtime > 0) {
    candidate.newestModified = new Date(newestMtime).toISOString();
    (candidate as any).__mtime = newestMtime;
  }

  return candidate;
};

const scoreCandidate = (candidate: FolderCandidate): number => {
  let score = 0;
  score += Math.min(Math.log10(candidate.xmlCount + 1) * 12, 40);
  score += candidate.validatedSamples * 6;
  score -= candidate.invalidSamples * 2;
  score += Math.min(candidate.zipCount, 10) * 0.5;
  score += nameHintBonus(candidate.path);

  const mtime = (candidate as any).__mtime as number | undefined;
  if (mtime) {
    const ageDays = Math.max((Date.now() - mtime) / 86400000, 0);
    if (ageDays <= 2) score += 25;
    else if (ageDays <= 15) score += 15;
    else if (ageDays <= 90) score += 6;
    else if (ageDays > 730) score -= 10;
  }

  return Math.round(score * 100) / 100;
};

const fixedDrives = (): string[] => {
  const drives: string[] = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) drives.push(root);
    } catch {
      // ignore
    }
  }
  return drives.length > 0 ? drives : ['C:\\'];
};

const runNodeScanner = async (
  timeoutSeconds: number,
  maxDepth = 6,
  sampleSize = 3,
): Promise<ScanResult> => {
  const started = Date.now();
  const deadline = started + timeoutSeconds * 1000;
  const maxDirs = 60000;

  const found = new Map<string, FolderCandidate>();
  let scannedDirs = 0;
  let truncated = false;

  const inspectPath = (dirPath: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return null;
    }
    scannedDirs += 1;
    const key = dirPath.replace(/\\/g, '/').toLowerCase();
    if (!found.has(key)) {
      const candidate = inspectDirectory(dirPath, entries, sampleSize);
      if (candidate) found.set(key, candidate);
    }
    return entries;
  };

  // Fase 1: caminhos conhecidos.
  for (const known of KNOWN_PDV_PATHS) {
    if (fs.existsSync(known)) inspectPath(known);
  }

  // Fase 2: varredura em largura com orçamento de tempo.
  const queue: Array<{ dir: string; depth: number }> = fixedDrives().map((d) => ({ dir: d, depth: 0 }));

  while (queue.length > 0) {
    if (Date.now() > deadline || scannedDirs >= maxDirs) {
      truncated = true;
      break;
    }
    const { dir, depth } = queue.shift()!;
    const entries = inspectPath(dir);
    if (!entries || depth >= maxDepth) continue;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name.toLowerCase();
      if (SKIP_DIR_NAMES.has(name) || name.startsWith('$')) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  let candidates = Array.from(found.values());
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate);
  }
  candidates = candidates
    .filter((c) => c.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);

  for (const candidate of candidates) {
    candidate.recommended = candidate.score >= 25 && candidate.validatedSamples > 0;
    delete (candidate as any).__mtime;
  }
  if (candidates.length > 0 && !candidates.some((c) => c.recommended)) {
    candidates[0].recommended = true;
  }

  return {
    candidates,
    scannedDirs,
    elapsedSeconds: Math.round(((Date.now() - started) / 1000) * 100) / 100,
    truncated,
    recommended: candidates.filter((c) => c.recommended).map((c) => c.path),
    engine: 'node',
  };
};

export const scanForXmlFolders = async (timeoutSeconds = 45): Promise<ScanResult> => {
  const pythonResult = await runPythonScanner(timeoutSeconds);
  if (pythonResult) {
    logger.info('Varredura concluída (Python)', {
      candidates: pythonResult.candidates.length,
      scannedDirs: pythonResult.scannedDirs,
    });
    return pythonResult;
  }

  const nodeResult = await runNodeScanner(timeoutSeconds);
  logger.info('Varredura concluída (Node)', {
    candidates: nodeResult.candidates.length,
    scannedDirs: nodeResult.scannedDirs,
  });
  return nodeResult;
};
