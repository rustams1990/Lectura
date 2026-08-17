/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Blacklist of forbidden countries and dictionary homonyms
const PROTECTED = new Set([
  'apple', 'zoom', 'nice', 'valve', 'blizzard', 'steam', 'switch', 'hades',
  'celeste', 'canon', 'safari', 'docker', 'chrome', 'edge', 'opera', 'led',
  'ram', 'war', 'god', 'boss', 'drop', 'loot', 'cool', 'like', 'link',
  'chat', 'cloud', 'server', 'stream', 'style', 'team', 'party', 'test',
  'brand', 'meeting', 'deadline', 'target', 'gap', 'shell', 'oracle', 'subway',
  'chase', 'bell', 'deal', 'dell', 'reading', 'bath', 'split', 'intel',
  'discord', 'fedora', 'overwatch', 'insomniac', 'play', 'tree', 'skill',
  'music', 'guerra', 'box', 'boxes', 'boxing', 'will', 'may', 'bill', 'grace',
  'hope', 'rose', 'mark', 'rich', 'faith', 'joy', 'art', 'rosa', 'blanca',
  'dolores', 'esperanza', 'sol', 'victoria', 'cruz', 'angel', 'flor', 'luz',
  'spain', 'españa', 'germany', 'alemania', 'france', 'francia', 'italy', 'italia',
  'russia', 'rusia', 'россия', 'china', 'japan', 'japon', 'mexico', 'méxico',
  'usa', 'uk', 'canada', 'brazil', 'argentina', 'colombia', 'peru', 'perú'
]);

/**
 * Parses raw text, cleans and deduplicates words.
 */
export function formatWordsToCleanArray(rawText) {
  if (!rawText) return [];

  // Split by whitespace, commas, quotes, brackets, newlines
  const tokens = rawText.split(/[\r\n,;\t"'/\\()[\]{}|<>+=*&^%$#@!~`?:]+|\s+/);
  const resultSet = new Set();

  for (const token of tokens) {
    const clean = token.trim().toLowerCase();
    // Validate: single word without spaces, minimum 2 chars, letters/dashes only, not in protected list
    if (clean.length >= 2 && !clean.includes(' ') && !PROTECTED.has(clean)) {
      resultSet.add(clean);
    }
  }

  return Array.from(resultSet).sort();
}

// CLI usage: node format_ignore_list.js <input.txt> [output.json]
const args = process.argv.slice(2);

if (args.length > 0) {
  const inputFile = path.resolve(args[0]);
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Файл не найден: ${inputFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, 'utf-8');
  const cleanList = formatWordsToCleanArray(raw);

  const outputFile = args[1] 
    ? path.resolve(args[1]) 
    : path.join(path.dirname(inputFile), `${path.basename(inputFile, path.extname(inputFile))}.json`);

  fs.writeFileSync(outputFile, JSON.stringify(cleanList, null, 2), 'utf-8');
  console.log(`✅ Успешно обработано!`);
  console.log(`📊 Исходный файл: ${inputFile}`);
  console.log(`📁 Сохранено в: ${outputFile}`);
  console.log(`🔢 Уникальных чистых слов: ${cleanList.length}`);
} else {
  console.log(`
Использование:
  node tools/format_ignore_list.js <input.txt> [output.json]

Пример:
  node tools/format_ignore_list.js my_words.txt src/data/ignoreLists/es/gaming.json
`);
}
