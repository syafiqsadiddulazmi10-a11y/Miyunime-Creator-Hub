// Build: aplikasi ini tidak punya langkah kompilasi (Node menjalankan TypeScript langsung dan UI berupa berkas statis).
// Skrip ini (1) memeriksa sintaks semua berkas UI, (2) memastikan semua modul server bisa dimuat, lalu
// (3) menyusun paket siap deploy di dist/ (src, public, package.json). Gagal di langkah mana pun = exit code 1.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const fail = message => {
  console.error(`BUILD GAGAL: ${message}`);
  process.exit(1);
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) fail(`Node ${process.versions.node} terlalu lama, butuh 22.18 atau lebih baru`);

// 1. Sintaks berkas UI
const ui = readdirSync(join(root, 'public')).filter(f => f.endsWith('.js'));
for (const file of ui) {
  const r = spawnSync(process.execPath, ['--check', join(root, 'public', file)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`sintaks public/${file}\n${r.stderr}`);
}
console.log(`[1/3] Sintaks UI: ${ui.length} berkas JS valid`);

// 2. Semua modul server dapat dimuat (server-main dan seed sengaja dilewati karena langsung menjalankan sesuatu)
const modules = readdirSync(join(root, 'src')).filter(f => f.endsWith('.ts') && !['server-main.ts', 'seed.ts'].includes(f));
for (const file of modules) {
  try {
    await import(pathToFileURL(join(root, 'src', file)).href);
  } catch (error) {
    fail(`modul src/${file}: ${error.message}`);
  }
}
console.log(`[2/3] Modul server: ${modules.length} modul termuat tanpa galat`);

// 3. Paket deploy
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of ['src', 'public', 'package.json']) cpSync(join(root, item), join(dist, item), { recursive: true });
for (const item of ['HowToRun.md']) if (existsSync(join(root, item))) cpSync(join(root, item), join(dist, item));
writeFileSync(join(dist, 'BUILD-INFO.json'), JSON.stringify({ BuiltAt: new Date().toISOString(), Node: process.versions.node }, null, 2) + '\n');
console.log('[3/3] Paket deploy: dist/ siap (jalankan: cd dist && npm run seed && npm start)');
