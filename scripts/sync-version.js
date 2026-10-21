/**
 * sync-version.js
 * Reads the version from package.json and writes it to src/version.ts
 * Run automatically as a prebuild step.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = `v${pkg.version}`;

const content = `export const APP_VERSION = "${version}";\n`;
writeFileSync(join(root, 'src', 'version.ts'), content, 'utf8');

// Clean old dist/assets before build so stale hashed bundles don't accumulate
const distAssets = join(root, 'dist', 'assets');
if (existsSync(distAssets)) {
  try {
    rmSync(distAssets, { recursive: true, force: true });
  } catch (_) {}
}

console.log(`[sync-version] APP_VERSION synced → ${version}`);
