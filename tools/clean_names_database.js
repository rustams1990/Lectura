/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone High-Speed Names Sanitizer
 * Filters raw baby names / census datasets against real multi-language dictionaries
 * so that common dictionary words (Princess, Hope, Will, May, Rosa, Esperanza, etc.)
 * are NOT accidentally filtered out in Lectura.
 * 
 * Usage:
 *   node tools/clean_names_database.js <path_to_input_file> [output_file.json]
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

// 1. Core Blacklist of dictionary words that frequently appear as names/surnames
const COMMON_DICTIONARY_WORDS = new Set([
  // English words & titles
  'able', 'ace', 'art', 'baron', 'best', 'bird', 'blade', 'blessing', 'blue', 'bright', 'brown', 'buddy', 'busy',
  'candy', 'case', 'cash', 'chance', 'clay', 'clear', 'cliff', 'clover', 'cook', 'counsel', 'courage', 'cross', 'crystal',
  'daily', 'danger', 'dark', 'dawn', 'day', 'deal', 'dear', 'diamond', 'divine', 'dodge', 'dream', 'duke', 'dusty',
  'early', 'earth', 'east', 'easy', 'echo', 'edge', 'fancy', 'favor', 'flash', 'fleet', 'flint', 'fortune', 'fox',
  'frank', 'free', 'fresh', 'frost', 'gale', 'gardener', 'gem', 'gift', 'glory', 'gold', 'golden', 'grace', 'grand',
  'gray', 'grey', 'green', 'guide', 'gull', 'gunner', 'handy', 'harbor', 'hardy', 'harmony', 'haven', 'heart', 'heaven',
  'hero', 'hill', 'holly', 'holy', 'honest', 'honey', 'hope', 'hunter', 'ideal', 'iron', 'ivy', 'jewel', 'joy', 'judge',
  'july', 'june', 'just', 'justice', 'keen', 'king', 'knight', 'lake', 'lane', 'lark', 'lead', 'leaf', 'liberty', 'light',
  'lily', 'little', 'lively', 'lock', 'lord', 'love', 'loyal', 'lucky', 'magic', 'major', 'manly', 'march', 'mark',
  'mason', 'master', 'matrix', 'may', 'mayor', 'meadow', 'mercy', 'merit', 'miller', 'minor', 'mint', 'miracle',
  'modest', 'monday', 'money', 'moon', 'morning', 'moss', 'mount', 'noble', 'noon', 'north', 'novel', 'nurse', 'ocean',
  'olive', 'orange', 'page', 'palace', 'palm', 'park', 'parker', 'parson', 'pastor', 'patent', 'patience', 'peace',
  'peak', 'pearl', 'peer', 'penny', 'perfection', 'pilot', 'piper', 'plain', 'pleasant', 'plenty', 'poet', 'polar',
  'pope', 'porter', 'power', 'praise', 'prayer', 'prince', 'princess', 'prior', 'promise', 'proud', 'prudence', 'pure',
  'queen', 'quest', 'quick', 'rain', 'ranger', 'ray', 'reason', 'red', 'reed', 'reid', 'reign', 'remedy', 'rich',
  'rider', 'ridge', 'ring', 'river', 'robin', 'rock', 'rose', 'royal', 'ruby', 'ruler', 'runner', 'rush', 'rust',
  'sage', 'sailor', 'saint', 'sand', 'sandy', 'sargent', 'savior', 'scarlet', 'scout', 'seal', 'season', 'secret',
  'senior', 'serene', 'serenity', 'shade', 'shadow', 'sharp', 'shepherd', 'shield', 'shine', 'ship', 'shore', 'short',
  'silver', 'simple', 'singer', 'sky', 'smart', 'smile', 'smith', 'smoke', 'snow', 'soldier', 'sole', 'solitude',
  'song', 'soul', 'sound', 'south', 'spark', 'sparrow', 'spear', 'speed', 'spirit', 'spring', 'spur', 'square', 'star',
  'steel', 'steer', 'sterling', 'stone', 'storm', 'story', 'stout', 'stream', 'street', 'strong', 'sugar', 'summer',
  'sun', 'sunday', 'sunny', 'supreme', 'sweet', 'swift', 'sword', 'tailor', 'tale', 'talent', 'target', 'taylor', 'teal',
  'temperance', 'temple', 'tender', 'thistle', 'thorn', 'thunder', 'tide', 'tiger', 'timber', 'time', 'top', 'tower',
  'trace', 'track', 'trader', 'trail', 'treasure', 'tree', 'tribute', 'trinity', 'trip', 'triumph', 'true', 'trust',
  'truth', 'turner', 'twin', 'union', 'unity', 'vale', 'valley', 'valor', 'vanilla', 'velvet', 'venture', 'verse',
  'vessel', 'veteran', 'vibe', 'vicar', 'victor', 'victory', 'view', 'vigor', 'village', 'vintage', 'violet', 'virtue',
  'vision', 'voice', 'voyage', 'waif', 'walker', 'wall', 'war', 'ward', 'warden', 'warrior', 'watch', 'water', 'wave',
  'way', 'weaver', 'welcome', 'well', 'west', 'wheat', 'wheel', 'whisper', 'white', 'wild', 'will', 'willow', 'wind',
  'wine', 'wing', 'winner', 'winter', 'wisdom', 'wise', 'wish', 'wolf', 'wonder', 'wood', 'wool', 'word', 'worker',
  'world', 'worth', 'worthy', 'wren', 'wright', 'yard', 'year', 'yield', 'young', 'youth', 'zeal', 'zenith',
  'bill', 'gene', 'pat', 'sue', 'cat', 'don', 'guy', 'bob', 'dale', 'carol', 'daisy', 'foster', 'butler', 'cook',
  'abbot', 'monk', 'priest', 'clerk', 'essence', 'laurel', 'haven', 'destiny', 'heaven', 'flea', 'fly', 'bee', 'wasp', 'ant', 'beetle',

  // Spanish words (nouns, adjectives, virtues)
  'alma', 'almond', 'rosa', 'blanca', 'dolores', 'esperanza', 'sol', 'victoria', 'cruz', 'angel', 'flor', 'luz', 'mercedes', 'pilar', 'paz',
  'soledad', 'amparo', 'consuelo', 'marina', 'clara', 'dulce', 'gloria', 'gracia', 'reina', 'rocio', 'santos', 'serena',
  'valentin', 'socorro', 'remedios', 'milagros', 'nieves', 'asuncion', 'concepcion', 'encarnacion', 'inmaculada', 'trinidad',
  'camino', 'estrella', 'cielo', 'mar', 'rio', 'valle', 'monte', 'sierra', 'pena', 'castillo', 'torre', 'fuente', 'iglesia',
  'cruz', 'rey', 'conde', 'duque', 'caballero', 'escudero', 'pastor', 'vaquero', 'marinero', 'herrero', 'carpintero', 'zapatero',
  'molinero', 'panadero', 'carnicero', 'pescador', 'cazador', 'leñador', 'minero', 'tejedor', 'sastre', 'barbero', 'medico',
  'bello', 'hermoso', 'lindo', 'bueno', 'santo', 'justo', 'noble', 'franco', 'leal', 'fiel', 'bravo', 'fuerte', 'valiente',
  'grande', 'chico', 'pequeno', 'alto', 'bajo', 'gordo', 'flaco', 'rubio', 'moreno', 'castano', 'cano', 'calvo', 'tuerto',
  'berry', 'cherry', 'cinnamon', 'clove', 'coco', 'ginger', 'hazel', 'honey', 'jasmine', 'lemon', 'maple', 'nutmeg', 'peach', 'pepper', 'plum', 'rosemary', 'saffron', 'sugar', 'sweet',

  // Russian common words
  'вера', 'надежда', 'любовь', 'лев', 'светлана', 'роза', 'май', 'слава', 'лилия', 'роман', 'полина', 'марина', 'свет',
  'мир', 'воля', 'доля', 'заря', 'луна', 'звезда', 'весна', 'лето', 'осень', 'зима', 'день', 'ночь', 'утро', 'вечер',

  // French, German, Italian, Portuguese common words
  'pierre', 'sole', 'franco', 'bruno', 'march', 'soleil', 'lune', 'fleur', 'rose', 'blanc', 'noir', 'petit', 'grand',
  'sonne', 'mond', 'stern', 'blume', 'rose', 'weiss', 'schwarz', 'klein', 'gross', 'sole', 'luna', 'stella', 'fiore',
  'rosa', 'bianco', 'nero', 'piccolo', 'grande', 'sol', 'lua', 'estrela', 'flor', 'rosa', 'branco', 'preto', 'pequeno'
]);

// Countries and demonyms (Blacklist)
const COUNTRIES_AND_DEMONYMS = new Set([
  'spain', 'españa', 'germany', 'alemania', 'france', 'francia', 'italy', 'italia', 'russia', 'rusia', 'россия',
  'china', 'japan', 'japon', 'mexico', 'méxico', 'usa', 'uk', 'canada', 'brazil', 'argentina', 'colombia', 'peru',
  'perú', 'america', 'europe', 'asia', 'africa', 'australia', 'india', 'egypt', 'greece', 'turkey', 'sweden', 'norway'
]);

/**
 * Clean & normalize a raw line/token into a proper name
 */
function extractNameFromLine(line) {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // Handle CSV format: 2008,"Alannah",0.00014,"girl" or 2008,Alannah,0.00014,girl
  const csvMatch = trimmed.match(/^"?\d{4}"?,\s*"?([a-zA-Z\u00C0-\u024F\u0400-\u04FF'-]+)"?/);
  if (csvMatch) {
    return csvMatch[1];
  }

  // Handle JSON array or simple quotes: "Alannah",
  const quoteMatch = trimmed.match(/^["']([a-zA-Z\u00C0-\u024F\u0400-\u04FF'-]+)["'],?/);
  if (quoteMatch) {
    return quoteMatch[1];
  }

  // Handle CSV comma split fallback
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',');
    for (const part of parts) {
      const clean = part.replace(/["'\r\n\t]/g, '').trim();
      // If it's a valid alphabetic word and not a number / gender
      if (/^[a-zA-Z\u00C0-\u024F\u0400-\u04FF]{2,}$/.test(clean) && clean !== 'girl' && clean !== 'boy' && isNaN(Number(clean))) {
        return clean;
      }
    }
  }

  // Plain word fallback
  const clean = trimmed.replace(/["'\r\n\t,;]/g, '').trim();
  if (/^[a-zA-Z\u00C0-\u024F\u0400-\u04FF]{2,}$/.test(clean)) {
    return clean;
  }

  return null;
}

/**
 * Main execution
 */
async function processFile() {
  const args = process.argv.slice(2);
  const inputFile = args[0];
  const outputFile = args[1] || 'names_clean_universal.json';
  const reportFile = 'names_rejected_report.txt';

  if (!inputFile) {
    console.log(`
======================================================
  Lectura Names Sanitizer & Dictionary Cleaner
======================================================
Использование:
  node tools/clean_names_database.js <путь_к_файлу> [выходной_файл.json]

Пример:
  node tools/clean_names_database.js "C:\\Users\\User\\Downloads\\names.csv" "src\\data\\ignoreLists\\universal\\names.json"
======================================================
`);
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Ошибка: Файл не найден: ${inputFile}`);
    process.exit(1);
  }

  console.log(`\n🚀 Начинаем обработку файла: ${inputFile}`);
  
  // Load Master Offline Dictionary if present
  const masterJsonPath = path.resolve('tools/dictionaries/master_dictionary.json');
  if (fs.existsSync(masterJsonPath)) {
    try {
      const rawDict = JSON.parse(fs.readFileSync(masterJsonPath, 'utf-8'));
      rawDict.forEach(w => COMMON_DICTIONARY_WORDS.add(w));
      console.log(`📚 Подключен офлайн-словарь: ${rawDict.length.toLocaleString()} слов 7 языков!`);
    } catch (e) {
      console.warn('⚠️ Не удалось загрузить master_dictionary.json:', e.message);
    }
  }

  console.log(`⏳ Сканируем 258 000+ строк и отсеиваем словарные слова...`);

  const cleanNamesSet = new Set();
  const rejectedList = [];
  let totalLines = 0;

  const fileStream = fs.createReadStream(inputFile, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    totalLines++;
    const rawName = extractNameFromLine(line);
    if (!rawName) continue;

    const lower = rawName.toLowerCase().trim();

    // Rule 1: Too short (<= 2 chars: al, ed, ty, jo, an, etc.)
    if (lower.length <= 2) {
      rejectedList.push(`${rawName} -> [Слишком короткое (<= 2 букв)]`);
      continue;
    }

    // Rule 2: Dictionary word match
    if (COMMON_DICTIONARY_WORDS.has(lower)) {
      rejectedList.push(`${rawName} -> [Совпадение со словарным словом / добродетелью]`);
      continue;
    }

    // Rule 3: Country / Demonym
    if (COUNTRIES_AND_DEMONYMS.has(lower)) {
      rejectedList.push(`${rawName} -> [Название страны / региона]`);
      continue;
    }

    // Valid pure proper name
    cleanNamesSet.add(lower);
  }

  // Sort clean names alphabetically
  const sortedCleanNames = Array.from(cleanNamesSet).sort((a, b) => a.localeCompare(b));

  // Write clean output JSON
  fs.writeFileSync(outputFile, JSON.stringify(sortedCleanNames, null, 2), 'utf-8');

  // Write rejection report
  fs.writeFileSync(reportFile, rejectedList.join('\n'), 'utf-8');

  console.log(`\n======================================================`);
  console.log(`🎉 ОБРАБОТКА УСПЕШНО ЗАВЕРШЕНА!`);
  console.log(`======================================================`);
  console.log(`📊 Всего обработано строк:       ${totalLines.toLocaleString()}`);
  console.log(`✅ Чистых уникальных имён сохранено: ${sortedCleanNames.length.toLocaleString()}`);
  console.log(`🛡️ Отсеяно опасных словарных слов: ${rejectedList.length.toLocaleString()}`);
  console.log(`📁 Готовый файл JSON:             ${path.resolve(outputFile)}`);
  console.log(`📋 Отчет об отсеянных словах:    ${path.resolve(reportFile)}`);
  console.log(`======================================================\n`);
}

processFile().catch(console.error);
