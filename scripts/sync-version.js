/**
 * sync-version.js
 * Reads the version from package.json and writes it to src/version.ts
 * Run automatically as a prebuild step.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = `v${pkg.version}`;

const content = `export const APP_VERSION = "${version}";\n`;
writeFileSync(join(root, 'src', 'version.ts'), content, 'utf8');

console.log(`[sync-version] APP_VERSION synced → ${version}`);
