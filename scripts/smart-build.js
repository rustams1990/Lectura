/**
 * smart-build.js
 * Builds the frontend (Vite) and backend (esbuild) bundles.
 * If running inside a Docker container during an in-app update and pre-built `dist/`
 * for the target version is already extracted on disk, skips the heavy Vite rebuild.
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = `v${String(pkg.version).replace(/^v/i, '')}`;

const distServerPath = join(root, 'dist', 'server.cjs');
const distIndexPath = join(root, 'dist', 'index.html');
const isForce = process.argv.includes('--force');

if (!isForce && existsSync(distServerPath) && existsSync(distIndexPath)) {
  try {
    const serverCode = readFileSync(distServerPath, 'utf8');
    if (serverCode.includes(`"${version}"`) || serverCode.includes(`'${version}'`)) {
      console.log(`[smart-build] Pre-built dist/ for ${version} is already up-to-date. Skipping rebuild.`);
      process.exit(0);
    }
  } catch (_) {}
}

// Clean old hashed bundles in dist/assets before running a fresh Vite build
const distAssets = join(root, 'dist', 'assets');
if (existsSync(distAssets)) {
  try {
    rmSync(distAssets, { recursive: true, force: true });
  } catch (_) {}
}

console.log(`[smart-build] Building frontend and backend bundles for ${version}...`);
execSync(
  'npx vite build && npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs',
  { cwd: root, stdio: 'inherit' }
);
