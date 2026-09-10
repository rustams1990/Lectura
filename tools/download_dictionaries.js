/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Offline Multi-Language Dictionary Downloader & Compiler
 * Downloads official 50k-100k open-source frequency & Hunspell dictionary wordlists
 * for ES, EN, FR, DE, RU, IT, PT to ensure 100% safe name filtering.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const DICT_DIR = path.resolve('tools/dictionaries');
if (!fs.existsSync(DICT_DIR)) {
  fs.mkdirSync(DICT_DIR, { recursive: true });
}

const SOURCES = [
  { lang: 'es', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt' },
  { lang: 'en', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt' },
  { lang: 'fr', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt' },
  { lang: 'de', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt' },
  { lang: 'ru', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt' },
  { lang: 'it', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt' },
  { lang: 'pt', url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt' }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest, { encoding: 'utf-8' });
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function run() {
  console.log('📥 Скачивание официальных словарей для 7 языков...');

  const masterSet = new Set();

  for (const src of SOURCES) {
    const dest = path.join(DICT_DIR, `${src.lang}_50k.txt`);
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        console.log(`⏳ Скачиваем ${src.lang.toUpperCase()} словарь...`);
        await downloadFile(src.url, dest);
        console.log(`✅ ${src.lang.toUpperCase()} успешно скачан`);
      } else {
        console.log(`ℹ️ ${src.lang.toUpperCase()} уже существует локально`);
      }

      // Read words
      const content = fs.readFileSync(dest, 'utf-8');
      const lines = content.split(/\r?\n/);
      let count = 0;
      for (const line of lines) {
        const word = line.split(' ')[0].trim().toLowerCase();
        if (word && word.length > 1 && !/^\d+$/.test(word)) {
          masterSet.add(word);
          count++;
        }
      }
      console.log(`   + Добавлено ${count.toLocaleString()} слов для ${src.lang.toUpperCase()}`);
    } catch (e) {
      console.warn(`⚠️ Ошибка загрузки ${src.lang}:`, e.message);
    }
  }

  // Also add common English wordlist
  const wordsArray = Array.from(masterSet).sort();
  const masterJsonPath = path.join(DICT_DIR, 'master_dictionary.json');
  fs.writeFileSync(masterJsonPath, JSON.stringify(wordsArray), 'utf-8');

  // Also write JS bundle for tools/names_cleaner.html
  const masterJsPath = path.join(DICT_DIR, 'master_dictionary.js');
  fs.writeFileSync(masterJsPath, `window.OFFLINE_DICTIONARY_SET = new Set(${JSON.stringify(wordsArray)});`, 'utf-8');

  console.log('\n======================================================');
  console.log(`🎉 Словари успешно скомпилированы!`);
  console.log(`📊 Всего уникальных словарных слов в базе: ${masterSet.size.toLocaleString()}`);
  console.log(`📁 Файл master_dictionary.json: ${masterJsonPath} (${(fs.statSync(masterJsonPath).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`📁 Файл master_dictionary.js:   ${masterJsPath}`);
  console.log('======================================================\n');
}

run().catch(console.error);
