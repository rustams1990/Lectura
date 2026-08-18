/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * i18n Translation Integrity Checker
 * Recursively validates translation keys in ru, es, de against en (Source of Truth).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const EN_PATH = path.join(LOCALES_DIR, 'en', 'translation.json');

const TARGET_LANGS = ['ru', 'es', 'de', 'fr', 'pt', 'zh', 'it', 'ja', 'ko', 'pl', 'tr', 'uk'];

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read JSON at: ${filePath}`, err.message);
    process.exit(1);
  }
}

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getValueByPath(obj, pathStr) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

function runCheck() {
  console.log('🔍 Running i18n Translation Integrity Check...');
  console.log(`📖 Base language (Source of Truth): English (en)`);

  const enData = loadJson(EN_PATH);
  const enKeys = getAllKeys(enData);
  console.log(`📊 Total base keys in English: ${enKeys.length}\n`);

  let hasErrors = false;

  for (const lang of TARGET_LANGS) {
    const langPath = path.join(LOCALES_DIR, lang, 'translation.json');
    if (!fs.existsSync(langPath)) {
      console.error(`❌ [${lang.toUpperCase()}] Translation file missing: ${langPath}`);
      hasErrors = true;
      continue;
    }

    const langData = loadJson(langPath);
    const langKeys = getAllKeys(langData);

    const missingKeys = [];
    const emptyKeys = [];

    for (const key of enKeys) {
      const val = getValueByPath(langData, key);
      if (val === undefined) {
        missingKeys.push(key);
      } else if (typeof val === 'string' && val.trim() === '') {
        emptyKeys.push(key);
      }
    }

    const extraKeys = langKeys.filter((k) => !enKeys.includes(k));

    console.log(`--- [${lang.toUpperCase()}] (${langPath}) ---`);
    console.log(`   Keys present: ${langKeys.length} / ${enKeys.length}`);

    if (missingKeys.length > 0) {
      console.warn(`   ⚠️ Missing ${missingKeys.length} keys:`);
      missingKeys.slice(0, 10).forEach((k) => console.warn(`      - ${k}`));
      if (missingKeys.length > 10) console.warn(`      ...and ${missingKeys.length - 10} more.`);
      hasErrors = true;
    }

    if (emptyKeys.length > 0) {
      console.warn(`   ⚠️ Empty string values for ${emptyKeys.length} keys:`);
      emptyKeys.slice(0, 5).forEach((k) => console.warn(`      - ${k}`));
      hasErrors = true;
    }

    if (extraKeys.length > 0) {
      console.log(`   ℹ️ ${extraKeys.length} extra / obsolete keys found.`);
    }

    if (missingKeys.length === 0 && emptyKeys.length === 0) {
      console.log(`   ✅ 100% complete! All keys present.`);
    }
    console.log('');
  }

  if (hasErrors) {
    console.error('❌ Translation check failed with missing or empty keys.');
    process.exit(1);
  } else {
    console.log('🎉 All language translations are in sync and 100% complete!');
    process.exit(0);
  }
}

runCheck();
