// Roda o Capacitor para um dos apps: `node scripts/cap.mjs gestao sync android`.
// O nome do app vai em MF_APP, que o capacitor.config.ts lê (sem ele, Bipaê).
import { spawnSync } from 'node:child_process';

const [app, ...args] = process.argv.slice(2);
if (!['gestao', 'bipae'].includes(app) || args.length === 0) {
  console.error('Uso: node scripts/cap.mjs <gestao|bipae> <comando do cap...>');
  process.exit(1);
}
const result = spawnSync('npx', ['cap', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, MF_APP: app },
});
process.exit(result.status ?? 1);
