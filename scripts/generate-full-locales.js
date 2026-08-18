/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const EN_PATH = path.join(LOCALES_DIR, 'en', 'translation.json');
const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));

function getAllKeyPaths(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getAllKeyPaths(v, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function setDeepValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p] || typeof curr[p] !== 'object') {
      curr[p] = {};
    }
    curr = curr[p];
  }
  curr[parts[parts.length - 1]] = value;
}

function getDeepValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

function cloneAndTranslate(source, translationDict) {
  const allPaths = getAllKeyPaths(source);
  const out = {};

  for (const p of allPaths) {
    const rawEn = getDeepValue(source, p);
    const existing = getDeepValue(translationDict, p);
    if (existing !== undefined && existing !== '') {
      setDeepValue(out, p, existing);
    } else {
      setDeepValue(out, p, rawEn);
    }
  }
  return out;
}

// Find all language folders in src/locales
const langDirs = fs.readdirSync(LOCALES_DIR).filter((dir) => {
  return fs.statSync(path.join(LOCALES_DIR, dir)).isDirectory() && dir !== 'en';
});

for (const lang of langDirs) {
  const langFilePath = path.join(LOCALES_DIR, lang, 'translation.json');
  let currentJson = {};
  if (fs.existsSync(langFilePath)) {
    try {
      currentJson = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    } catch (_) {}
  }
  const synced = cloneAndTranslate(en, currentJson);
  fs.writeFileSync(langFilePath, JSON.stringify(synced, null, 2), 'utf8');
  console.log(`✅ Synchronized [${lang.toUpperCase()}] to 100% parity with EN`);
}
